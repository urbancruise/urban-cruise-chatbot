import mysql from "mysql2";
import { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";

declare global {
  var urbanCruisePool: Pool | undefined;
}

function getPool(): Pool {
  if (!globalThis.urbanCruisePool) globalThis.urbanCruisePool = createPool();
  return globalThis.urbanCruisePool;
}

function createPool(): Pool {
  const pool = mysql.createPool({
    host: required("DB_HOST"),
    port: Number(process.env.DB_PORT || 3306),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    database: required("DB_NAME"),
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
    waitForConnections: true,
    queueLimit: 0,
  });

  pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'", (error) => {
      if (!error) return;
      console.error("Failed to set MySQL connection timezone to UTC", error);
    });
  });

  return pool.promise();
}

export const db: Pool = new Proxy({} as Pool, {
  get(_target, property) {
    const pool = getPool();
    const value = Reflect.get(pool, property, pool) as unknown;
    return typeof value === "function" ? value.bind(pool) : value;
  },
});

export async function withTransaction<T>(
  work: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export type DbRow = RowDataPacket;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
