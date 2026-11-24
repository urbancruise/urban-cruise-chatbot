import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import {
  hasValidPublishSecret,
  hashCustomerToken,
  verifyCmsTicket,
} from "./realtime-auth.mjs";

const secret = "realtime-test-secret-with-enough-entropy";

describe("realtime authentication", () => {
  it("only hashes correctly formatted customer session tokens", () => {
    const token = "a".repeat(64);
    expect(hashCustomerToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCustomerToken("not-a-session-token")).toBeNull();
  });

  it("accepts only CMS tickets with the expected identity, scope, issuer, and audience", () => {
    const ticket = jwt.sign(
      { scope: "chatbot.manage" },
      secret,
      {
        subject: "42",
        issuer: "cms-urban-cruise",
        audience: "urban-cruise-chatbot-realtime",
        expiresIn: "1m",
      },
    );
    const wrongScope = jwt.sign(
      { scope: "users.view" },
      secret,
      {
        subject: "42",
        issuer: "cms-urban-cruise",
        audience: "urban-cruise-chatbot-realtime",
        expiresIn: "1m",
      },
    );
    const wrongAudience = jwt.sign(
      { scope: "chatbot.manage" },
      secret,
      {
        subject: "42",
        issuer: "cms-urban-cruise",
        audience: "another-service",
        expiresIn: "1m",
      },
    );
    const expired = jwt.sign(
      { scope: "chatbot.manage" },
      secret,
      {
        subject: "42",
        issuer: "cms-urban-cruise",
        audience: "urban-cruise-chatbot-realtime",
        expiresIn: "-1s",
      },
    );

    const verifiedTicket = verifyCmsTicket(ticket, secret);
    expect(verifiedTicket?.id).toBe(42);
    expect(verifiedTicket?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(verifyCmsTicket(wrongScope, secret)).toBeNull();
    expect(verifyCmsTicket(wrongAudience, secret)).toBeNull();
    expect(verifyCmsTicket(expired, secret)).toBeNull();
    expect(verifyCmsTicket("invalid", secret)).toBeNull();
  });

  it("checks internal publish credentials without accepting malformed headers", () => {
    expect(hasValidPublishSecret(`Bearer ${secret}`, secret)).toBe(true);
    expect(hasValidPublishSecret(`Bearer ${secret}x`, secret)).toBe(false);
    expect(hasValidPublishSecret(secret, secret)).toBe(false);
  });
});
