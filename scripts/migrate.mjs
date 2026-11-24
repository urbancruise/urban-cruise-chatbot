import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "db", "migrations");
const connection = await mysql.createConnection({
  host: required("DB_HOST"),
  port: Number(process.env.DB_PORT || 3306),
  user: required("DB_USER"),
  password: required("DB_PASSWORD"),
  database: required("DB_NAME"),
  charset: "utf8mb4",
  timezone: "Z",
  multipleStatements: true,
});

try {
  await connection.query("SET time_zone = '+00:00'");
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name VARCHAR(255) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const files = (await readdir(directory))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort();

  for (const migrationName of files) {
    const sql = await readFile(path.join(directory, migrationName), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const [rows] = await connection.execute(
      "SELECT checksum FROM schema_migrations WHERE migration_name = ?",
      [migrationName],
    );
    const applied = rows[0];

    if (applied) {
      if (applied.checksum !== checksum) {
        throw new Error(`Applied migration was changed: ${migrationName}`);
      }
      continue;
    }

    await connection.query(sql);
    await connection.execute(
      "INSERT INTO schema_migrations (migration_name, checksum) VALUES (?, ?)",
      [migrationName, checksum],
    );
    console.log(`Applied ${migrationName}`);
  }
} finally {
  await connection.end();
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
