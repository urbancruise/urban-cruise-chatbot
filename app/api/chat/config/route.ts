import { connection } from "next/server";
import { apiError } from "@/lib/api/http";
import { getCurrentModeConfig } from "@/lib/chat/business-hours";
import { welcomeMenu, welcomeMessages, consentNotice, CONSENT_TEXT_VERSION } from "@/lib/chat/content";
import { listBusinessHours } from "@/lib/repositories/chatbotBusinessHours";

export async function GET() {
  await connection();
  try {
    const [mode, weeklyHours] = await Promise.all([
      getCurrentModeConfig(),
      listBusinessHours(),
    ]);

    return Response.json({
      ...mode,
      weeklyHours: weeklyHours.map((hours) => ({
        weekday: Number(hours.weekday),
        dayStart: hours.day_start,
        dayEnd: hours.day_end,
        isOpen: Boolean(hours.is_open),
      })),
      languages: ["en", "hi"],
      welcomeMessage: welcomeMessages,
      menu: welcomeMenu,
      consent: {
        version: CONSENT_TEXT_VERSION,
        notice: {
          en: consentNotice("en"),
          hi: consentNotice("hi"),
        },
        provisional: true,
      },
      support: {
        liveChatAvailable: mode.mode === "day",
        videoAvailable: false,
        queueStatus: mode.mode === "day" ? "agent_inbox" : "automated_faq",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
