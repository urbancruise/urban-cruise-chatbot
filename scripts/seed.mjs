import mysql from "mysql2/promise";

const categories = [
  ["vehicle-rental", "Vehicle Rental", "वाहन किराया"],
  ["cars-suvs", "Cars & SUVs", "कारें और एसयूवी"],
  ["luxury-cars-vans", "Luxury Cars & Vans", "लक्ज़री कारें और वैन"],
  ["tempo-traveller-urbania", "Tempo Traveller / Urbania", "टेम्पो ट्रैवलर / अर्बनिया"],
  ["buses", "Mini / Luxury / Volvo / Sleeper Buses", "मिनी / लक्ज़री / वोल्वो / स्लीपर बसें"],
  ["pricing-packages", "Pricing & Packages", "कीमत और पैकेज"],
  ["booking-availability", "Booking & Availability", "बुकिंग और उपलब्धता"],
  ["wedding", "Wedding Travel", "शादी यात्रा"],
  ["corporate", "Corporate Travel", "कॉर्पोरेट यात्रा"],
  ["local-outstation", "Local & Outstation Trips", "स्थानीय और आउटस्टेशन यात्रा"],
  ["pilgrimage", "Pilgrimage Tours", "तीर्थ यात्रा"],
  ["payment-cancellation", "Payment & Cancellation", "भुगतान और रद्दीकरण"],
  ["driver-safety", "Driver & Safety", "ड्राइवर और सुरक्षा"],
  ["customer-support", "Customer Support", "ग्राहक सहायता"],
];

const faqs = [
  ["vehicle-rental", "What vehicles does Urban Cruise offer?", "Urban Cruise कौन-कौन से वाहन उपलब्ध कराता है?", ["vehicles", "fleet", "गाड़ियां"]],
  ["vehicle-rental", "Which vehicle suits my group size?", "मेरे समूह के लिए कौन सा वाहन सही रहेगा?", ["group size", "passengers", "समूह"]],
  ["driver-safety", "Are vehicles chauffeur-driven?", "क्या वाहन चालक सहित उपलब्ध होते हैं?", ["driver", "chauffeur", "चालक"]],
  ["driver-safety", "Are AC vehicles available?", "क्या एसी वाहन उपलब्ध हैं?", ["ac", "air conditioning", "एसी"]],
  ["cars-suvs", "Can I book an SUV for an outstation trip?", "क्या मैं आउटस्टेशन यात्रा के लिए एसयूवी बुक कर सकता हूँ?", ["suv", "outstation", "एसयूवी"]],
  ["cars-suvs", "Do you provide airport transfers?", "क्या आप एयरपोर्ट ट्रांसफर की सुविधा देते हैं?", ["airport", "transfer", "एयरपोर्ट"]],
  ["cars-suvs", "Which sedan and SUV models are available?", "कौन से सेडान और एसयूवी मॉडल उपलब्ध हैं?", ["sedan", "model", "सेडान"]],
  ["tempo-traveller-urbania", "What seating capacities are available?", "कितनी सीटों वाले वाहन उपलब्ध हैं?", ["capacity", "seats", "सीट"]],
  ["tempo-traveller-urbania", "What is the difference between Tempo Traveller and Urbania?", "टेम्पो ट्रैवलर और अर्बनिया में क्या अंतर है?", ["tempo traveller", "urbania", "अंतर"]],
  ["tempo-traveller-urbania", "Is Maharaja seating available?", "क्या महाराजा सीटिंग उपलब्ध है?", ["maharaja", "seating", "महाराजा"]],
  ["buses", "What mini bus options are available?", "मिनी बस के कौन-कौन से विकल्प उपलब्ध हैं?", ["mini bus", "मिनी बस"]],
  ["buses", "Do you provide Volvo buses?", "क्या वोल्वो बस उपलब्ध हैं?", ["volvo", "वोल्वो"]],
  ["buses", "Are sleeper buses available?", "क्या स्लीपर बस उपलब्ध हैं?", ["sleeper", "स्लीपर"]],
  ["buses", "Can I book a bus with a washroom?", "क्या मैं वॉशरूम वाली बस बुक कर सकता हूँ?", ["washroom", "bus", "वॉशरूम"]],
  ["pricing-packages", "How can I get a quotation?", "मैं कोटेशन कैसे प्राप्त कर सकता हूँ?", ["quote", "quotation", "price", "कोटेशन", "कीमत"]],
  ["booking-availability", "What details are required to book?", "बुकिंग के लिए कौन-सी जानकारी चाहिए?", ["booking details", "बुकिंग जानकारी"]],
  ["booking-availability", "How can I check availability?", "उपलब्धता कैसे जाँच सकता हूँ?", ["availability", "check", "उपलब्धता"]],
  ["pricing-packages", "Are tolls, parking and taxes included?", "क्या टोल, पार्किंग और टैक्स शामिल हैं?", ["toll", "parking", "tax", "टोल", "पार्किंग"]],
  ["wedding", "Do you provide wedding transport?", "क्या आप शादी के लिए परिवहन उपलब्ध कराते हैं?", ["wedding", "marriage", "शादी"]],
  ["corporate", "Can I arrange corporate transport?", "क्या मैं कॉर्पोरेट परिवहन की व्यवस्था कर सकता हूँ?", ["corporate", "business", "कॉर्पोरेट"]],
  ["local-outstation", "Do you provide Delhi sightseeing?", "क्या आप दिल्ली घूमने के लिए वाहन उपलब्ध कराते हैं?", ["sightseeing", "delhi", "दिल्ली घूमना"]],
  ["pilgrimage", "Can I book pilgrimage travel?", "क्या मैं तीर्थ यात्रा के लिए वाहन बुक कर सकता हूँ?", ["pilgrimage", "tour", "तीर्थ"]],
];

