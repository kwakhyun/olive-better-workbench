import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTsLoader } from "./helpers/load-ts.mjs";
import { makeDraft, rules } from "./helpers/fixtures.mjs";
import { editDraftHero, removeDraftProduct } from "../lib/draft-editing.mjs";
import { canPublish } from "../lib/engine.mjs";
import { isDraftData } from "../lib/page-schema.mjs";

const load = createTsLoader();
const { default: PageRenderer } = await load("app/components/PageRenderer.tsx");
const { default: ReviewWorkspace } = await load("app/components/workbench/ReviewWorkspace.tsx");

function reviewMarkup(draft) {
  return renderToStaticMarkup(React.createElement(ReviewWorkspace, {
    draft, stage: "published", activePanel: "safety", publishCheck: canPublish(draft, rules),
    onPanelChange() {}, onPublish() {}, onEditHero() {}, onRemoveProduct() {}
  }));
}

test("발행 후 문구 수정과 상품 제외는 저장 가능한 초안으로 돌아오고 재발행 버튼을 활성화한다", async () => {
  const baseline = { ...makeDraft(), status: "published", publishedAt: new Date().toISOString(), publicationId: "publication-A" };
  assert.match(reviewMarkup(baseline), /class="publish-button" disabled=""/);
  const edited = editDraftHero(baseline, "title", "내일도 이어가는 작은 운동 루틴", rules);
  const productId = Object.keys(edited.products)[0];
  const removed = removeDraftProduct(edited, productId);
  for (const revision of [edited, removed]) {
    assert.equal(revision.status, "draft");
    assert.equal(revision.publishedAt, undefined);
    assert.equal(revision.publicationId, undefined);
    assert.equal(isDraftData(revision), true);
    assert.equal(canPublish(revision, rules).allowed, true);
    assert.doesNotMatch(reviewMarkup(revision), /class="publish-button" disabled/);
  }
  assert.ok(baseline.products[productId], "기존 발행본은 바뀌지 않아야 한다");
  assert.equal(removed.products[productId], undefined);
  assert.ok(removed.blocks.every((block) => !block.productIds?.includes(productId) && !block.steps?.some((step) => step.productId === productId)));
  const values = new Map();
  const previous = globalThis.window;
  globalThis.window = { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  } };
  try {
    const storage = await load("lib/client-storage.ts");
    assert.equal(storage.saveDraft(removed), true);
    const afterReload = await createTsLoader()("lib/client-storage.ts");
    const restored = afterReload.readDraft();
    assert.equal(restored.status, "draft");
    assert.equal(restored.blocks[0].title, "내일도 이어가는 작은 운동 루틴");
    assert.equal(restored.products[productId], undefined);
    assert.doesNotMatch(reviewMarkup(restored), /class="publish-button" disabled/);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test("고객 반응 이후 선택한 상품 14개가 모두 실제 상품 카드로 렌더링된다", () => {
  const draft = makeDraft({ events: [{ type: "like", blockId: "editors-pick", well: "Fit Well" }] });
  const html = renderToStaticMarkup(React.createElement(PageRenderer, { config: draft }));
  const renderedIds = new Set([...html.matchAll(/data-product-id="([^"]+)"/g)].map((match) => match[1]));
  assert.equal(draft.audit.includedCount, 14);
  assert.equal(renderedIds.size, 14);
  assert.deepEqual([...renderedIds].sort(), Object.keys(draft.products).sort());
});

test("손상된 필수 화면은 발행이 차단되고 알 수 없는 영역은 실제 렌더러에서만 격리된다", () => {
  const draft = makeDraft();
  const malformed = { ...draft, palette: undefined };
  assert.equal(isDraftData(malformed), false);
  assert.equal(canPublish(malformed, rules).allowed, false);
  draft.blocks.push({ id: "future-slot", type: "future-widget" });
  assert.equal(isDraftData(draft), true);
  assert.equal(canPublish(draft, rules).allowed, true);
  assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(PageRenderer, { config: draft })));
});
