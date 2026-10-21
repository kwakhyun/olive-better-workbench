import { inspectCopy } from "./engine.mjs";
import { KNOWN_BLOCKS } from "./page-schema.mjs";

function revision(draft, changes) {
  return { ...draft, ...changes, status: "draft", publishedAt: undefined, publicationId: undefined };
}

export function editDraftHero(draft, field, value, rules) {
  const blocks = draft.blocks.map((block) => block.type === "hero" ? { ...block, [field]: value } : block);
  const hero = blocks.find((block) => block.type === "hero");
  const heroSafety = inspectCopy([hero.eyebrow, hero.title, hero.subtitle, hero.cta].join(" "), rules);
  return revision(draft, { blocks, audit: { ...draft.audit, heroSafety } });
}

export function removeDraftProduct(draft, productId) {
  const products = { ...draft.products };
  delete products[productId];
  const blocks = draft.blocks.map((block) => !KNOWN_BLOCKS.has(block.type) ? block : ({
    ...block,
    productIds: block.productIds?.filter((id) => id !== productId),
    steps: block.steps?.filter((step) => step.productId !== productId)
  }));
  return revision(draft, {
    products, blocks,
    audit: {
      ...draft.audit,
      includedCount: Object.keys(products).length,
      excluded: [...draft.audit.excluded, {
        id: productId, name: draft.products[productId]?.name ?? "직접 제외한 상품", reason: "MD가 직접 제외"
      }]
    }
  });
}