const connection = await mysql.createConnection({
  host: required("DB_HOST"),
  port: Number(process.env.DB_PORT || 3306),
  user: required("DB_USER"),
  password: required("DB_PASSWORD"),
  database: required("DB_NAME"),
  charset: "utf8mb4",
  timezone: "Z",
});

try {
  await connection.query("SET time_zone = '+00:00'");
  await connection.beginTransaction();

  for (const [sortOrder, [slug, displayNameEn, displayNameHi]] of categories.entries()) {
    await connection.execute(
      `INSERT INTO faq_categories (slug, display_name_en, display_name_hi, sort_order, status)
       VALUES (?, ?, ?, ?, 'published')
       ON DUPLICATE KEY UPDATE display_name_en = VALUES(display_name_en),
         display_name_hi = VALUES(display_name_hi), sort_order = VALUES(sort_order)`,
      [slug, displayNameEn, displayNameHi, sortOrder],
    );
  }

  for (const [categorySlug, questionEn, questionHi, keywords] of faqs) {
    const [[category]] = await connection.execute(
      "SELECT id FROM faq_categories WHERE slug = ?",
      [categorySlug],
    );

    for (const [languageCode, question, localizedKeywords] of [
      ["en", questionEn, keywords.filter((keyword) => !/[\u0900-\u097f]/u.test(keyword))],
      ["hi", questionHi, keywords.filter((keyword) => /[\u0900-\u097f]/u.test(keyword))],
    ]) {
      const [[existing]] = await connection.execute(
        "SELECT id FROM chatbot_faqs WHERE category_id = ? AND language_code = ? AND question = ?",
        [category.id, languageCode, question],
      );
      let faqId = existing?.id;

      if (!faqId) {
        const [result] = await connection.execute(
          `INSERT INTO chatbot_faqs
            (category_id, language_code, question, answer, status, needs_approval)
           VALUES (?, ?, ?, NULL, 'draft', TRUE)`,
          [category.id, languageCode, question],
        );
        faqId = result.insertId;
      }

      for (const keyword of localizedKeywords) {
        const normalized = keyword.toLocaleLowerCase().trim();
        await connection.execute(
          `INSERT IGNORE INTO faq_keywords (faq_id, keyword, normalized_keyword)
           VALUES (?, ?, ?)`,
          [faqId, keyword, normalized],
        );
      }
    }
  }

  for (const languageCode of ["en", "hi"]) {
    const [faqRows] = await connection.execute(
      `SELECT f.id, f.category_id
       FROM chatbot_faqs f
       WHERE f.language_code = ?
       ORDER BY f.category_id, f.id`,
      [languageCode],
    );
    const byCategory = new Map();
    for (const faq of faqRows) {
      const related = byCategory.get(faq.category_id) ?? [];
      related.push(faq.id);
      byCategory.set(faq.category_id, related);
    }
    for (const ids of byCategory.values()) {
      for (const faqId of ids) {
        for (const [relatedIndex, relatedId] of ids.entries()) {
          if (relatedId !== faqId) {
            await connection.execute(
              "INSERT IGNORE INTO faq_related (faq_id, related_faq_id, sort_order) VALUES (?, ?, ?)",
              [faqId, relatedId, relatedIndex],
            );
          }
        }
      }
    }
  }

  await connection.commit();
  console.log(`Seeded ${categories.length} categories and ${faqs.length * 2} draft FAQ entries.`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
