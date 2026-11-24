import { z } from "zod";

export const sessionSchema = z
  .object({
    languageCode: z.enum(["en", "hi"]).default("en"),
  })
  .strict();

export const sessionTokenSchema = z.string().regex(/^[a-f0-9]{64}$/i);

export const messageSchema = z
  .object({
    sessionToken: sessionTokenSchema,
    text: z.string().trim().min(1).max(1000).optional(),
    faqId: z.number().int().positive().optional(),
    categoryId: z.number().int().positive().optional(),
    languageCode: z.enum(["en", "hi"]).default("en"),
  })
  .strict()
  .refine((value) => Boolean(value.text || value.faqId || value.categoryId), {
    message: "A question, FAQ, or category is required.",
  });

export const leadSchema = z
  .object({
    sessionToken: sessionTokenSchema,
    idempotencyKey: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    mobile: z
      .string()
      .trim()
      .regex(/^(?:\+91[\s-]?)?[6-9]\d{9}$/, "Enter a valid Indian mobile number."),
    pickup: z.string().trim().min(1).max(255),
    drop: z.string().trim().min(1).max(255),
    travelDate: z.string().date(),
    returnDate: z.string().date().nullable().optional(),
    vehicleType: z.enum([
      "car",
      "suv",
      "luxury_car",
      "tempo_traveller",
      "urbania",
      "mini_bus",
      "luxury_bus",
      "volvo_bus",
      "sleeper_bus",
      "other",
    ]),
    passengerCount: z.number().int().min(1).max(1000),
    tripType: z.enum([
      "local",
      "airport",
      "outstation",
      "wedding",
      "corporate",
      "pilgrimage",
      "other",
    ]),
    requirements: z.string().trim().max(2000).optional().default(""),
    languageCode: z.enum(["en", "hi"]).default("en"),
    consent: z.literal(true),
  })
  .strict()
  .refine(
    (value) => !value.returnDate || value.returnDate >= value.travelDate,
    { path: ["returnDate"], message: "Return date must be on or after the travel date." },
  );

export const faqSearchSchema = z.object({
  q: z.string().trim().min(1).max(120),
  languageCode: z.enum(["en", "hi"]).default("en"),
}).strict();

export const faqIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,14}$/)
  .transform(Number)
  .refine(Number.isSafeInteger);
