import { connection } from "next/server";
import { apiError } from "@/lib/api/http";
import { listPublishedCategories } from "@/lib/repositories/faqCategories";

export async function GET() {
  await connection();
  try {
    const categories = await listPublishedCategories();
    return Response.json({
      categories: categories.map((category) => ({
        id: Number(category.id),
        slug: category.slug,
        name: {
          en: category.display_name_en,
          hi: category.display_name_hi,
        },
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
