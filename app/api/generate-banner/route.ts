import { NextResponse } from "next/server";
import { generateSafeBanner, SAFE_COPY_ENGINE } from "@/lib/safe-copy.mjs";
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
  try {
    const body = (await request.json()) as {
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
  } catch {
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
