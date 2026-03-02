import { MongoClient } from "mongodb";
import { logger } from "./logger.js";

let client;
let db;

export async function initMongo() {
    if (db) return db;

    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB;

    if (!uri) throw new Error("Missing env MONGO_URI");
    if (!dbName) throw new Error("Missing env MONGO_DB");

    client = new MongoClient(uri, {
        // Pooling is handled by node.
    });

    await client.connect();
    db = client.db(dbName);

    logger.info(`Server [DB CONNECTED]`);
    return db;
}

export function getDb() {
    if (!db) throw new Error("Mongo not initialized. Call initMongo() first.");
    return db;
}

export async function closeMongo() {
    try {
        await client?.close();
    } finally {
        client = undefined;
        db = undefined;
    }
}