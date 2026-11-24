import { ApiError } from "@/lib/api/http";

const windows = new Map<string, { startedAt: number; count: number }>();

export function enforceRateLimit(
  request: Request,
  action: string,
  limit: number,
  windowMs = 60_000,
) {
  const now = Date.now();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientAddress = request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
  const key = `${action}:${clientAddress}`;
  const current = windows.get(key);

  if (!current || now - current.startedAt >= windowMs) {
    windows.set(key, { startedAt: now, count: 1 });
    if (windows.size > 5000) {
      for (const [storedKey, value] of windows) {
        if (now - value.startedAt >= windowMs) windows.delete(storedKey);
      }
    }
    return;
  }

  if (current.count >= limit) {
    throw new ApiError("RATE_LIMITED", 429);
  }
  current.count += 1;
}
