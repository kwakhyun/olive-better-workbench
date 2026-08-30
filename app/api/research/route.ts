import { NextResponse } from "next/server";
import { fetchWithRetry } from "@/lib/public-source.mjs";
import { operatorRequestAllowed } from "@/lib/operator-auth";
import { hasSameOrigin, readJsonBody, requestBodyErrorResponse } from "@/lib/request-security";
import {
  consumeRateLimit,
  readResearchCache,
  researchCacheKey,
  writeResearchCache
} from "@/lib/server-store";
import type { ResearchPayload, Well } from "@/lib/types";

export const dynamic = "force-dynamic";

const WELL_QUERY: Record<string, string> = {
  "Eat Well": "nutrition gut health functional food",
  "Nourish Well": "vitamin nutrition wellness",
  "Fit Well": "fitness recovery protein wellness",
  "Relax Well": "sleep relaxation stress wellness",
  "Glow Well": "skin health inner beauty wellness",
  "Care Well": "daily preventive wellness care"
};

const WELL_NAMES = new Set(Object.keys(WELL_QUERY));
const CACHE_TTL_MS = 10 * 60 * 1000;
const inFlightResearch = new Map<string, Promise<ResearchPayload>>();

function textContent(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? textContent(match[1]) : "";
}

function parseRss(xml: string, source: string) {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, 16).map((match, index) => {
    const item = match[0];
    return {
      id: `${source}-${index}-${extractTag(item, "title").slice(0, 20)}`,
      title: extractTag(item, "title"),
      url: extractTag(item, "link"),
      publishedAt: extractTag(item, "pubDate") || new Date().toISOString(),
      source
    };
  });
}

const SOURCE_HEADERS = {
  "user-agent": "OliveBetter-Cofathon-MVP/1.0",
  accept: "application/json, application/rss+xml, application/xml, text/xml"
};

async function googleNewsSignals(query: string) {
  const baseUrl =
    process.env.TREND_RSS_URL || "https://news.google.com/rss/search";
  const separator = baseUrl.includes("?") ? "&" : "?";
  const url = `${baseUrl}${separator}q=${encodeURIComponent(`${query} wellness when:30d`)}&hl=ko&gl=KR&ceid=KR:ko`;
  const response = await fetchWithRetry(url, {
    source: "Google News RSS",
    timeoutMs: 10000,
    retries: 1,
    headers: SOURCE_HEADERS
  });
  const items = parseRss(await response.text(), "Google News RSS");
  if (!items.length) throw new Error("Google News RSS: 검색 결과가 없습니다.");
  return {
    source: "Google News RSS",
    sourceUrl: url,
    items
  };
}

async function openAlexSignals(query: string) {
  const fromDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 120)
    .toISOString()
    .slice(0, 10);
  const toDate = new Date().toISOString().slice(0, 10);
  const baseUrl =
    process.env.TREND_OPENALEX_URL || "https://api.openalex.org/works";
  const separator = baseUrl.includes("?") ? "&" : "?";
  const url = `${baseUrl}${separator}search=${encodeURIComponent(query)}&filter=from_publication_date:${fromDate},to_publication_date:${toDate}&sort=publication_date:desc&per-page=14&select=id,title,publication_date,doi,primary_location`;
  const response = await fetchWithRetry(url, {
    source: "OpenAlex",
    timeoutMs: 10000,
    retries: 1,
    headers: SOURCE_HEADERS
  });
  const payload = (await response.json()) as {
    results?: Array<{
      id: string;
      title: string;
      publication_date: string;
      doi?: string;
      primary_location?: { landing_page_url?: string };
    }>;
  };
  const items = (payload.results ?? []).map((work) => ({
    id: work.id,
    title: work.title,
    url: work.primary_location?.landing_page_url || work.doi || work.id,
    publishedAt: work.publication_date,
    source: "OpenAlex"
  }));
  if (!items.length) throw new Error("OpenAlex: 검색 결과가 없습니다.");
  return {
    source: "OpenAlex",
    sourceUrl: url,
    items
  };
}

async function europePmcSignals(query: string) {
  const fromDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 120)
    .toISOString()
    .slice(0, 10);
  const toDate = new Date().toISOString().slice(0, 10);
  const baseUrl =
    process.env.TREND_EUROPEPMC_URL ||
    "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
  const separator = baseUrl.includes("?") ? "&" : "?";
  const search = `(${query}) AND FIRST_PDATE:[${fromDate} TO ${toDate}]`;
  const url = `${baseUrl}${separator}query=${encodeURIComponent(search)}&resultType=lite&format=json&pageSize=14&sort_date=y`;
  const response = await fetchWithRetry(url, {
    source: "Europe PMC",
    timeoutMs: 10000,
    retries: 1,
    headers: SOURCE_HEADERS
  });
  const payload = (await response.json()) as {
    resultList?: {
      result?: Array<{
        id?: string;
        source?: string;
        title?: string;
        firstPublicationDate?: string;
        pubYear?: string;
        doi?: string;
      }>;
    };
  };
  const items = (payload.resultList?.result ?? [])
    .filter((work) => work.id && work.title)
    .map((work) => ({
      id: `Europe PMC-${work.source ?? "article"}-${work.id}`,
      title: work.title ?? "",
      url: work.doi
        ? `https://doi.org/${work.doi.replace(/^https?:\/\/doi\.org\//, "")}`
        : `https://europepmc.org/article/${work.source ?? "MED"}/${work.id}`,
      publishedAt:
        work.firstPublicationDate ||
        (work.pubYear ? `${work.pubYear}-01-01` : new Date().toISOString()),
      source: "Europe PMC"
    }));
  if (!items.length) throw new Error("Europe PMC: 검색 결과가 없습니다.");
  return {
    source: "Europe PMC",
    sourceUrl: url,
    items
  };
}

