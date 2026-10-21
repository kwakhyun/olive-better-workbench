import { NextResponse } from "next/server";
import productsJson from "@/data/products.json";
import rules from "@/data/rules.json";
import { WELL_META, cleanSignals, createDraft } from "@/lib/engine.mjs";
import { operatorRequestAllowed } from "@/lib/operator-auth";
import { hasSameOrigin, readJsonBody, requestBodyErrorResponse } from "@/lib/request-security";
import { consumeRateLimit, readRecentCustomerEvents } from "@/lib/server-store";
import type {
  BannerCopy,
  CustomerEvent,
  Draft,
  Product,
  RawTrendSignal,
  ResearchPayload,
  Well
} from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_EVENTS = 200;
const MAX_SIGNALS = 64;
const WELL_NAMES = new Set(Object.keys(WELL_META));
const buildDraft = createDraft as (input: {
  request: string;
  selectedWell: Well;
  products: Product[];
  rules: typeof rules;
  signals: Draft["research"]["signals"];
  events: CustomerEvent[];
  banner?: BannerCopy;
  research: Draft["research"];
}) => Draft;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseWell(value: unknown): Well | null {
  return typeof value === "string" && WELL_NAMES.has(value) ? (value as Well) : null;
}

function parseSignal(value: unknown): RawTrendSignal | null {
  if (!isRecord(value)) return null;
  const id = String(value.id ?? "").slice(0, 240);
  const title = String(value.title ?? "").trim().slice(0, 500);
  const url = safeHttpUrl(value.url);
  const publishedAt = String(value.publishedAt ?? "").slice(0, 80);
  const source = String(value.source ?? "").trim().slice(0, 120);
  if (!id || !title || !url || !source) return null;
  return { id, title, url, publishedAt, source };
}

function safeHttpUrl(value: unknown) {
  try {
    const url = new URL(String(value ?? "").slice(0, 2000));
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function parseResearch(value: unknown): ResearchPayload | null {
  if (!isRecord(value) || !Array.isArray(value.signals) || !Array.isArray(value.sources)) {
    return null;
  }
  const status = value.status === "cached" ? "cached" : value.status === "live" ? "live" : null;
  if (!status) return null;
  const signals = value.signals.slice(0, MAX_SIGNALS).map(parseSignal).filter(Boolean) as RawTrendSignal[];
  if (!signals.length) return null;
  const sources = value.sources.slice(0, 8).flatMap((source) => {
    if (!isRecord(source)) return [];
    const url = safeHttpUrl(source.url);
    if (!url) return [];
    return [{
      name: String(source.name ?? "").slice(0, 120),
      url,
      itemCount: Number(source.itemCount ?? 0)
    }];
  });
  return {
    status,
    topic: String(value.topic ?? "").slice(0, 1000),
    fetchedAt: String(value.fetchedAt ?? "").slice(0, 80),
    sources,
    signals,
    fallbackReason: value.fallbackReason ? String(value.fallbackReason).slice(0, 1000) : undefined
  };
}

function parseEvent(value: unknown): CustomerEvent | null {
  if (!isRecord(value)) return null;
  if (value.type !== "click" && value.type !== "like" && value.type !== "purchase") return null;
  const well = parseWell(value.well);
  return {
    id: String(value.id ?? "").slice(0, 120),
    type: value.type,
    productId: value.productId ? String(value.productId).slice(0, 120) : undefined,
    blockId: value.blockId ? String(value.blockId).slice(0, 120) : undefined,
    well: well ?? undefined,
    at: String(value.at ?? "").slice(0, 80)
  };
}

function parseBanner(value: unknown): BannerCopy | undefined {
  if (!isRecord(value)) return undefined;
  const banner = {
    eyebrow: String(value.eyebrow ?? "").slice(0, 30),
    title: String(value.title ?? "").slice(0, 28),
    subtitle: String(value.subtitle ?? "").slice(0, 58),
    cta: String(value.cta ?? "").slice(0, 14)
  };
  return Object.values(banner).every(Boolean) ? banner : undefined;
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request) || !operatorRequestAllowed(request)) {
    return NextResponse.json({ message: "초안을 만들 권한이 없습니다." }, { status: 403 });
  }

  let body: unknown;
  try {
    const rate = await consumeRateLimit("assemble-draft", request, 20);
    if (!rate.allowed) {
      return NextResponse.json(
        { message: "초안 생성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429 }
      );
    }
    body = await readJsonBody(request, 262_144);
  } catch (error) {
    return (
      requestBodyErrorResponse(error) ??
      NextResponse.json({ message: "초안 생성 요청을 처리하지 못했습니다." }, { status: 503 })
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const mdRequest = String(body.request ?? "").trim().slice(0, 500);
  const well = parseWell(body.well);
  const research = parseResearch(body.research);
  if (mdRequest.length < 4 || !well || !research) {
    return NextResponse.json(
      { message: "기획 요청, Well, 트렌드 근거가 올바른지 확인해 주세요." },
      { status: 422 }
    );
  }

  const cleaned = cleanSignals(research.signals, mdRequest, rules, new Date(), WELL_META[well].keywords);
  if (!cleaned.accepted.length) {
    return NextResponse.json(
      {
        message: "요청과 관련된 최신 트렌드 근거가 부족해 초안을 만들지 않았습니다.",
        nextAction: "대상 고객이나 상황을 더 구체적으로 입력해 주세요."
      },
      { status: 422 }
    );
  }

  const events = (await readRecentCustomerEvents(MAX_EVENTS))
    .map(parseEvent)
    .filter(Boolean) as CustomerEvent[];
  const banner = parseBanner(body.banner);
  const bannerStatus = body.bannerStatus === "generated" && banner ? "generated" : "failed";
  const bannerError = body.bannerError ? String(body.bannerError).slice(0, 1000) : "";

  const draft = buildDraft({
    request: mdRequest,
    selectedWell: well,
    products: productsJson as Product[],
    rules,
    signals: cleaned.accepted,
    events,
    banner,
    research: {
      status: research.status,
      topic: research.topic,
      fetchedAt: research.fetchedAt,
      sources: research.sources,
      signals: cleaned.accepted,
      excludedSignals: cleaned.excluded,
      bannerStatus,
      bannerEngine: bannerStatus === "generated" ? String(body.bannerEngine ?? "").slice(0, 200) : "",
      bannerGeneratedAt:
        bannerStatus === "generated" ? String(body.bannerGeneratedAt ?? "").slice(0, 80) : "",
      fallbackReason: [research.fallbackReason, bannerError].filter(Boolean).join(" · ")
    }
  });

  return NextResponse.json({ draft });
}
