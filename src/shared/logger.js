function stamp() {
    return new Date().toISOString();
}

function fmt(level, msg, meta) {
    if (meta === undefined) return `[${stamp()}] [${level}] ${msg}`;
    return `[${stamp()}] [${level}] ${msg} ${JSON.stringify(meta)}`;
}

export const logger = {
    info(msg, meta) {
        console.log(fmt("INFO", msg, meta));
    },
    warn(msg, meta) {
        console.warn(fmt("WARN", msg, meta));
    },
    error(msg, meta) {
        console.error(fmt("ERROR", msg, meta));
    },
};
