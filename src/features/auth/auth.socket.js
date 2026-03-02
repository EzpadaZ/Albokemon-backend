import { EVENTS } from "../../socket/events.js";
import { createUser } from "./auth.service.js";
import { lobbyAdd, lobbyList } from "../lobby/lobby.store.js";
import { lobbyBroadcast } from "../lobby/lobby.socket.js";
import { logger } from "../../shared/logger.js";
import { getDb } from "../../shared/mongo.js";

export function registerAuthSocket(io, socket) {
    socket.on(EVENTS.AUTH_LOGIN, async ({ name, metadata } = {}) => {
        let desired = String(name ?? "Guest").trim().slice(0, 8);
        if (!desired) desired = "Guest";

        const uniqueName = makeUniqueName(desired, lobbyList());

        const user = createUser(uniqueName);

        socket.data.user = user;
        lobbyAdd(socket, user);

        // ✅ store login history (append-only)
        try {
            const db = getDb();
            // ✅ (3) sanitize/trim metadata here
            let safeMeta = {};
            if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
                safeMeta = metadata;
            }

            // hard limit size (simple)
            let metaStr = "";
            try { metaStr = JSON.stringify(safeMeta); } catch { metaStr = "{}"; safeMeta = {}; }
            if (metaStr.length > 2000) safeMeta = { truncated: true };

            // ✅ then store safeMeta
            await db.collection("login_history").insertOne({
                userId: user.id,
                name: user.name,
                cdate: new Date(),
                ip: socket.handshake.address || socket.request?.socket?.remoteAddress || "unknown",
                metadata: safeMeta,
            });
        } catch (e) {
            logger.error("login_history insert failed", { message: e?.message ?? String(e) });
        }

        socket.emit(EVENTS.AUTH_OK, { user });
        lobbyBroadcast(io);
    });
}

function makeUniqueName(desired, users) {
    const base = desired;
    const taken = new Set(users.map(u => String(u.name ?? "").toLowerCase()));

    if (!taken.has(base.toLowerCase())) return base;

    let n = 2;
    while (taken.has(`${base} (${n})`.toLowerCase())) n++;
    return `${base} (${n})`;
}