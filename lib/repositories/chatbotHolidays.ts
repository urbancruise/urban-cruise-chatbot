import { db, type DbRow } from "@/lib/db";

export interface HolidayOverride extends DbRow {
  holiday_date: string;
  mode_override: "day" | "night" | "closed";
  day_start: string | null;
  day_end: string | null;
  is_active: number;
}

export async function findHolidayOverride(date: string) {
  const [rows] = await db.execute<HolidayOverride[]>(
    "SELECT holiday_date, mode_override, day_start, day_end, is_active FROM chatbot_holidays WHERE holiday_date = ? AND is_active = TRUE LIMIT 1",
    [date],
  );
  return rows[0] ?? null;
}
