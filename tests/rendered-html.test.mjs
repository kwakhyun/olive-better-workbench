import assert from "node:assert/strict";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function requestWorker(pathname = "/", init = { headers: { accept: "text/html" } }) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, init),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }
    },
    {
      waitUntil() {},
      passThroughOnException() {}
    }
  );
}

async function render(pathname = "/") {
  return requestWorker(pathname);
}

test("운영자 화면을 서버 렌더링한다", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Better Workbench/);
  assert.match(html, /웰니스 기획전/);
  assert.match(html, /트렌드 조사 &amp; 초안 만들기/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("고객 화면은 발행본이 없을 때 안전한 빈 상태만 렌더링한다", async () => {
  const response = await render("/shop");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /NOT PUBLISHED YET/);
  assert.match(html, /안전 검토를 마친 기획전만/);
  assert.doesNotMatch(html, /DRAFT · 비공개/);
});

test("소셜 미리보기 자산이 빌드 입력에 존재한다", async () => {
  const { access } = await import("node:fs/promises");
  await assert.doesNotReject(access(new URL("public/og.png", root)));
});

test("초안 조립 API가 서버의 상품 원본과 안전 규칙으로 결과를 만든다", async () => {
  const now = new Date().toISOString();
  const response = await requestWorker("/api/assemble-draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      request: "출근 전 운동과 회복 루틴을 찾는 초보 직장인",
      well: "Fit Well",
      research: {
        status: "live",
        topic: "직장인 운동 회복",
        fetchedAt: now,
        sources: [{ name: "Test", url: "https://example.com", itemCount: 3 }],
        signals: [
          {
            id: "signal-1",
            title: "초보 직장인의 출근 전 운동과 회복 루틴 관심 증가",
            url: "https://example.com/signal-1",
            publishedAt: now,
            source: "Test"
          }
        ]
      },
      events: [],
      bannerStatus: "generated",
      bannerEngine: "test-safe-copy-engine",
      bannerGeneratedAt: now,
      banner: {
        eyebrow: "OLIVE BETTER · FIT WELL",
        title: "움직이는 하루를 위한 가벼운 루틴",
        subtitle: "안전 기준으로 고른 움직임과 회복 루틴이에요.",
        cta: "움직임 루틴 보기"
      }
    })
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.draft.status, "draft");
  assert.equal(payload.draft.well, "Fit Well");
  assert.equal(Object.keys(payload.draft.products).length, 10);
  assert.equal(payload.draft.research.signals.length, 1);
});

test("초안 조립 API는 허용되지 않은 Well과 근거 없는 요청을 거부한다", async () => {
  const response = await requestWorker("/api/assemble-draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request: "테스트 기획", well: "Unknown Well", research: null })
  });

  assert.equal(response.status, 422);
});
