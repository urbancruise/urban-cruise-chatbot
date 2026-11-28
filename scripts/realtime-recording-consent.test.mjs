import { describe, expect, it } from "vitest";
import { canStartRecordingWithoutPrompt } from "./realtime-recording-consent.mjs";

const agent = { participantId: "agent-1", role: "agent" };
const optedInCustomer = { participantId: "customer-1", role: "customer", recordingConsent: true };

describe("agent recording pre-consent", () => {
  it("allows an agent to start without an in-call prompt when every other participant opted in", () => {
    expect(canStartRecordingWithoutPrompt(agent, [agent, optedInCustomer])).toBe(true);
  });

  it("requires the in-call consent prompt if any participant has not opted in", () => {
    const guest = { participantId: "guest-1", role: "guest", recordingConsent: false };
    expect(canStartRecordingWithoutPrompt(agent, [agent, optedInCustomer, guest])).toBe(false);
  });

  it("does not bypass the prompt for customer-requested recordings", () => {
    const customer = { ...optedInCustomer, role: "customer" };
    const agentWithConsent = { ...agent, recordingConsent: true };
    expect(canStartRecordingWithoutPrompt(customer, [customer, agentWithConsent])).toBe(false);
  });

  it("does not allow recording when the requester is not in the call", () => {
    expect(canStartRecordingWithoutPrompt(agent, [optedInCustomer])).toBe(false);
  });
});
