import mysql from "mysql2/promise";

const connection = await mysql.createConnection({
  host: required("DB_HOST"),
  port: Number(process.env.DB_PORT || 3306),
  user: required("DB_USER"),
  password: required("DB_PASSWORD"),
  database: required("DB_NAME"),
  charset: "utf8mb4",
  timezone: "Z",
});

try {
  await connection.query("SET time_zone = '+00:00'");
  const [result] = await connection.execute(
    "DELETE FROM chatbot_messages WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)",
  );
  const [expiredSessions] = await connection.execute(
    "DELETE FROM chatbot_agent_sessions WHERE expires_at <= UTC_TIMESTAMP()",
  );
  console.log(
    `Deleted ${result.affectedRows} chat messages older than 90 days and ${expiredSessions.affectedRows} expired agent sessions.`,
  );
} finally {
  await connection.end();
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
