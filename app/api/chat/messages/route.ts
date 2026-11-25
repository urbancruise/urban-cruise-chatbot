import { apiError, readJson, validationError } from "@/lib/api/http";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { requireSession } from "@/lib/api/session-auth";
import { supportStatusCopy } from "@/lib/chat/content";
import { fallbackCopy, matchFaq } from "@/lib/chat/faq-engine";
import { chatHistorySchema, messageSchema } from "@/lib/chat/schemas";
import { sanitizePlainText } from "@/lib/chat/sanitize";
import { getCurrentServiceMode } from "@/lib/chat/business-hours";
import { createAuditLog } from "@/lib/repositories/chatbotAuditLogs";
import { createMessage, deleteExpiredMessages, listRecentMessages } from "@/lib/repositories/chatbotMessages";
import { listPublishedCategories, findPublishedCategoryById } from "@/lib/repositories/faqCategories";
import { listPublishedFaqs, listPublishedFaqsByCategory, findPublishedFaqById } from "@/lib/repositories/chatbotFaqs";
import { listPublishedFaqKeywords } from "@/lib/repositories/faqKeywords";
import { listRelatedPublishedFaqs } from "@/lib/repositories/faqRelated";
import {
  findAgentConversation,
  queueConversationForAgent,
} from "@/lib/repositories/chatbotAgents";
import { publishRealtimeEvent } from "@/lib/realtime";

