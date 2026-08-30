import { NextResponse } from "next/server";
import { operatorRequestAllowed } from "@/lib/operator-auth";
import {
  hasSameOrigin,
  readJsonBody,
  requestBodyErrorResponse
} from "@/lib/request-security";
import {
  appendCustomerEvent,
  consumeRateLimit,
  readPublishedCampaign,
  readRecentCustomerEvents
} from "@/lib/server-store";
import type { CustomerEvent } from "@/lib/types";
import { isWell } from "@/lib/validation";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET(request: Request) {
  if (!operatorRequestAllowed(request)) {
    return NextResponse.json({ message: "고객 반응을 조회할 권한이 없습니다." }, { status: 403 });
  }
  try {
    const events = await readRecentCustomerEvents();
    return NextResponse.json(
      { events, count: events.length },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ message: "고객 반응을 불러오지 못했습니다." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: "허용되지 않은 요청입니다." }, { status: 403 });
  }

  try {
    const rate = await consumeRateLimit("customer-event", request, 60);
    if (!rate.allowed) {
      return NextResponse.json(
        { message: "반응 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        {
          status: 429,
          headers: {
            "retry-after": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000)))
          }
        }
      );
    }
    const body = await readJsonBody(request, 4_096);
    if (!isRecord(body)) {
      return NextResponse.json({ message: "반응 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const type = body.type;
    const productId = String(body.productId ?? "").slice(0, 120);
    const blockId = String(body.blockId ?? "").slice(0, 120);
    const campaign = await readPublishedCampaign();
    const blockExists = campaign?.blocks.some((block) => block.id === blockId);
    if (
      !campaign ||
      (type !== "click" && type !== "like" && type !== "purchase") ||
      !productId ||
      !campaign.products[productId] ||
      !blockId ||
      !blockExists ||
      !isWell(body.well) ||
      body.well !== campaign.products[productId].well
    ) {
      return NextResponse.json(
        { message: "현재 기획전에 해당하지 않는 반응입니다." },
        { status: 422 }
      );
    }

    const event: CustomerEvent = {
      id: crypto.randomUUID(),
      type,
      productId,
      blockId,
      well: body.well,
      at: new Date().toISOString()
    };
    const count = await appendCustomerEvent(event, campaign.id);
    return NextResponse.json({ event, count }, { status: 201 });
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return NextResponse.json({ message: "고객 반응을 저장하지 못했습니다." }, { status: 503 });
  }
}
