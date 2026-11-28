import { describe, expect, it } from "vitest";
import { createVideoCallJoinUrl } from "./scheduledVideoCall";

describe("scheduled video-call join URLs", () => {
  it("creates a link on the configured website origin", () => {
    const token = "a".repeat(64);
    expect(createVideoCallJoinUrl("https://urbancruise.in", token))
      .toBe(`https://urbancruise.in/video-call/${token}`);
  });

  it("rejects unsupported or malformed application URLs", () => {
    expect(() => createVideoCallJoinUrl("javascript:alert(1)", "a".repeat(64))).toThrow();
    expect(() => createVideoCallJoinUrl("not a url", "a".repeat(64))).toThrow();
  });
});
