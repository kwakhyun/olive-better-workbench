import { NextResponse } from "next/server";
import rules from "@/data/rules.json";
import { canPublish } from "@/lib/engine.mjs";
import { operatorRequestAllowed } from "@/lib/operator-auth";
import {
  hasSameOrigin,
  readJsonBody,
  requestBodyErrorResponse
} from "@/lib/request-security";
import {
  consumeRateLimit,
  publishCampaign,
  readPublishedCampaign
} from "@/lib/server-store";
import type { Draft, PublishCheck } from "@/lib/types";
import { isDraft } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const campaign = await readPublishedCampaign();
    return NextResponse.json(
      { campaign },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { message: "발행된 기획전을 불러오지 못했습니다." },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  if (!operatorRequestAllowed(request)) {
    return NextResponse.json(
      { message: "기획전을 발행할 권한이 없습니다." },
      { status: 403 }
    );
  }

  try {
    const rate = await consumeRateLimit("campaign-publish", request, 30);
    if (!rate.allowed) {
      return NextResponse.json(
        { message: "발행 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429 }
      );
    }
    const body = await readJsonBody(request, 262_144);
    const draft =
      typeof body === "object" && body !== null && "draft" in body
        ? (body as { draft: unknown }).draft
        : null;
    if (!isDraft(draft)) {
      return NextResponse.json(
        { message: "발행할 기획전 형식이 올바르지 않습니다." },
        { status: 422 }
      );
    }

    const check = canPublish(draft, rules) as PublishCheck;
    if (!check.allowed) {
      return NextResponse.json(
        { message: `발행 안전 조건을 통과하지 못했습니다. ${check.reasons[0] ?? "초안을 확인해 주세요."}` },
        { status: 422 }
      );
    }

    const campaign: Draft = {
      ...draft,
      status: "published",
      publishedAt: new Date().toISOString()
    };
    await publishCampaign(campaign);
    return NextResponse.json({ campaign });
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return NextResponse.json(
      { message: "기획전을 공유 저장소에 발행하지 못했습니다." },
      { status: 503 }
    );
  }
}
