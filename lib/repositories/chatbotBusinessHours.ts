import { db, type DbRow } from "@/lib/db";

export interface BusinessHours extends DbRow {
  weekday: number;
  day_start: string | null;
  day_end: string | null;
  is_open: number;
}

export async function listBusinessHours() {
  const [rows] = await db.execute<BusinessHours[]>(
    "SELECT weekday, day_start, day_end, is_open FROM chatbot_business_hours ORDER BY weekday",
  );
  return rows;
}
