import type { DbRow } from "@/lib/db";
import { db } from "@/lib/db";

export interface FaqKeyword extends DbRow {
  faq_id: number;
  keyword: string;
  normalized_keyword: string;
}

export async function listPublishedFaqKeywords(languageCode: string) {
  const [rows] = await db.execute<FaqKeyword[]>(
    `SELECT k.faq_id, k.keyword, k.normalized_keyword
     FROM faq_keywords k
     INNER JOIN chatbot_faqs f ON f.id = k.faq_id
     WHERE f.language_code = ? AND f.status = 'published' AND f.answer IS NOT NULL`,
    [languageCode],
  );
  return rows;
}

export async function createFaqKeyword(faqId: number, keyword: string, normalizedKeyword: string) {
  await db.execute(
    "INSERT INTO faq_keywords (faq_id, keyword, normalized_keyword) VALUES (?, ?, ?)",
    [faqId, keyword, normalizedKeyword],
  );
}
