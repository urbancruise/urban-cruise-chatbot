import type { ResultSetHeader } from "mysql2/promise";
import { db, type DbRow } from "@/lib/db";

export interface Faq extends DbRow {
  id: number;
  category_id: number;
  language_code: string;
  question: string;
  answer: string | null;
  status: "draft" | "published" | "archived";
  needs_approval: number;
}

export async function listPublishedFaqs(languageCode: string) {
  const [rows] = await db.execute<Faq[]>(
    `SELECT id, category_id, language_code, question, answer, status, needs_approval
     FROM chatbot_faqs WHERE language_code = ? AND status = 'published' AND answer IS NOT NULL
     ORDER BY id`,
    [languageCode],
  );
  return rows;
}

export async function listPublishedFaqsByCategory(categoryId: number, languageCode: string) {
  const [rows] = await db.execute<Faq[]>(
    `SELECT id, category_id, language_code, question, answer, status, needs_approval
     FROM chatbot_faqs WHERE category_id = ? AND language_code = ? AND status = 'published' AND answer IS NOT NULL
     ORDER BY id`,
    [categoryId, languageCode],
  );
  return rows;
}

export async function findPublishedFaqById(faqId: number) {
  const [rows] = await db.execute<Faq[]>(
    `SELECT id, category_id, language_code, question, answer, status, needs_approval
     FROM chatbot_faqs WHERE id = ? AND status = 'published' AND answer IS NOT NULL LIMIT 1`,
    [faqId],
  );
  return rows[0] ?? null;
}

export async function searchPublishedFaqs(query: string, languageCode: string) {
  const pattern = `%${query}%`;
  const [rows] = await db.execute<Faq[]>(
    `SELECT DISTINCT f.id, f.category_id, f.language_code, f.question, f.answer, f.status, f.needs_approval
     FROM chatbot_faqs f
     LEFT JOIN faq_keywords k ON k.faq_id = f.id
     WHERE f.language_code = ? AND f.status = 'published' AND f.answer IS NOT NULL
       AND (f.question LIKE ? OR k.normalized_keyword LIKE ?)
     ORDER BY f.id LIMIT 30`,
    [languageCode, pattern, pattern],
  );
  return rows;
}

export async function listPublishedFaqsForCategoryMenu(
  categoryId: number,
  languageCode: string,
) {
  const [rows] = await db.execute<Faq[]>(
    `SELECT id, category_id, language_code, question, answer, status, needs_approval
     FROM chatbot_faqs WHERE category_id = ? AND language_code = ? AND status = 'published' AND answer IS NOT NULL
     ORDER BY id LIMIT 8`,
    [categoryId, languageCode],
  );
  return rows;
}

export async function createFaq(input: {
  categoryId: number;
  languageCode: string;
  question: string;
  answer: string | null;
  status: "draft" | "published" | "archived";
  needsApproval: boolean;
}) {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO chatbot_faqs
      (category_id, language_code, question, answer, status, needs_approval, published_at)
     VALUES (?, ?, ?, ?, ?, ?, IF(? = 'published', CURRENT_TIMESTAMP, NULL))`,
    [
      input.categoryId,
      input.languageCode,
      input.question,
      input.answer,
      input.status,
      input.needsApproval,
      input.status,
    ],
  );
  return result.insertId;
}
