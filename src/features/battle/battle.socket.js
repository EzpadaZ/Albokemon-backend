import { EVENTS } from "../../socket/events.js";
import { getBattle, deleteBattle } from "./battle.store.js";
import { getActiveMatchId, endMatch } from "../match/match.store.js";
import { applyAttack } from "./battle.engine.js";
import { getDb } from "../../shared/mongo.js";

export function registerBattleSocket(io, socket) {

    socket.on(EVENTS.BATTLE_SYNC, ({ matchId } = {}) => {

        const me = socket.data.user;
        if (!me) return socket.emit(EVENTS.ERROR, { code: "NO_AUTH", msg: "Unauthorized" });
        if (!matchId) return socket.emit(EVENTS.ERROR, { code: "BAD_REQ", msg: "Missing matchId" });

        const state = getBattle(matchId);
        if (!state) return socket.emit(EVENTS.ERROR, { code: "NO_BATTLE", msg: "Battle not found" });

        if (!state.players[me.id]) return socket.emit(EVENTS.ERROR, { code: "NOT_IN_MATCH", msg: "Not in this match" });

        socket.emit(EVENTS.BATTLE_STATE, { matchId, state, events: [] });
    });

    socket.on(EVENTS.BATTLE_ATTACK, async ({ matchId } = {}) => {
        const me = socket.data.user;
        if (!me) return socket.emit(EVENTS.ERROR, { code: "NO_AUTH", msg: "Unauthorized" });
        if (!matchId) return socket.emit(EVENTS.ERROR, { code: "BAD_REQ", msg: "Missing matchId" });

        const state = getBattle(matchId);
        if (!state) return socket.emit(EVENTS.ERROR, { code: "NO_BATTLE", msg: "Battle not found" });
        if (state.phase !== "ACTIVE") return socket.emit(EVENTS.ERROR, { code: "FINISHED", msg: "Battle finished" });

        if (!state.players[me.id]) {
            return socket.emit(EVENTS.ERROR, { code: "NOT_IN_MATCH", msg: "Not in this match" });
        }

        if (state.turnUserId !== me.id) {
            return socket.emit(EVENTS.ERROR, { code: "NOT_YOUR_TURN", msg: "Not your turn" });
        }

        const events = applyAttack(state, me.id);

        // Mongo Storage.
        state.eventsLog.push({ type: "attack", ts: new Date(), by: me.id });
        for (const e of events) {
            state.eventsLog.push({ ...e, ts: new Date() });
        }

        if (state.phase === "FINISHED") {
            io.to(state.roomId).emit(EVENTS.BATTLE_STATE, { matchId, state, events });

            try {
                const db = getDb();
                await db.collection("matches").updateOne(
                    { _id: matchId },
                    {
                        $set: {
                            udate: new Date(),
                            winnerId: state.winnerId,
                            endReason: "ko",
                            events: state.eventsLog, // simplest: overwrite full array
                        },
                    }
                );
            } catch (e) {
                console.error("Failed to persist match", e);
            }

            setTimeout(() => {
                deleteBattle(matchId);
                endMatch(matchId);
            }, 2000);

            return;
        }

        io.to(state.roomId).emit(EVENTS.BATTLE_STATE, {
            matchId,
            state,
            events,
        });
    });

    socket.on("disconnect", async (reason) => {
        const me = socket.data.user;
        if (!me) return;

        const matchId = getActiveMatchId(me.id);
        if (!matchId) return;

        const state = getBattle(matchId);
        if (!state) {
            endMatch(matchId);
            return;
        }

        if (state.phase === "FINISHED") return;

        const playerIds = Object.keys(state.players);
        const opponentId = playerIds.find((id) => id !== me.id);
        if (!opponentId) return;

        state.phase = "FINISHED";
        state.winnerId = opponentId;

        state.eventsLog ??= [];

        state.eventsLog.push({ type: "disconnect", ts: new Date(), who: me.id, reason });
        state.eventsLog.push({
            type: "win",
            ts: new Date(),
            winnerId: opponentId,
            loserId: me.id,
            reason: "opponent_disconnected",
        });

        const events = [
            { type: "disconnect", who: me.id, reason },
            { type: "win", winnerId: opponentId, loserId: me.id, reason: "opponent_disconnected" },
        ];

        io.to(state.roomId).emit(EVENTS.BATTLE_STATE, { matchId, state, events });

        // ✅ persist once
        try {
            const db = getDb();
            await db.collection("matches").updateOne(
                { _id: matchId },
                {
                    $set: {
                        udate: new Date(),
                        winnerId: state.winnerId,
                        endReason: "disconnect",
                        events: state.eventsLog, // overwrite final event log
                    },
                }
            );
        } catch (e) {
            console.error("Failed to persist match (disconnect)", e);
        }

        setTimeout(() => {
            deleteBattle(matchId);
            endMatch(matchId);
        }, 1500);
    });
}