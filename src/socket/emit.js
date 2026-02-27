export function emit(socket, event, data) {
    socket.emit(event, data);
}

export function emitTo(io, roomOrSocketId, event, data) {
    io.to(roomOrSocketId).emit(event, data);
}