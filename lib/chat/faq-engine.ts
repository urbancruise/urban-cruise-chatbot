export interface RuleFaq {
  id: number;
  categoryId: number;
  languageCode: string;
  question: string;
  answer: string;
}

export interface RuleKeyword {
  faqId: number;
  keyword: string;
  normalizedKeyword: string;
}

export interface RuleCategory {
  id: number;
  slug: string;
  label: string;
}

export type FaqMatch =
  | { type: "faq"; faq: RuleFaq; matchType: "exact" | "normalized_phrase" | "keyword" }
  | { type: "category"; category: RuleCategory; matchType: "category" }
  | { type: "fallback"; matchType: "fallback" };

export function normalizePhrase(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchFaq(
  question: string,
  faqs: readonly RuleFaq[],
  keywords: readonly RuleKeyword[],
  categories: readonly RuleCategory[],
): FaqMatch {
  const input = question.trim().toLocaleLowerCase();
  const exact = faqs.find((faq) => faq.question.trim().toLocaleLowerCase() === input);
  if (exact) return { type: "faq", faq: exact, matchType: "exact" };

  const normalizedInput = normalizePhrase(question);
  const phrase = faqs.find((faq) => {
    const normalizedQuestion = normalizePhrase(faq.question);
    return (
      normalizedInput === normalizedQuestion ||
      normalizedInput.startsWith(`${normalizedQuestion} `) ||
      normalizedQuestion.startsWith(`${normalizedInput} `)
    );
  });
  if (phrase) return { type: "faq", faq: phrase, matchType: "normalized_phrase" };

  const keyword = keywords.find((candidate) => {
    const normalizedKeyword = normalizePhrase(candidate.normalizedKeyword || candidate.keyword);
    return (
      normalizedKeyword.length > 0 &&
      ` ${normalizedInput} `.includes(` ${normalizedKeyword} `)
    );
  });
  if (keyword) {
    const faq = faqs.find((candidate) => candidate.id === keyword.faqId);
    if (faq) return { type: "faq", faq, matchType: "keyword" };
  }

  const category = categories.find((candidate) => {
    const label = normalizePhrase(candidate.label);
    return label.length > 0 && (normalizedInput === label || ` ${normalizedInput} `.includes(` ${label} `));
  });
  if (category) return { type: "category", category, matchType: "category" };

  return { type: "fallback", matchType: "fallback" };
}

export function fallbackCopy(languageCode: string): string {
  return languageCode === "hi"
    ? "मुझे इसका स्वीकृत उत्तर अभी उपलब्ध नहीं है। नीचे कोई विषय चुनें या पूछताछ भेजें ताकि हमारी टीम आपसे संपर्क कर सके।"
    : "I don’t have an approved answer for that yet. Choose a topic below or send an enquiry so our team can follow up.";
}
