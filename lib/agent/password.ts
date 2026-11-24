import { scryptSync, timingSafeEqual } from "node:crypto";

export function hashAgentPassword(password: string, salt: string) {
  return scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex");
}

export function verifyAgentPassword(password: string, salt: string, expectedHash: string) {
  if (!/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(hashAgentPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return timingSafeEqual(actual, expected);
}
