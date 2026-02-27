// src/features/presence/presence.socket.js
import { logger } from "../../shared/logger.js";
import { EVENTS } from "../../socket/events.js";
import { lobbyList, lobbyRemove } from "./lobby.store.js";

export function lobbyBroadcast(io) {
    //logger.info(`Current Users: ${JSON.stringify(lobbyList())}`);
    io.emit(EVENTS.LOBBY_UPDATED, { users: lobbyList() });
}

export function registerLobbySocket(io, socket) {
    socket.on(EVENTS.LOBBY_LIST, () => {
        socket.emit(EVENTS.LOBBY_USERS, { users: lobbyList() });
    });

    socket.on("disconnect", () => {
        const removed = lobbyRemove(socket);
        if (removed) lobbyBroadcast(io);
    });
}
