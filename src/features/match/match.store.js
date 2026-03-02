import { DateTime } from "luxon";
import { createBattle } from "../battle/battle.store.js";
import { v4 as uuidv4 } from 'uuid';

const pendingInvites = new Map();
const activeMatchesByUser = new Map();
const matches = new Map();

export function hasActiveMatch(userId) {
    return activeMatchesByUser.has(userId);
}

export function createInvite(targetUser, originUser) {
    pendingInvites.set(targetUser, {
        originId: originUser.id,
        originName: originUser.name,
        cdate: DateTime.utc().toISO()
    })
}

export function getInvite(targetUser) {
    return pendingInvites.get(targetUser);
}

export function endMatch(matchId) {
    const m = matches.get(matchId);
    if (!m) return;
    activeMatchesByUser.delete(m.p1Id);
    activeMatchesByUser.delete(m.p2Id);
    matches.delete(matchId);
}

export function clearInvite(targetUser) {
    pendingInvites.delete(targetUser);
}

export function clearInvitesFromOrigin(originId) {
    for (const [targetId, inv] of pendingInvites.entries()) {
        if (inv.originId === originId) pendingInvites.delete(targetId);
    }
}

export function getInvitesFromOrigin(originId) {
    const out = [];
    for (const [targetId, inv] of pendingInvites.entries()) {
        if (inv.originId === originId) out.push({ targetId, inv });
    }
    return out;
}

export function getActiveMatchId(userId) {
    return activeMatchesByUser.get(userId);
}

export function createMatch(p1, p2) {
    const matchId = uuidv4();
    const roomId = `match_${matchId}`;

    matches.set(matchId, { roomId: roomId, p1Id: p1.id, p2Id: p2.id });

    activeMatchesByUser.set(p1.id, matchId);
    activeMatchesByUser.set(p2.id, matchId);

    return { matchId, roomId };
}