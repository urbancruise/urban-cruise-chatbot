import { describe, expect, it } from "vitest";
import {
  agentConversationLocationSchema,
  sessionSchema,
} from "./schemas";

describe("chat location schemas", () => {
  it("defaults sessions without a website location to Global", () => {
    expect(sessionSchema.parse({}).locationSlug).toBe("global");
  });

  it("accepts known and future lowercase city slugs", () => {
    expect(sessionSchema.parse({ locationSlug: "gurugram" }).locationSlug).toBe("gurugram");
    expect(sessionSchema.parse({ locationSlug: "jaipur-north" }).locationSlug).toBe("jaipur-north");
    expect(agentConversationLocationSchema.parse("all")).toBe("all");
  });

  it("rejects malformed city slugs", () => {
    expect(sessionSchema.safeParse({ locationSlug: "New Delhi" }).success).toBe(false);
    expect(agentConversationLocationSchema.safeParse("mumbai?sort=1").success).toBe(false);
  });
});
