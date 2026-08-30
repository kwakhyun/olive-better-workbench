import { NextResponse } from "next/server";

const DEFAULT_MAX_JSON_BYTES = 32_768;

export class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function readJsonBody(request: Request, maxBytes = DEFAULT_MAX_JSON_BYTES) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyError("요청 내용이 너무 큽니다.", 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RequestBodyError("요청 내용이 너무 큽니다.", 413);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestBodyError("요청 형식이 올바르지 않습니다.", 400);
  }
}

export function requestBodyErrorResponse(error: unknown) {
  if (!(error instanceof RequestBodyError)) return null;
  return NextResponse.json({ message: error.message }, { status: error.status });
}

export function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
