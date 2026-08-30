import { NextResponse } from "next/server";
import { generateSafeBanner, SAFE_COPY_ENGINE } from "@/lib/safe-copy.mjs";
import { operatorRequestAllowed } from "@/lib/operator-auth";
import { hasSameOrigin, readJsonBody, requestBodyErrorResponse } from "@/lib/request-security";
import { consumeRateLimit } from "@/lib/server-store";
import type { Well } from "@/lib/types";

export const dynamic = "force-dynamic";

const WELL_NAMES = new Set([
  "Eat Well",
  "Nourish Well",
  "Fit Well",
  "Relax Well",
  "Glow Well",
  "Care Well"
]);

export async function POST(request: Request) {
  if (!hasSameOrigin(request) || !operatorRequestAllowed(request)) {
    return NextResponse.json({ message: "대표 문구를 만들 권한이 없습니다." }, { status: 403 });
  }
  try {
    const rate = await consumeRateLimit("banner", request, 30);
    if (!rate.allowed) {
      return NextResponse.json(
        { message: "대표 문구 생성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429 }
      );
    }
    const body = (await readJsonBody(request)) as {
      request?: string;
      well?: string;
    };
    const well = String(body.well ?? "");
    if (!WELL_NAMES.has(well)) {
      return NextResponse.json(
        { status: "failed", message: "6대 Well 중 하나를 선택해 주세요." },
        { status: 422 }
      );
    }
    return NextResponse.json({
      status: "generated",
      generatedAt: new Date().toISOString(),
      engine: SAFE_COPY_ENGINE,
      banner: generateSafeBanner({
        request: String(body.request ?? "").slice(0, 500),
        well: well as Well
      })
    });
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return NextResponse.json(
      {
        status: "failed",
        message: "안전한 대표 문구를 만들지 못했습니다.",
        nextAction: "입력 내용을 확인한 뒤 다시 시도해 주세요."
      },
      { status: 400 }
    );
  }
}
