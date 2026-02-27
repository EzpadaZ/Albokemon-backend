import { EVENTS } from "../../socket/events.js";
import { createUser } from "./auth.service.js";
import { lobbyAdd, lobbyList } from "../lobby/lobby.store.js";
import { lobbyBroadcast } from "../lobby/lobby.socket.js";

export function registerAuthSocket(io, socket) {
    socket.on(EVENTS.AUTH_LOGIN, ({ name } = {}) => {
        let desired = String(name ?? "Guest").trim().slice(0, 8);
        if (!desired) desired = "Guest";

        const uniqueName = makeUniqueName(desired, lobbyList());

        const user = createUser(uniqueName);

        socket.data.user = user;
        lobbyAdd(socket, user);

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