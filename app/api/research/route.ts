import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const WELL_QUERY: Record<string, string> = {
  "Eat Well": "nutrition gut health functional food",
  "Nourish Well": "vitamin nutrition wellness",
  "Fit Well": "fitness recovery protein wellness",
  "Relax Well": "sleep relaxation stress wellness",
  "Glow Well": "skin health inner beauty wellness",
  "Care Well": "daily preventive wellness care"
};

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

async function fetchWithTimeout(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "OliveBetter-Cofathon-MVP/1.0",
        accept: "application/json, application/rss+xml, application/xml, text/xml"
      },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function googleNewsSignals(query: string) {
  const baseUrl =
    process.env.TREND_RSS_URL || "https://news.google.com/rss/search";
  const separator = baseUrl.includes("?") ? "&" : "?";
  const url = `${baseUrl}${separator}q=${encodeURIComponent(`${query} wellness when:30d`)}&hl=ko&gl=KR&ceid=KR:ko`;
  const response = await fetchWithTimeout(url);
  return {
    source: "Google News RSS",
    sourceUrl: url,
    items: parseRss(await response.text(), "Google News RSS")
  };
}

async function openAlexSignals(query: string) {
  const fromDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 120)
    .toISOString()
    .slice(0, 10);
  const baseUrl =
    process.env.TREND_OPENALEX_URL || "https://api.openalex.org/works";
  const separator = baseUrl.includes("?") ? "&" : "?";
  const url = `${baseUrl}${separator}search=${encodeURIComponent(query)}&filter=from_publication_date:${fromDate}&sort=publication_date:desc&per-page=14`;
  const response = await fetchWithTimeout(url);
  const payload = (await response.json()) as {
    results?: Array<{
      id: string;
      title: string;
      publication_date: string;
      doi?: string;
      primary_location?: { landing_page_url?: string };
    }>;
  };
  return {
    source: "OpenAlex",
    sourceUrl: url,
    items: (payload.results ?? []).map((work) => ({
      id: work.id,
      title: work.title,
      url: work.primary_location?.landing_page_url || work.doi || work.id,
      publishedAt: work.publication_date,
      source: "OpenAlex"
    }))
  };
}

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  try {
    const body = (await request.json()) as { request?: string; well?: string };
    const mdRequest = String(body.request ?? "").trim();
    if (mdRequest.length < 4) {
      return NextResponse.json(
        {
          status: "needs_context",
          message: "대상 고객, 시즌 또는 해결하려는 일상 상황을 조금 더 구체적으로 입력해 주세요."
        },
        { status: 422 }
      );
    }

    const topic = `${mdRequest} ${WELL_QUERY[body.well ?? ""] ?? "wellness lifestyle"}`;
    if (process.env.TEST_CONNECTORS === "true") {
      const now = new Date();
      const day = (offset: number) =>
        new Date(now.getTime() - offset * 86400000).toISOString();
      return NextResponse.json({
        status: "live",
        topic,
        fetchedAt: new Date().toISOString(),
        startedAt,
        sources: [
          {
            name: "Google News RSS · TEST MOCK",
            url: "https://news.google.com/rss",
            itemCount: 4
          },
          {
            name: "OpenAlex · TEST MOCK",
            url: "https://api.openalex.org/works",
            itemCount: 3
          }
        ],
        failedSources: [],
        signals: [
          {
            id: "test-news-1",
            title: "장마철 직장인 사이에서 짧은 출근 전 운동 루틴 관심 증가",
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
            title: "출근 전 10분, 지속 가능한 컨디션 관리가 새로운 습관으로",
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
      });
    }

    const settled = await Promise.allSettled([
      googleNewsSignals(mdRequest),
      openAlexSignals(topic)
    ]);
    const successful = settled
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    const failed = settled
      .filter((result) => result.status === "rejected")
      .map((result) => (result.reason instanceof Error ? result.reason.message : "연결 실패"));

    const signals = successful.flatMap((entry) => entry.items);
    if (!signals.length) throw new Error(failed.join(", ") || "공개 소스 응답에 자료가 없습니다.");

    return NextResponse.json({
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
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        fetchedAt: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : "공개 트렌드 소스에 연결하지 못했습니다.",
        nextAction: "이전 성공 조사 결과가 있으면 캐시로 전환하고, 없으면 잠시 후 다시 시도하세요."
      },
      { status: 503 }
    );
  }
}
