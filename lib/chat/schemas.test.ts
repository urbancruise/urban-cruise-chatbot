import { describe, expect, it } from "vitest";
import {
  agentConversationLocationSchema,
  sessionSchema,
  videoCallRequestSchema,
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

  it("validates video-call requests before notifying an agent", () => {
    const request = {
      sessionToken: "a".repeat(64),
      name: "Video Test",
      email: "video.test@example.com",
      phone: "+919876543210",
    };

    expect(videoCallRequestSchema.safeParse(request).success).toBe(true);
    expect(videoCallRequestSchema.parse({ ...request, allowAgentRecording: true }).allowAgentRecording).toBe(true);
    expect(videoCallRequestSchema.parse(request).allowAgentRecording).toBe(false);
    expect(videoCallRequestSchema.safeParse({ ...request, allowAgentRecording: "yes" }).success).toBe(false);
    expect(videoCallRequestSchema.safeParse({
      ...request,
      scheduledAt: "2030-11-28T13:30:00.000Z",
      timeZone: "Asia/Kolkata",
    }).success).toBe(true);
    expect(videoCallRequestSchema.safeParse({
      ...request,
      scheduledAt: "2030-11-28T13:30:00.000Z",
    }).success).toBe(false);
    expect(videoCallRequestSchema.safeParse({
      ...request,
      scheduledAt: "2030-11-28T13:30:00.000Z",
      timeZone: "Invalid/Zone",
    }).success).toBe(false);
    expect(videoCallRequestSchema.safeParse({ ...request, scheduledAt: "2000-11-28T13:30:00.000Z" }).success).toBe(false);
    expect(videoCallRequestSchema.safeParse({ ...request, email: "invalid" }).success).toBe(false);
    expect(videoCallRequestSchema.safeParse({ ...request, phone: "123" }).success).toBe(false);
    expect(videoCallRequestSchema.safeParse({ ...request, scheduledAt: "not-a-date" }).success).toBe(false);
    expect(videoCallRequestSchema.safeParse({ ...request, sessionToken: "invalid" }).success).toBe(false);
  });
});
