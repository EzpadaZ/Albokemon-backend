import { registerAuthSocket } from "../features/auth/auth.socket.js";
import { registerLobbySocket } from "../features/lobby/lobby.socket.js";
import { registerMatchSocket } from "../features/match/match.socket.js";
import { registerBattleSocket } from "../features/battle/battle.socket.js";
import { logger } from "../shared/logger.js";

export function registerSocketHandlers(io) {
    io.on("connection", (socket) => {
        const rawIp =
            socket.handshake.address ||
            socket.request?.socket?.remoteAddress;

        const ip = rawIp?.startsWith("::ffff:") ? rawIp.slice(7) : rawIp;

        const port =
            socket.request?.socket?.remotePort ??
            socket.conn?.transport?.socket?._socket?.remotePort ??
            "unknown";

        const originalOn = socket.on.bind(socket);
        socket.on = (event, handler) => {
            // wrap the handler so we log whenever the event is received
            return originalOn(event, (...args) => {
                logger.info(
                    `[RCV] E=${event} [${ip}:${port}]`
                );
                return handler(...args);
            });
        };

        const originalEmit = socket.emit.bind(socket);
        socket.emit = (event, ...args) => {
            logger.info(
                `[ACK] E=${event} [${ip}:${port}]`
            );
            return originalEmit(event, ...args);
        };

        registerAuthSocket(io, socket);
        registerLobbySocket(io, socket);
        registerMatchSocket(io, socket);
        registerBattleSocket(io, socket);

        socket.on("disconnect", (reason) => {

        });
    });
}

function safeArgs(args) {
    try {
        // avoid huge spam
        const trimmed = args.map((a) => (typeof a === "string" ? a : a));
        return JSON.stringify(trimmed).slice(0, 500);
    } catch {
        return "[unserializable]";
    }
}
