import type { ServiceMode } from "@/lib/chat/business-hours";

export const CONSENT_TEXT_VERSION = "provisional-v1";

export const welcomeMessages = {
  en: "Welcome to Urban Cruise. How can we help with your travel today?",
  hi: "अर्बन क्रूज़ में आपका स्वागत है। आज आपकी यात्रा में हम कैसे सहायता कर सकते हैं?",
} as const;

export const welcomeMenu = [
  { id: "booking", en: "Book a Vehicle", hi: "वाहन बुक करें", action: "lead" },
  { id: "vehicle-info", en: "Vehicle Information", hi: "वाहन की जानकारी", action: "category" },
  { id: "pricing", en: "Pricing & Packages", hi: "कीमत और पैकेज", action: "category" },
  { id: "events", en: "Wedding / Corporate Travel", hi: "शादी / कॉर्पोरेट यात्रा", action: "category" },
  { id: "trips", en: "Local & Outstation Trips", hi: "स्थानीय और आउटस्टेशन यात्रा", action: "category" },
  { id: "pilgrimage", en: "Pilgrimage Tours", hi: "तीर्थ यात्रा", action: "category" },
  { id: "faqs", en: "FAQs", hi: "अक्सर पूछे जाने वाले प्रश्न", action: "faq" },
  { id: "support", en: "Talk to Support", hi: "सहायता से बात करें", action: "support" },
] as const;

export function supportStatusCopy(mode: ServiceMode, languageCode: string): string {
  if (languageCode === "hi") {
    return mode === "day"
      ? "दिन के समय हमारी एजेंट टीम चैट में सहायता करती है।"
      : "अभी स्वचालित सहायता उपलब्ध है। आप पूछताछ भेज सकते हैं और हमारी टीम बाद में संपर्क करेगी।";
  }
  return mode === "day"
    ? "Our daytime agent team can help you in this chat."
    : "Automated support is available now. Send an enquiry and our team can follow up.";
}

export function consentNotice(languageCode: string): string {
  return languageCode === "hi"
    ? "यह प्रारंभिक सूचना है: आपकी जानकारी का उपयोग Urban Cruise आपकी पूछताछ का जवाब देने और कॉलबैक के लिए कर सकता है। कृपया केवल आवश्यक जानकारी साझा करें।"
    : "Provisional notice: Urban Cruise may use your details to respond to this enquiry and arrange a callback. Please share only the information needed.";
}
