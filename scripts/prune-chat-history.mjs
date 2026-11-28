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
  const [expiredVideoCallLinks] = await connection.execute(
    "DELETE FROM chatbot_video_call_requests WHERE expires_at <= UTC_TIMESTAMP()",
  );
  const [expiredVideoCallInvites] = await connection.execute(
    "DELETE FROM chatbot_video_call_invites WHERE expires_at <= UTC_TIMESTAMP() OR used_at IS NOT NULL",
  );
  const [expiredVideoCallRooms] = await connection.execute(
    "DELETE FROM chatbot_video_call_rooms WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)",
  );
  console.log(
    `Deleted ${result.affectedRows} chat messages older than 90 days, ${expiredSessions.affectedRows} expired agent sessions, ${expiredVideoCallLinks.affectedRows} expired scheduled-call links, ${expiredVideoCallInvites.affectedRows} expired or used call invites, and ${expiredVideoCallRooms.affectedRows} call rooms older than 90 days.`,
  );
} finally {
  await connection.end();
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
