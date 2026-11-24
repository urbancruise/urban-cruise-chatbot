import type { DbRow } from "@/lib/db";
import { db } from "@/lib/db";

export interface ChatbotSetting extends DbRow {
  setting_key: string;
  setting_value: unknown;
}

export async function getSetting(key: string) {
  const [rows] = await db.execute<ChatbotSetting[]>(
    "SELECT setting_key, setting_value FROM chatbot_settings WHERE setting_key = ? LIMIT 1",
    [key],
  );
  return rows[0]?.setting_value ?? null;
}

export function settingStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}
