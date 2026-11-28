import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRealtimeTicket,
  getRealtimeTicketParticipantId,
  verifyRealtimeTicket,
} from "./tickets";

describe("realtime call tickets", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("signs a scoped participant ticket and verifies its identity", () => {
    vi.stubEnv("CHATBOT_REALTIME_SECRET", "test-only-realtime-secret");
    const ticket = createRealtimeTicket({
      roomId: "e35d0b77-189e-4e16-a4cc-ad712b3e2886",
      sessionId: 42,
      role: "guest",
      displayName: "Guest",
      recordingConsent: true,
    });

    expect(verifyRealtimeTicket(ticket)).toMatchObject({
      roomId: "e35d0b77-189e-4e16-a4cc-ad712b3e2886",
      sessionId: 42,
      role: "guest",
      displayName: "Guest",
      recordingConsent: true,
      participantId: getRealtimeTicketParticipantId(ticket),
    });
  });

  it("rejects a ticket whose signature has been changed", () => {
    vi.stubEnv("CHATBOT_REALTIME_SECRET", "test-only-realtime-secret");
    const ticket = createRealtimeTicket({
      roomId: "e35d0b77-189e-4e16-a4cc-ad712b3e2886",
      sessionId: 42,
      role: "customer",
      displayName: "Customer",
    });
    const [payload, signature] = ticket.split(".");
    const modified = `${payload}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;

    expect(verifyRealtimeTicket(modified)).toBeNull();
  });
});
