import { describe, expect, it } from "vitest";
import { hashAgentPassword, verifyAgentPassword } from "./password";

describe("agent password hashing", () => {
  const salt = "0123456789abcdef0123456789abcdef";

  it("verifies the password that produced the stored hash", () => {
    const hash = hashAgentPassword("a-secure-agent-password", salt);

    expect(verifyAgentPassword("a-secure-agent-password", salt, hash)).toBe(true);
    expect(verifyAgentPassword("a-different-password", salt, hash)).toBe(false);
  });

  it("rejects malformed stored salts and hashes", () => {
    expect(verifyAgentPassword("password", "bad-salt", "bad-hash")).toBe(false);
  });
});
