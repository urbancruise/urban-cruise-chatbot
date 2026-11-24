import { getSetting, settingStringValue } from "@/lib/repositories/chatbotSettings";
import { findHolidayOverride } from "@/lib/repositories/chatbotHolidays";
import { listBusinessHours } from "@/lib/repositories/chatbotBusinessHours";
import type { BusinessHours } from "@/lib/repositories/chatbotBusinessHours";
import type { HolidayOverride } from "@/lib/repositories/chatbotHolidays";

export type ServiceMode = "day" | "night";

export interface LocalDateTime {
  date: string;
  weekday: number;
  minuteOfDay: number;
}

export function getIndiaDateTime(date: Date): LocalDateTime {
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date supplied to mode resolver");

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdays[values.weekday];

  if (weekday === undefined) throw new Error("Could not resolve the India weekday");

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    weekday,
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute),
  };
}

export function resolveModeAt(
  date: Date,
  weeklyHours: readonly BusinessHours[],
  holiday: HolidayOverride | null,
  manualOverride: string | null,
): ServiceMode {
  if (
    manualOverride !== null &&
    manualOverride !== "auto" &&
    manualOverride !== "day" &&
    manualOverride !== "night"
  ) {
    throw new Error("Invalid service mode override in chatbot settings");
  }
  if (manualOverride === "day" || manualOverride === "night") return manualOverride;

  const local = getIndiaDateTime(date);
  if (holiday) {
    if (holiday.mode_override === "closed" || holiday.mode_override === "night") return "night";
    if (holiday.day_start && holiday.day_end) {
      return insideHours(local.minuteOfDay, holiday.day_start, holiday.day_end) ? "day" : "night";
    }
    if (holiday.mode_override === "day") return "day";
  }

  const schedule = weeklyHours.find((hours) => Number(hours.weekday) === local.weekday);
  if (!schedule) throw new Error(`No business-hours row configured for weekday ${local.weekday}`);
  if (!schedule.is_open || !schedule.day_start || !schedule.day_end) return "night";
  return insideHours(local.minuteOfDay, schedule.day_start, schedule.day_end) ? "day" : "night";
}

export async function getCurrentServiceMode(now = new Date()): Promise<ServiceMode> {
  const local = getIndiaDateTime(now);
  const [weeklyHours, holiday, rawOverride] = await Promise.all([
    listBusinessHours(),
    findHolidayOverride(local.date),
    getSetting("service_mode_override"),
  ]);
  return resolveModeAt(now, weeklyHours, holiday, readModeOverride(rawOverride));
}

export async function getCurrentModeConfig(now = new Date()) {
  const local = getIndiaDateTime(now);
  const [weeklyHours, holiday, rawOverride] = await Promise.all([
    listBusinessHours(),
    findHolidayOverride(local.date),
    getSetting("service_mode_override"),
  ]);
  const override = readModeOverride(rawOverride);
  const mode = resolveModeAt(now, weeklyHours, holiday, override);
  return {
    mode,
    localDate: local.date,
    timezone: "Asia/Kolkata",
    override: override === "day" || override === "night" ? override : null,
  };
}

function insideHours(minuteOfDay: number, start: string, end: string): boolean {
  const startMinute = timeToMinute(start);
  const endMinute = timeToMinute(end);
  return minuteOfDay >= startMinute && minuteOfDay < endMinute;
}

function timeToMinute(time: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) throw new Error(`Invalid business-hours time: ${time}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Invalid business-hours time: ${time}`);
  return hour * 60 + minute;
}

function readModeOverride(value: unknown): string {
  const override = settingStringValue(value);
  if (override === null) throw new Error("Missing service mode override setting");
  if (!["auto", "day", "night"].includes(override)) {
    throw new Error("Invalid service mode override setting");
  }
  return override;
}
