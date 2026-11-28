import { z } from "zod";

export const sessionSchema = z
  .object({
    languageCode: z.enum(["en", "hi"]).default("en"),
    locationSlug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).default("global"),
  })
  .strict();

export const agentConversationLocationSchema = z.union([
  z.literal("all"),
  z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
]);

export const sessionTokenSchema = z.string().regex(/^[a-f0-9]{64}$/i);

export const chatHistorySchema = z.object({
  sessionToken: sessionTokenSchema,
}).strict();

const timeZoneSchema = z.string().trim().min(1).max(64).refine((timeZone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
});

export const videoCallRequestSchema = z.object({
  sessionToken: sessionTokenSchema,
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().regex(/^\+91[6-9]\d{9}$/, "Enter a valid Indian mobile number."),
  allowAgentRecording: z.boolean().optional().default(false),
  scheduledAt: z.string().datetime().optional(),
  timeZone: timeZoneSchema.optional(),
}).strict().refine(
  (value) => !value.scheduledAt || Date.parse(value.scheduledAt) > Date.now(),
  { path: ["scheduledAt"], message: "Scheduled time must be in the future." },
).refine(
  (value) => !value.scheduledAt || Boolean(value.timeZone),
  { path: ["timeZone"], message: "A time zone is required for scheduled calls." },
);

export const videoCallRescheduleSchema = z.object({
  sessionToken: sessionTokenSchema,
  scheduledAt: z.string().datetime(),
  timeZone: timeZoneSchema,
}).strict().refine(
  (value) => Date.parse(value.scheduledAt) > Date.now(),
  { path: ["scheduledAt"], message: "Scheduled time must be in the future." },
);

export const agentLoginSchema = z.object({
  username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(12).max(128),
}).strict();

export const agentReplySchema = z.object({
  text: z.string().trim().min(1).max(2000),
}).strict();

export const agentConversationStatusSchema = z.object({
  status: z.literal("closed"),
}).strict();

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
