import { Server } from 'socket.io';

export function createIO(httpServer, { corsOrigin = "*" } = {}) {
    
    const io = new Server(httpServer, {
        cors: {
            origin: corsOrigin,
        },
        connectionStateRecovery: {},
    });

    io.use((socket, next) => {
        socket.data.user ??=null;
        next();
    })

    return io;
}