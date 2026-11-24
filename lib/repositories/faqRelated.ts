import type { Faq } from "@/lib/repositories/chatbotFaqs";
import { db } from "@/lib/db";

export async function listRelatedPublishedFaqs(faqId: number, languageCode: string) {
  const [rows] = await db.execute<Faq[]>(
    `SELECT f.id, f.category_id, f.language_code, f.question, f.answer, f.status, f.needs_approval
     FROM faq_related r
     INNER JOIN chatbot_faqs f ON f.id = r.related_faq_id
     WHERE r.faq_id = ? AND f.language_code = ? AND f.status = 'published' AND f.answer IS NOT NULL
     ORDER BY r.sort_order LIMIT 5`,
    [faqId, languageCode],
  );
  return rows;
}

export async function createFaqRelation(faqId: number, relatedFaqId: number, sortOrder: number) {
  await db.execute(
    "INSERT INTO faq_related (faq_id, related_faq_id, sort_order) VALUES (?, ?, ?)",
    [faqId, relatedFaqId, sortOrder],
  );
}
