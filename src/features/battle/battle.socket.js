import { EVENTS } from "../../socket/events.js";
import { getBattle, deleteBattle } from "./battle.store.js";
import { endMatch } from "../match/match.store.js";
import { applyAttack } from "./battle.engine.js";

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

    socket.on(EVENTS.BATTLE_ATTACK, ({ matchId } = {}) => {
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

        if (state.phase === "FINISHED") {
            // emit final state first
            io.to(state.roomId).emit(EVENTS.BATTLE_STATE, { matchId, state, events });

            // cleanup after short delay so clients receive it
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
}