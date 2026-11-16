import { MongoClient } from "mongodb";
const globalMongo = globalThis as typeof globalThis & {
  mongoPromise?: Promise<MongoClient>;
};
export async function database() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Database is not configured. Set MONGODB_URI.");
  if (!globalMongo.mongoPromise)
    globalMongo.mongoPromise = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
    })
      .connect()
      .catch((e) => {
        globalMongo.mongoPromise = undefined;
        throw e;
      });
  return (await globalMongo.mongoPromise).db(process.env.MONGODB_DB || "jnr");
}
