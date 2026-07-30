import assert from "node:assert/strict";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }
    },
    {
      waitUntil() {},
      passThroughOnException() {}
    }
  );
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
