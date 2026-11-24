import { describe, expect, it } from "vitest";
import { matchFaq, normalizePhrase } from "@/lib/chat/faq-engine";
import { resolveModeAt } from "@/lib/chat/business-hours";
import type { BusinessHours } from "@/lib/repositories/chatbotBusinessHours";

const testFaq = {
  id: 7,
  categoryId: 2,
  languageCode: "en",
  question: "How can I get a quotation?",
  answer: "Send an enquiry to request a quotation.",
};
const categories = [{ id: 3, slug: "pricing-packages", label: "Pricing & Packages" }];
const hours = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  day_start: "09:00:00",
  day_end: "21:00:00",
  is_open: 1,
})) as BusinessHours[];

describe("FAQ matching priority", () => {
  it("matches exact, normalized phrase, configured keyword, category, then fallback", () => {
    expect(matchFaq(testFaq.question, [testFaq], [], categories)).toMatchObject({
      type: "faq",
      matchType: "exact",
    });
    expect(matchFaq("How can I get a quotation!!", [testFaq], [], categories)).toMatchObject({
      type: "faq",
      matchType: "normalized_phrase",
    });
    expect(
      matchFaq("quotation", [testFaq], [{ faqId: 7, keyword: "quote", normalizedKeyword: "quote" }], categories),
    ).toMatchObject({ type: "fallback" });
    expect(
      matchFaq("quote", [testFaq], [{ faqId: 7, keyword: "quote", normalizedKeyword: "quote" }], categories),
    ).toMatchObject({ type: "faq", matchType: "keyword" });
    expect(matchFaq("Pricing & Packages", [], [], categories)).toMatchObject({
      type: "category",
      matchType: "category",
    });
    expect(matchFaq("unrecognized request", [], [], categories)).toMatchObject({
      type: "fallback",
      matchType: "fallback",
    });
  });

  it("normalizes punctuation and spacing without losing Hindi letters", () => {
    expect(normalizePhrase("  कीमत—और   पैकेज! ")).toBe("कीमत और पैकेज");
  });
});

describe("Asia/Kolkata day and night boundaries", () => {
  it.each([
    ["08:59", "2026-11-23T03:29:00.000Z", "night"],
    ["09:00", "2026-11-23T03:30:00.000Z", "day"],
    ["20:59", "2026-11-23T15:29:00.000Z", "day"],
    ["21:00", "2026-11-23T15:30:00.000Z", "night"],
  ] as const)("resolves %s IST as %s", (_time, utcInstant, expected) => {
    expect(resolveModeAt(new Date(utcInstant), hours, null, null)).toBe(expected);
  });
});
