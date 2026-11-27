import mysql from "mysql2/promise";
import { scryptSync, randomBytes } from "node:crypto";

// Terminal se arguments lene ke liye (Optional)
const args = process.argv.slice(2);
const username = args[0] || "agent1";
const password = args[1] || "Password@123";
const displayName = args[2] || "Support Agent 1";

async function createAgent() {
  // 1. Generate Salt (32 hex chars) aur Hash (128 hex chars)
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex");

  // 2. Database Connection
  const connection = await mysql.createConnection({
    host: required("DB_HOST"),
    port: Number(process.env.DB_PORT || 3306),
    user: required("DB_USER"), // 👉 Username: agent1
    password: required("DB_PASSWORD"), // 👉 Password: Password@123
    database: required("DB_NAME"),
    charset: "utf8mb4",
    timezone: "Z",
  });

  try {
    // 3. Insert or Update Agent
    await connection.execute(
      `INSERT INTO chatbot_agents (username, display_name, password_salt, password_hash, status) 
       VALUES (?, ?, ?, ?, 'active') 
       ON DUPLICATE KEY UPDATE password_salt=?, password_hash=?, display_name=?`,
      [username, displayName, salt, hash, salt, hash, displayName]
    );
    
    console.log(`\n✅ Agent created/updated successfully!`);
    console.log(`👉 Username: ${username}`);
    console.log(`👉 Password: ${password}`);
    console.log(`(Aap ab /agent page par login kar sakte hain)\n`);
  } catch (error) {
    console.error("❌ Error creating agent:", error);
  } finally {
    await connection.end();
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

createAgent();