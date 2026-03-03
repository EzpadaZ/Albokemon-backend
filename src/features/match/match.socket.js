import { logger } from "../../shared/logger.js";
import { EVENTS } from "../../socket/events.js";
import { lobbyGetSocketIdByUserId } from "../lobby/lobby.store.js";
import { assignPokemonsForMatch } from "../battle/pokemon.service.js";
import { createBattle } from "../battle/battle.store.js";
import {
    hasActiveMatch,
    createInvite,
    getInvite,
    clearInvite,
    clearInvitesFromOrigin,
    getInvitesFromOrigin,
    createMatch,
    endMatch
} from "./match.store.js";

import { getDb } from "../../shared/mongo.js";


export function registerMatchSocket(io, socket) {
    socket.on(EVENTS.MATCH_REQUEST, ({ targetUserId } = {}) => {
        const me = socket.data.user;

        if (!me) return socket.emit(EVENTS.ERROR, { code: "NO_AUTH", msg: "Unauthorized Request" });
        if (!targetUserId) return socket.emit(EVENTS.ERROR, { code: "BAD_REQ", msg: "Missing target" });
        if (targetUserId === me.id) return socket.emit(EVENTS.ERROR, { code: "BAD_REQ", msg: "Can't battle self" });

        if (hasActiveMatch(me.id)) return socket.emit(EVENTS.ERROR, { code: "IN_MATCH", msg: "You are already in a match" });
        if (hasActiveMatch(targetUserId)) return socket.emit(EVENTS.ERROR, { code: "IN_MATCH", msg: "Target already in a match" });

        const targetSocketId = lobbyGetSocketIdByUserId(targetUserId);
        if (!targetSocketId) return socket.emit(EVENTS.ERROR, { code: "OFFLINE", msg: "User is not connected" });

        if (getInvite(targetUserId)) {
            return socket.emit(EVENTS.ERROR, {
                code: "TARGET_BUSY",
                msg: "User already has a pending invite",
            });
        }

        const outgoing = getInvitesFromOrigin(me.id);
        if (outgoing.length > 0) {
            return socket.emit(EVENTS.ERROR, { code: "YOU_BUSY", msg: "You already sent an invite" });
        }

        if (getInvitesFromOrigin(targetUserId).length > 0) {
            return socket.emit(EVENTS.ERROR, { code: "TARGET_BUSY", msg: "User is sending an invite" });
        }

        // Send match invite over.
        createInvite(targetUserId, me);

        io.to(targetSocketId).emit(EVENTS.MATCH_INVITE, {
            fromUserId: me.id,
            fromName: me.name,
        });
    });

    socket.on(EVENTS.MATCH_ACCEPT, async ({ fromUserId } = {}) => {
        const me = socket.data.user;
        if (!me) return socket.emit(EVENTS.ERROR, { code: "NO_AUTH", msg: "Login first" });

        const invite = getInvite(me.id);
        if (!invite || invite.originId !== fromUserId) {
            return socket.emit(EVENTS.ERROR, { code: "NO_INVITE", msg: "No pending invite" });
        }

        const fromSocketId = lobbyGetSocketIdByUserId(fromUserId);
        if (!fromSocketId) {
            clearInvite(me.id);
            return socket.emit(EVENTS.ERROR, { code: "OFFLINE", msg: "Inviter went offline" });
        }

        if (hasActiveMatch(me.id) || hasActiveMatch(fromUserId)) {
            clearInvite(me.id);
            return socket.emit(EVENTS.ERROR, { code: "IN_MATCH", msg: "Someone already in a match" });
        }

        // 1) Create match + room
        const { matchId, roomId } = createMatch({ id: fromUserId }, { id: me.id });

        // 2) Join both sockets to room
        socket.join(roomId);
        const inviterSocket = io.sockets.sockets.get(fromSocketId);
        inviterSocket?.join(roomId);

        // 3) Resolve inviter user object (id+name)
        const inviterUser = inviterSocket?.data?.user ?? { id: fromUserId, name: invite.originName };

        // 4) Clear invite now that match is accepted
        clearInvite(me.id);

        // 5) Fetch pokemons & split 3/3
        let teams;

        try {
            teams = await assignPokemonsForMatch();
        } catch (e) {
            const code = "POKEMON_API_FAIL";
            const msg = `Failed to assign pokemons: ${e?.message ?? e}`;

            endMatch(matchId); // matchId always exists here

            // leave room to avoid leaking membership
            socket.leave(roomId);
            inviterSocket?.leave(roomId);

            socket.emit(EVENTS.ERROR, { code, msg });
            socket.emit(EVENTS.MATCH_DECLINED, { byUserId: me.id, reason: "error" });

            io.to(fromSocketId).emit(EVENTS.ERROR, { code, msg });
            io.to(fromSocketId).emit(EVENTS.MATCH_DECLINED, { byUserId: me.id, reason: "error" });

            return;
        }

        // 6) Create battle state in memory
        const battleState = createBattle({
            matchId,
            roomId,
            p1: { id: inviterUser.id, name: inviterUser.name },
            p2: { id: me.id, name: me.name },
            p1Team: teams.p1Team,
            p2Team: teams.p2Team,
        });

        // 6.5 Create match doc
        try {
            const db = getDb();
            await db.collection("matches").updateOne(
                { _id: matchId },
                {
                    $setOnInsert: {
                        roomId,
                        challengerName: inviterUser.name,
                        challengedName: me.name,
                        cdate: new Date(),
                        winnerId: null,
                        endReason: null,
                        events: [],

                        // ✅ store full teams
                        challengerPokedex: teams.p1Team, // 3 pokemons
                        challengedPokedex: teams.p2Team, // 3 pokemons

                        // ✅ who has the faster active pokemon + who starts first
                        fasterPokemon: (() => {
                            const p1 = teams.p1Team?.[0];
                            const p2 = teams.p2Team?.[0];
                            const s1 = Number(p1?.speed ?? 0);
                            const s2 = Number(p2?.speed ?? 0);

                            if (s1 > s2) return { owner: "challenger", pokemon: { id: p1.id, name: p1.name, speed: s1 } };
                            if (s2 > s1) return { owner: "challenged", pokemon: { id: p2.id, name: p2.name, speed: s2 } };
                            return { owner: "tie", pokemon: null };
                        })(),

                        firstTurn: (() => {
                            const firstId = battleState.turnUserId;
                            if (firstId === inviterUser.id) return inviterUser.name;
                            if (firstId === me.id) return me.name;
                            return "unknown";
                        })(), // ✅ authoritative from battle init (speed rule)
                    },
                    $set: { udate: new Date() },
                },
                { upsert: true }
            );
        } catch (e) {
            logger.error(e);
        }

        // 7) Notify both clients: match/start (so both are in "battle" view)
        io.to(roomId).emit(EVENTS.MATCH_START, {
            matchId,
            roomId,
            p1: { id: inviterUser.id, name: inviterUser.name },
            p2: { id: me.id, name: me.name },
            pokemonByPlayerId: {
                [inviterUser.id]: teams.p1Team,
                [me.id]: teams.p2Team,
            },
        });

        // 8) Initial battle snapshot
        io.to(roomId).emit(EVENTS.BATTLE_STATE, {
            matchId,
            state: battleState,
            events: [],
        });
    });

    socket.on(EVENTS.MATCH_DECLINE, ({ fromUserId } = {}) => {
        const me = socket.data.user;
        if (!me) return;

        const invite = getInvite(me.id);
        if (!invite || invite.originId !== fromUserId) return;

        clearInvite(me.id);

        const fromSocketId = lobbyGetSocketIdByUserId(fromUserId);
        if (fromSocketId) {
            io.to(fromSocketId).emit(EVENTS.MATCH_DECLINED, { byUserId: me.id });
        }
    });

    socket.on("disconnect", () => {
        const me = socket.data.user;
        if (!me) return;

        // 1) If I was the TARGET of an invite, notify the origin
        const invToMe = getInvite(me.id);
        if (invToMe) {
            logger.info("Cancelled incoming matches");
            const originSocketId = lobbyGetSocketIdByUserId(invToMe.originId);
            if (originSocketId) {
                io.to(originSocketId).emit(EVENTS.MATCH_DECLINED, {
                    byUserId: me.id,
                    reason: "offline",
                });
            }
            clearInvite(me.id);
        }

        // 2) If I was the ORIGIN of invites, notify each target
        const outgoing = getInvitesFromOrigin(me.id);
        for (const { targetId } of outgoing) {
            //logger.info(`Cancelled outgoing matches ${targetId}`);
            const targetSocketId = lobbyGetSocketIdByUserId(targetId);
            if (targetSocketId) {
                io.to(targetSocketId).emit(EVENTS.MATCH_DECLINED, {
                    byUserId: me.id,
                    reason: "offline",
                });
            }
            clearInvite(targetId);
        }
    });
}
