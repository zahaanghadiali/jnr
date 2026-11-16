import { loadEnvFile } from "node:process";
import { MongoClient } from "mongodb";
loadEnvFile(".env.local");
const client = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 15000,
});
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "jnr");
  const collections = await db.listCollections({ name: "players" }).toArray();
  if (!collections.length) await db.createCollection("players");
  await db
    .collection("players")
    .createIndex({ "entries.at": -1 }, { name: "wall_activity" });
  await db
    .collection("players")
    .createIndex({ name: 1 }, { name: "guest_name" });
  await db.command({ ping: 1 });
  console.log(
    JSON.stringify({
      database: db.databaseName,
      collection: "players",
      indexes: ["wall_activity", "guest_name"],
      status: "connected and ready",
    }),
  );
} catch (e) {
  console.error(
    JSON.stringify({
      error: e.name,
      message: e.message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/g, "[redacted]"),
    }),
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