export async function GET(request: Request) {
  try {
    enforceRateLimit(request, "message-history", 120);
    const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
    const parsed = chatHistorySchema.safeParse({ sessionToken: token });
    if (!parsed.success) return validationError(parsed.error);

    const session = await requireSession(parsed.data.sessionToken);
    const messages = await listRecentMessages(session.id);
    return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "messages", 60);
    const parsed = messageSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    const session = await requireSession(input.sessionToken);
    await deleteExpiredMessages();
    const mode = await getCurrentServiceMode();
    const userText = sanitizePlainText(input.text ?? "", 1000);
    const inboundId = await createMessage({
      sessionId: session.id,
      messageType: "user",
      body: userText || (input.faqId ? `FAQ ${input.faqId}` : `Category ${input.categoryId}`),
    });

    if (mode === "day") {
      const previousConversation = await findAgentConversation(session.id);
      const isFirstQueueMessage =
        !previousConversation ||
        previousConversation.agent_chat_status === "none" ||
        previousConversation.agent_chat_status === "closed";
      const conversation = await queueConversationForAgent(session.id);
      const text = isFirstQueueMessage
        ? input.languageCode === "hi"
          ? "आपका संदेश एजेंट की कतार में भेज दिया गया है। हमारी टीम इसी चैट में सहायता करेगी।"
          : "Your message is in the agent queue. Our team will reply here in this chat."
        : "";
      if (text) {
        await createMessage({
          sessionId: session.id,
          messageType: "assistant",
          body: text,
        });
      }
      await createAuditLog("agent_message_queued", session.id, {
        messageId: inboundId,
        status: conversation?.agent_chat_status ?? "waiting",
      });
      await publishRealtimeEvent(session.id, "status");
      return Response.json({
        mode,
        queued: isFirstQueueMessage,
        response: {
          type: "support",
          text,
          matchType: "fallback",
          quickReplies: [],
        },
      });
    }

    let response: {
      type: "faq" | "category" | "fallback" | "support";
      text: string;
      faqId?: number;
      categoryId?: number;
      matchType: "exact" | "normalized_phrase" | "keyword" | "category" | "fallback";
      quickReplies: Array<{ type: string; label: string; value?: string | number }>;
      relatedQuestions?: Array<{ id: number; question: string }>;
    };

    if (input.faqId) {
      const faq = await findPublishedFaqById(input.faqId);
      if (!faq?.answer || faq.language_code !== input.languageCode) {
        return Response.json({ error: { code: "FAQ_NOT_FOUND" } }, { status: 404 });
      }
      const related = await listRelatedPublishedFaqs(faq.id, input.languageCode);
      response = {
        type: "faq",
        text: sanitizePlainText(faq.answer),
        faqId: Number(faq.id),
        matchType: "exact",
        relatedQuestions: related.map((item) => ({
          id: Number(item.id),
          question: sanitizePlainText(item.question, 500),
        })),
        quickReplies: [
          { type: "support", label: input.languageCode === "hi" ? "क्या आपको और सहायता चाहिए?" : "Still need help?" },
          { type: "lead", label: input.languageCode === "hi" ? "पूछताछ भेजें" : "Send an enquiry" },
        ],
      };
    } else if (isSupportRequest(userText)) {
      response = {
        type: "support",
        text: supportStatusCopy(mode, input.languageCode),
        matchType: "fallback",
        quickReplies: [
          { type: "lead", label: input.languageCode === "hi" ? "कॉलबैक/पूछताछ भेजें" : "Request a callback / send an enquiry" },
          { type: "menu", label: input.languageCode === "hi" ? "मुख्य मेनू" : "Main menu" },
        ],
      };
    } else {
      const [categories, faqs, keywords] = await Promise.all([
        listPublishedCategories(),
        listPublishedFaqs(input.languageCode),
        listPublishedFaqKeywords(input.languageCode),
      ]);
      const categoryOptions = categories.map((category) => ({
        id: Number(category.id),
        slug: category.slug,
        label: input.languageCode === "hi" ? category.display_name_hi : category.display_name_en,
      }));

      if (input.categoryId) {
        const category = await findPublishedCategoryById(input.categoryId);
        response = category
          ? await categoryResponse(
              category.id,
              input.languageCode === "hi" ? category.display_name_hi : category.display_name_en,
              input.languageCode,
            )
          : {
              type: "fallback",
              text: fallbackCopy(input.languageCode),
              matchType: "fallback",
              quickReplies: categories.map((item) => ({
                type: "category",
                label: input.languageCode === "hi" ? item.display_name_hi : item.display_name_en,
                value: Number(item.id),
              })),
            };
      } else {
        const match = matchFaq(
          userText,
          faqs.map((faq) => ({
            id: Number(faq.id),
            categoryId: Number(faq.category_id),
            languageCode: faq.language_code,
            question: faq.question,
            answer: faq.answer ?? "",
          })),
          keywords.map((keyword) => ({
            faqId: Number(keyword.faq_id),
            keyword: keyword.keyword,
            normalizedKeyword: keyword.normalized_keyword,
          })),
          categoryOptions,
        );

        if (match.type === "faq") {
          const related = await listRelatedPublishedFaqs(match.faq.id, input.languageCode);
          response = {
            type: "faq",
            text: sanitizePlainText(match.faq.answer),
            faqId: match.faq.id,
            matchType: match.matchType,
            relatedQuestions: related.map((item) => ({
              id: Number(item.id),
              question: sanitizePlainText(item.question, 500),
            })),
            quickReplies: [
              { type: "support", label: input.languageCode === "hi" ? "क्या आपको और सहायता चाहिए?" : "Still need help?" },
              { type: "lead", label: input.languageCode === "hi" ? "पूछताछ भेजें" : "Send an enquiry" },
            ],
          };
        } else if (match.type === "category") {
          response = await categoryResponse(match.category.id, match.category.label, input.languageCode);
        } else {
          response = {
            type: "fallback",
            text: fallbackCopy(input.languageCode),
            matchType: "fallback",
            quickReplies: [
              ...categories.map((category) => ({
                type: "category",
                label: input.languageCode === "hi" ? category.display_name_hi : category.display_name_en,
                value: Number(category.id),
              })),
              { type: "lead", label: input.languageCode === "hi" ? "पूछताछ भेजें" : "Send an enquiry" },
            ],
          };
          await createAuditLog("faq_unmatched", session.id, { messageId: inboundId });
        }
      }
    }

    await createMessage({
      sessionId: session.id,
      messageType: "assistant",
      body: response.text,
      faqId: response.faqId ?? null,
      matchType: response.matchType,
    });
    return Response.json({ mode, response });
  } catch (error) {
    return apiError(error);
  }
}

async function categoryResponse(categoryId: number, label: string, languageCode: string) {
  const faqs = await listPublishedFaqsByCategory(categoryId, languageCode);
  if (faqs.length === 0) {
    return {
      type: "category" as const,
      text: languageCode === "hi"
        ? `${label} के लिए अभी कोई स्वीकृत FAQ उत्तर उपलब्ध नहीं है। आप पूछताछ भेज सकते हैं।`
        : `There are no approved FAQ answers in ${label} yet. You can send an enquiry for follow-up.`,
      categoryId,
      matchType: "category" as const,
      quickReplies: [
        { type: "lead", label: languageCode === "hi" ? "पूछताछ भेजें" : "Send an enquiry" },
        { type: "menu", label: languageCode === "hi" ? "सभी विषय" : "All topics" },
      ],
    };
  }
  return {
    type: "category" as const,
    text: languageCode === "hi" ? `${label} से संबंधित प्रश्न चुनें:` : `Choose a question about ${label}:`,
    categoryId,
    matchType: "category" as const,
    quickReplies: faqs.map((faq) => ({
      type: "faq",
      label: sanitizePlainText(faq.question, 500),
      value: Number(faq.id),
    })),
  };
}

function isSupportRequest(text: string): boolean {
  const normalized = text.toLocaleLowerCase().trim();
  return normalized === "talk to support" || normalized === "सहायता से बात करें";
}
