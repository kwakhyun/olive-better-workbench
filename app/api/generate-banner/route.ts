import { NextResponse } from "next/server";
import { generateSafeBanner, SAFE_COPY_ENGINE } from "@/lib/safe-copy.mjs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      request?: string;
      well?: string;
    };
    return NextResponse.json({
      status: "generated",
      generatedAt: new Date().toISOString(),
      engine: SAFE_COPY_ENGINE,
      banner: generateSafeBanner({
        request: String(body.request ?? "").slice(0, 500),
        well: String(body.well ?? "")
      })
    });
  } catch {
    return NextResponse.json(
      {
        status: "failed",
        message: "안전 카피 생성 요청을 처리하지 못했습니다.",
        nextAction: "입력 내용을 확인한 뒤 다시 시도해 주세요."
      },
      { status: 400 }
    );
  }
}
