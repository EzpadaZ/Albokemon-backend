const bySocketId = new Map(); // socket.id -> user
const byUserId = new Map();   // userId -> socket.id

export function lobbyAdd(socket, user) {
    bySocketId.set(socket.id, user);
    byUserId.set(user.id, socket.id);
}

export function lobbyRemove(socket) {
    const user = bySocketId.get(socket.id);
    if (user) byUserId.delete(user.id);
    bySocketId.delete(socket.id);
    return user;
}

export function lobbyList() {
    return Array.from(bySocketId.values());
}

export function lobbyGetSocketIdByUserId(userId) {
    return byUserId.get(userId);
}
