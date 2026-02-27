import { logger } from "../../shared/logger.js";
import { EVENTS } from "../../socket/events.js";
import { lobbyGetSocketIdByUserId } from "../lobby/lobby.store.js";
import {
    hasActiveMatch,
    createInvite,
    getInvite,
    clearInvite,
    clearInvitesFromOrigin,
    getInvitesFromOrigin,
    createMatch,
} from "./match.store.js";


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

        // Send match invite over.
        createInvite(targetUserId, me);

        io.to(targetSocketId).emit(EVENTS.MATCH_INVITE, {
            fromUserId: me.id,
            fromName: me.name,
        });
    });

    socket.on(EVENTS.MATCH_ACCEPT, ({ fromUserId } = {}) => {
        const me = socket.data.user;
        if (!me) return socket.emit(EVENTS.ERROR, { code: "NO_AUTH", msg: "Login first" });

        const invite = getInvite(me.id); // invite stored by target (me)

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

        const { matchId, roomId } = createMatch({ id: fromUserId }, { id: me.id });

        socket.join(roomId);
        io.sockets.sockets.get(fromSocketId)?.join(roomId);

        clearInvite(me.id);

        io.to(roomId).emit(EVENTS.MATCH_START, {
            matchId,
            roomId,
            p1: { id: fromUserId, name: invite.originName }, // inviter
            p2: { id: me.id, name: me.name },                // accepter
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
