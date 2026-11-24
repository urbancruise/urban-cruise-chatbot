import { randomBytes } from "node:crypto";
import { apiError, readJson, validationError } from "@/lib/api/http";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { requireSession } from "@/lib/api/session-auth";
import { leadSchema } from "@/lib/chat/schemas";
import { createAuditLog } from "@/lib/repositories/chatbotAuditLogs";
import { createMessage } from "@/lib/repositories/chatbotMessages";
import { createLead, findLeadByIdempotency } from "@/lib/repositories/chatbotLeads";
import { getSetting, settingStringValue } from "@/lib/repositories/chatbotSettings";
import { withTransaction } from "@/lib/db";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "leads", 10);
    const parsed = leadSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    const session = await requireSession(input.sessionToken);
    const duplicate = await findLeadByIdempotency(session.id, input.idempotencyKey);
    if (duplicate) {
      return Response.json({
        leadReference: duplicate,
        duplicate: true,
        confirmation: leadConfirmation(input.languageCode, duplicate),
      });
    }

    const configuredVersion = settingStringValue(await getSetting("consent_text_version"));
    if (!configuredVersion) throw new Error("Missing consent text version setting");
    const consentTextVersion = configuredVersion;
    const reference = `UC-${randomBytes(8).toString("hex").toUpperCase()}`;

    try {
      await withTransaction(async (connection) => {
        await createLead({
          sessionId: session.id,
          idempotencyKey: input.idempotencyKey,
          reference,
          name: input.name,
          phone: input.mobile.replace(/[^\d+]/g, ""),
          pickup: input.pickup,
          dropoff: input.drop,
          travelDate: input.travelDate,
          returnDate: input.returnDate ?? null,
          vehicleType: input.vehicleType,
          passengerCount: input.passengerCount,
          tripType: input.tripType,
          requirements: input.requirements || null,
          consentTextVersion,
        }, connection);
      });
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
      if (code === "ER_DUP_ENTRY") {
        const existing = await findLeadByIdempotency(session.id, input.idempotencyKey);
        if (existing) {
          return Response.json({
            leadReference: existing,
            duplicate: true,
            confirmation: leadConfirmation(input.languageCode, existing),
          });
        }
      }
      throw error;
    }

    const confirmation = leadConfirmation(input.languageCode, reference);

    await Promise.all([
      createAuditLog("lead_created", session.id, { leadReference: reference }),
      createMessage({
        sessionId: session.id,
        messageType: "assistant",
        body: confirmation,
      }),
    ]);

    return Response.json(
      { leadReference: reference, duplicate: false, confirmation },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

function leadConfirmation(languageCode: "en" | "hi", reference: string) {
  return languageCode === "hi"
    ? `धन्यवाद। आपकी पूछताछ प्राप्त हुई। यह पक्की बुकिंग नहीं है। हमारी टीम उपलब्धता की पुष्टि करके आपको कोटेशन देगी। संदर्भ: ${reference}`
    : `Thank you. Your enquiry is received. This is not a confirmed booking. Our team will verify availability and share a quotation. Reference: ${reference}`;
}
