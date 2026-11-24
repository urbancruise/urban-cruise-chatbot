import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import mysql from "mysql2/promise";
import { hashAgentPassword } from "../lib/agent/password";

const usernamePrompt = createInterface({ input: process.stdin, output: process.stdout });
const username = (await usernamePrompt.question("Agent username: ")).trim();
usernamePrompt.close();

if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username)) {
  throw new Error("Username must be 3-80 characters: letters, numbers, dot, underscore, or hyphen.");
}

const password = await readSecret("Password (minimum 12 characters): ");
const confirmation = await readSecret("Confirm password: ");
if (password !== confirmation) throw new Error("Passwords do not match.");
if (password.length < 12 || password.length > 128) {
  throw new Error("Password must be between 12 and 128 characters.");
}

const salt = randomBytes(16).toString("hex");
const passwordHash = hashAgentPassword(password, salt);
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
  await connection.execute(
    `INSERT INTO chatbot_agents (username, display_name, password_salt, password_hash)
     VALUES (?, ?, ?, ?)`,
    [username, username, salt, passwordHash],
  );
  console.log(`Created agent account: ${username}`);
} finally {
  await connection.end();
}

function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Run this command from an interactive terminal to enter the password securely.");
  }

  return new Promise<string>((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");

    function finish(error?: Error) {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(chunk: string) {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Password prompt cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    }

    input.on("data", onData);
  });
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
