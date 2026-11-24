import { ZodError } from "zod";

const MAX_JSON_BYTES = 16_384;

export async function readJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_JSON_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE", 413);

  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new ApiError("INVALID_JSON", 400);
  }
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    throw new ApiError("PAYLOAD_TOO_LARGE", 413);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError("INVALID_JSON", 400);
  }
}

export function validationError(error: ZodError) {
  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        fields: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    },
    { status: 400 },
  );
}

export function apiError(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: { code: error.code } }, { status: error.status });
  }
  console.error("Chat API request failed", error);
  return Response.json(
    { error: { code: "SERVICE_UNAVAILABLE" } },
    { status: 503 },
  );
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
