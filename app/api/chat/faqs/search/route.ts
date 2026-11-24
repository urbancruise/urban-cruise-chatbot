import { apiError, validationError } from "@/lib/api/http";
import { faqSearchSchema } from "@/lib/chat/schemas";
import { sanitizePlainText } from "@/lib/chat/sanitize";
import { searchPublishedFaqs } from "@/lib/repositories/chatbotFaqs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const values: Record<string, string> = {};
    for (const key of params.keys()) {
      if (key !== "q" && key !== "languageCode") {
        return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
      }
      const allValues = params.getAll(key);
      if (allValues.length !== 1) {
        return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
      }
      values[key] = allValues[0];
    }

    const parsed = faqSearchSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error);
    const faqs = await searchPublishedFaqs(
      sanitizePlainText(parsed.data.q, 120),
      parsed.data.languageCode,
    );

    return Response.json({
      faqs: faqs.map((faq) => ({
        id: Number(faq.id),
        categoryId: Number(faq.category_id),
        question: sanitizePlainText(faq.question, 500),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
