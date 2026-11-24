import { db, type DbRow } from "@/lib/db";

export interface FaqCategory extends DbRow {
  id: number;
  slug: string;
  display_name_en: string;
  display_name_hi: string;
  sort_order: number;
}

export async function listPublishedCategories() {
  const [rows] = await db.execute<FaqCategory[]>(
    "SELECT id, slug, display_name_en, display_name_hi, sort_order FROM faq_categories WHERE status = 'published' ORDER BY sort_order, id",
  );
  return rows;
}

export async function findPublishedCategoryById(categoryId: number) {
  const [rows] = await db.execute<FaqCategory[]>(
    "SELECT id, slug, display_name_en, display_name_hi, sort_order FROM faq_categories WHERE id = ? AND status = 'published' LIMIT 1",
    [categoryId],
  );
  return rows[0] ?? null;
}
