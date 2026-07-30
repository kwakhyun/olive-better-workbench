import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Banner = {
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
};

function parseBanner(content: string): Banner {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("LLM이 JSON 형식의 문구를 반환하지 않았습니다.");
  const parsed = JSON.parse(jsonMatch[0]) as Partial<Banner>;
  const banner = {
    eyebrow: String(parsed.eyebrow ?? "").trim(),
    title: String(parsed.title ?? "").trim(),
    subtitle: String(parsed.subtitle ?? "").trim(),
    cta: String(parsed.cta ?? "").trim()
  };
  if (!banner.title || !banner.subtitle || !banner.cta) {
    throw new Error("LLM 응답에 필수 배너 문구가 없습니다.");
  }
  return banner;
}

export async function POST(request: Request) {
  if (process.env.TEST_CONNECTORS === "true") {
    return NextResponse.json({
      status: "live",
      generatedAt: new Date().toISOString(),
      model: "test-safe-copy · MOCK",
      banner: {
        eyebrow: "OLIVE BETTER · RAINY SEASON",
        title: "비 오는 날에도, 내 리듬은 가볍게",
        subtitle:
          "출근 전 짧은 순간에 더하는 안전하고 간결한 웰니스 루틴을 만나보세요.",
        cta: "아침 루틴 시작하기"
      }
    });
  }

  const apiUrl = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!apiUrl || !apiKey || !model) {
    return NextResponse.json(
      {
        status: "unavailable",
        code: "LLM_NOT_CONFIGURED",
        message: "대표 배너 생성 연결 정보가 없습니다.",
        nextAction:
          ".env.local에 LLM_API_URL, LLM_API_KEY, LLM_MODEL을 설정한 뒤 다시 생성해 주세요."
      },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as {
      request?: string;
      well?: string;
      theme?: string;
      signals?: string[];
      products?: string[];
    };
    const prompt = [
      "당신은 올리브영 웰니스 전문 플랫폼 OLIVE BETTER의 한국어 카피라이터입니다.",
      "고객이 기획전의 가치와 다음 행동을 바로 이해하도록 대표 배너 문구를 작성하세요.",
      "질병 치료·예방 단정, 과장, 의약품 오인 표현을 절대 사용하지 마세요.",
      "JSON 이외의 텍스트는 출력하지 마세요.",
      '형식: {"eyebrow":"20자 이내","title":"28자 이내","subtitle":"58자 이내","cta":"14자 이내"}',
      `MD 요청: ${String(body.request ?? "").slice(0, 500)}`,
      `Well: ${body.well ?? ""}`,
      `테마: ${body.theme ?? ""}`,
      `최신 신호: ${(body.signals ?? []).slice(0, 5).join(" | ")}`,
      `추천 상품: ${(body.products ?? []).slice(0, 6).join(" | ")}`
    ].join("\n");

    const authHeader = process.env.LLM_AUTH_HEADER || "Authorization";
    const authScheme = process.env.LLM_AUTH_SCHEME ?? "Bearer";
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [authHeader]: `${authScheme ? `${authScheme} ` : ""}${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "안전하고 담백한 한국어 웰니스 커머스 문구만 JSON으로 작성합니다."
          },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`LLM 연결이 HTTP ${response.status}로 응답했습니다.`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM 응답 본문이 비어 있습니다.");

    return NextResponse.json({
      status: "live",
      generatedAt: new Date().toISOString(),
      model,
      banner: parseBanner(content)
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        message:
          error instanceof Error ? error.message : "대표 배너 문구 생성에 실패했습니다.",
        nextAction: "연결 정보와 호출 한도를 확인한 뒤 배너 문구 생성을 다시 시도하세요."
      },
      { status: 502 }
    );
  }
}