function testResearch(topic: string, startedAt: string): ResearchPayload {
  const now = new Date();
  const day = (offset: number) => new Date(now.getTime() - offset * 86400000).toISOString();
  return {
    status: "live",
    topic,
    fetchedAt: new Date().toISOString(),
    startedAt,
    sources: [
      { name: "Google News RSS · TEST MOCK", url: "https://news.google.com/rss", itemCount: 4 },
      { name: "OpenAlex · TEST MOCK", url: "https://api.openalex.org/works", itemCount: 3 }
    ],
    failedSources: [],
    signals: [
      {
        id: "test-news-1",
        title: "장마철 직장인 사이에서 출근 전 짧은 운동 루틴에 대한 관심 증가",
        url: "https://example.com/trend/1",
        publishedAt: day(1),
        source: "Google News RSS · TEST MOCK"
      },
      {
        id: "test-news-2",
        title: "웰니스 초보 직장인이 주목하는 단백질과 회복 중심 루틴",
        url: "https://example.com/trend/2",
        publishedAt: day(2),
        source: "Google News RSS · TEST MOCK"
      },
      {
        id: "test-news-3",
        title: "출근 전 10분 컨디션 관리가 새로운 일상 습관으로",
        url: "https://example.com/trend/3",
        publishedAt: day(3),
        source: "Google News RSS · TEST MOCK"
      },
      {
        id: "test-research-1",
        title: "Morning exercise routines and perceived energy among office workers",
        url: "https://example.com/research/1",
        publishedAt: day(5),
        source: "OpenAlex · TEST MOCK"
      },
      {
        id: "test-research-2",
        title: "Protein intake and recovery habits in novice runners",
        url: "https://example.com/research/2",
        publishedAt: day(8),
        source: "OpenAlex · TEST MOCK"
      },
      {
        id: "test-ad",
        title: "광고 쿠폰 코드로 만나는 기적의 운동 보조제",
        url: "https://example.com/ad",
        publishedAt: day(1),
        source: "Google News RSS · TEST MOCK"
      }
    ]
  };
}

async function collectResearch(mdRequest: string, well: Well): Promise<ResearchPayload> {
  const startedAt = new Date().toISOString();
  const topic = `${mdRequest} ${WELL_QUERY[well]}`;
  if (process.env.TEST_CONNECTORS === "true") return testResearch(topic, startedAt);

  const scientificQuery = WELL_QUERY[well];
  const settled = await Promise.allSettled([
    googleNewsSignals(mdRequest),
    europePmcSignals(scientificQuery),
    openAlexSignals(scientificQuery)
  ]);
  const successful = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failed = settled
    .filter((result) => result.status === "rejected")
    .map((result) => (result.reason instanceof Error ? result.reason.message : "연결 실패"));
  const signals = successful.flatMap((entry) => entry.items);
  if (!signals.length) {
    throw new Error(`공개 트렌드 자료를 불러오지 못했습니다. ${failed.join(" ")}`.trim());
  }
  return {
    status: "live",
    topic,
    fetchedAt: new Date().toISOString(),
    startedAt,
    sources: successful.map(({ source, sourceUrl, items }) => ({
      name: source,
      url: sourceUrl,
      itemCount: items.length
    })),
    failedSources: failed,
    signals
  };
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request) || !operatorRequestAllowed(request)) {
    return NextResponse.json({ message: "트렌드를 조사할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const rate = await consumeRateLimit("research", request, 6);
    if (!rate.allowed) {
      return NextResponse.json(
        { message: "트렌드 조사 요청이 너무 많습니다.", nextAction: "1분 뒤 다시 시도해 주세요." },
        {
          status: 429,
          headers: { "retry-after": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) }
        }
      );
    }

    const body = (await readJsonBody(request)) as { request?: string; well?: string };
    const mdRequest = String(body.request ?? "").trim().slice(0, 500);
    if (mdRequest.length < 4) {
      return NextResponse.json(
        {
          status: "needs_context",
          message: "대상 고객, 시즌 또는 해결하려는 일상 상황을 조금 더 구체적으로 입력해 주세요."
        },
        { status: 422 }
      );
    }

    if (!body.well || !WELL_NAMES.has(body.well)) {
      return NextResponse.json(
        { status: "needs_context", message: "6대 Well 중 하나를 선택해 주세요." },
        { status: 422 }
      );
    }

    const well = body.well as Well;
    const cacheKey = await researchCacheKey(mdRequest, well);
    const cached = await readResearchCache(cacheKey);
    if (cached) {
      return NextResponse.json({
        ...cached,
        status: "cached",
        fallbackReason: "10분 이내 같은 요청의 서버 캐시를 사용했습니다."
      });
    }

    let task = inFlightResearch.get(cacheKey);
    if (!task) {
      task = collectResearch(mdRequest, well);
      inFlightResearch.set(cacheKey, task);
    }
    try {
      const payload = await task;
      await writeResearchCache(cacheKey, payload, CACHE_TTL_MS);
      return NextResponse.json(payload);
    } finally {
      if (inFlightResearch.get(cacheKey) === task) inFlightResearch.delete(cacheKey);
    }
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return NextResponse.json(
      {
        status: "failed",
        fetchedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "공개 트렌드 조사를 처리하지 못했습니다.",
        nextAction: "입력 내용을 확인하고 잠시 후 다시 시도해 주세요."
      },
      { status: 503 }
    );
  }
}
