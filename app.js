import express from "express";
import "dotenv/config";
import { createIO } from "./src/socket/io.js";
import { registerSocketHandlers } from "./src/socket/register.js";
import { logger } from "./src/shared/logger.js";
import { initMongo, closeMongo } from "./src/shared/mongo.js"; // ✅ add

const app = express();
app.use(express.json());

// health check
app.get("/health", (_req, res) => res.json({ response: "OK" }));

const port = process.env.PORT || 8080;
const cors = process.env.CORS_ORIGIN || "*";

const server = app.listen(port, "0.0.0.0", () => logger.info(`Server [BOOT@${port}]`));
initMongo().catch((e) => logger.error("Mongo init failed", { message: e?.message ?? String(e) }));

server.on("error", (err) => {
    logger.error("Server [ERROR] ::", { code: err.code, message: err.message, port });
});

const io = createIO(server, { corsOrigin: cors });
registerSocketHandlers(io);

process.on("SIGINT", async () => {
    logger.info("SIGINT received, shutting down...");
    await closeMongo();
    server.close(() => process.exit(0));
});