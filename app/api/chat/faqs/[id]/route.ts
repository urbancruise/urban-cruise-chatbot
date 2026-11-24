import { connection } from "next/server";
import { apiError, ApiError } from "@/lib/api/http";
import { faqIdSchema } from "@/lib/chat/schemas";
import { sanitizePlainText } from "@/lib/chat/sanitize";
import { findPublishedFaqById } from "@/lib/repositories/chatbotFaqs";
import { listRelatedPublishedFaqs } from "@/lib/repositories/faqRelated";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  try {
    const { id } = await context.params;
    const parsedId = faqIdSchema.safeParse(id);
    if (!parsedId.success) throw new ApiError("FAQ_NOT_FOUND", 404);
    const faq = await findPublishedFaqById(parsedId.data);
    if (!faq?.answer) throw new ApiError("FAQ_NOT_FOUND", 404);
    const related = await listRelatedPublishedFaqs(faq.id, faq.language_code);

    return Response.json({
      faq: {
        id: Number(faq.id),
        categoryId: Number(faq.category_id),
        languageCode: faq.language_code,
        question: sanitizePlainText(faq.question, 500),
        answer: sanitizePlainText(faq.answer),
        relatedQuestions: related.map((item) => ({
          id: Number(item.id),
          question: sanitizePlainText(item.question, 500),
        })),
        quickReplies: [
          { type: "support", label: faq.language_code === "hi" ? "क्या आपको और सहायता चाहिए?" : "Still need help?" },
          { type: "lead", label: faq.language_code === "hi" ? "पूछताछ भेजें" : "Send an enquiry" },
        ],
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
