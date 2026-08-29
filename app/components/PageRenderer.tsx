"use client";

import { useState, type CSSProperties } from "react";
import type { CustomerEvent, Draft, PageBlock, Product } from "@/lib/types";

type RendererProps = {
  config: Draft;
  mode?: "preview" | "customer";
  onEvent?: (event: Omit<CustomerEvent, "id" | "at">) => void;
  onEditHero?: (field: "title" | "subtitle" | "cta", value: string) => void;
  onRemoveProduct?: (productId: string) => void;
};

const money = new Intl.NumberFormat("ko-KR");
const KNOWN_BLOCKS = new Set([
  "hero",
  "signal_strip",
  "product_rail",
  "routine_steps",
  "product_grid",
  "evidence_note"
]);

function ProductPackshot({ product, hero = false }: { product: Product; hero?: boolean }) {
  return (
    <div
      className={`product-packshot ${hero ? "is-hero" : ""}`}
      style={{ "--pack-color": product.color } as CSSProperties}
      aria-hidden="true"
    >
      <span className="pack-shadow" />
      <span className={`pack-body form-${product.form}`}>
        <span className="pack-brand">OB</span>
        <span className="pack-line" />
        <span className="pack-name">{product.name.split(" ").slice(1, 3).join(" ")}</span>
        <span className="pack-count">{product.form}</span>
      </span>
    </div>
  );
}

function ProductCard({
  product,
  block,
  mode,
  liked,
  onLike,
  onEvent,
  onRemove
}: {
  product: Product;
  block: PageBlock;
  mode: "preview" | "customer";
  liked: boolean;
  onLike: () => void;
  onEvent?: RendererProps["onEvent"];
  onRemove?: () => void;
}) {
  const track = (type: "click" | "like" | "purchase") =>
    onEvent?.({ type, productId: product.id, blockId: block.id, well: product.well });

  return (
    <article className="product-card" data-product-id={product.id}>
      <button
        className="product-visual-button"
        type="button"
        onClick={() => {
          if (mode === "customer") track("click");
        }}
        aria-label={`${product.name} 자세히 보기`}
      >
        <div className="product-visual" style={{ background: product.color }}>
          {product.flags.coupon ? <span className="coupon-chip">쿠폰</span> : null}
          <ProductPackshot product={product} />
        </div>
      </button>
      <div className="product-copy">
        <div className="product-meta-row">
          <span>{product.brand}</span>
          <span className="rating">★ {product.rating}</span>
        </div>
        <h3>{product.name}</h3>
        {product.recommendationReason ? (
          <p className="recommendation-reason">{product.recommendationReason}</p>
        ) : null}
        <div className="price-row">
          <strong>{money.format(product.price)}원</strong>
          {mode === "customer" ? (
            <div className="card-actions">
              <button
                type="button"
                className={liked ? "heart is-liked" : "heart"}
                onClick={() => {
                  onLike();
                  if (!liked) track("like");
                }}
                aria-label={liked ? "좋아요 취소" : "좋아요"}
              >
                {liked ? "♥" : "♡"}
              </button>
              <button type="button" className="mini-buy" onClick={() => track("purchase")}>
                구매해 보기
              </button>
            </div>
          ) : (
            <button type="button" className="remove-product" onClick={onRemove}>
              제외
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function Hero({
  block,
  config,
  mode,
  onEditHero
}: {
  block: PageBlock;
  config: Draft;
  mode: "preview" | "customer";
  onEditHero?: RendererProps["onEditHero"];
}) {
  const heroProducts = (block.productIds ?? [])
    .map((id) => config.products[id])
    .filter(Boolean);
  const editable = mode === "preview" ? onEditHero : undefined;
  return (
    <section
      className={`campaign-hero hero-${block.variant ?? "editorial"}`}
      style={
        {
          "--hero-soft": block.presentation?.tone ?? config.palette.soft,
          "--hero-accent": block.presentation?.accent ?? config.palette.accent
        } as CSSProperties
      }
      data-block-id={block.id}
    >
      <div className="hero-orbit orbit-one" />
      <div className="hero-orbit orbit-two" />
      <div className="hero-content">
        <p className="hero-eyebrow">{block.eyebrow}</p>
        {editable ? (
          <input
            className="hero-title-input"
            value={block.title ?? ""}
            onChange={(event) => onEditHero?.("title", event.target.value)}
            aria-label="대표 배너 제목"
          />
        ) : (
          <h1>{block.title}</h1>
        )}
        {editable ? (
          <textarea
            className="hero-subtitle-input"
            value={block.subtitle ?? ""}
            onChange={(event) => onEditHero?.("subtitle", event.target.value)}
            aria-label="대표 배너 설명"
          />
        ) : (
          <p className="hero-subtitle">{block.subtitle}</p>
        )}
        {editable ? (
          <input
            className="hero-cta-input"
            value={block.cta ?? ""}
            onChange={(event) => onEditHero?.("cta", event.target.value)}
            aria-label="대표 배너 버튼 문구"
          />
        ) : (
          <button type="button" className="hero-cta">
            {block.cta} <span>→</span>
          </button>
        )}
      </div>
      <div className="hero-products" aria-hidden="true">
        {heroProducts.map((product, index) => (
          <div className={`hero-product hero-product-${index + 1}`} key={product.id}>
            <ProductPackshot product={product} hero />
          </div>
        ))}
      </div>
      <div className="hero-index">01</div>
    </section>
  );
}

function SignalStrip({ block }: { block: PageBlock }) {
  return (
    <section className="signal-strip" data-block-id={block.id}>
      <p>{block.title}</p>
      <div className="signal-ticker">
        {(block.items ?? []).map((item, index) => (
          <span key={`${item}-${index}`}>
            <b>0{index + 1}</b>
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

type ProductCollectionProps = {
  block: PageBlock;
  ids: string[];
  kind: "rail" | "grid";
  products: Draft["products"];
  mode: "preview" | "customer";
  liked: Set<string>;
  onToggleLike: (productId: string) => void;
  onEvent?: RendererProps["onEvent"];
  onRemoveProduct?: RendererProps["onRemoveProduct"];
};

function ProductCollection({
  block,
  ids,
  kind,
  products,
  mode,
  liked,
  onToggleLike,
  onEvent,
  onRemoveProduct
}: ProductCollectionProps) {
  return (
    <div className={kind === "rail" ? "product-rail" : "product-grid"}>
      {ids.flatMap((id) => {
        const product = products[id];
        if (!product) return [];
        return [
          <ProductCard
            key={product.id}
            product={product}
            block={block}
            mode={mode}
            liked={liked.has(product.id)}
            onLike={() => onToggleLike(product.id)}
            onEvent={onEvent}
            onRemove={() => onRemoveProduct?.(product.id)}
          />
        ];
      })}
    </div>
  );
}

export default function PageRenderer({
  config,
  mode = "customer",
  onEvent,
  onEditHero,
  onRemoveProduct
}: RendererProps) {
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const products = config.products ?? {};

  function toggleLike(productId: string) {
    setLiked((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  return (
    <div
      className={`page-renderer mode-${mode}`}
      style={
        {
          "--campaign-accent": config.palette.accent,
          "--campaign-soft": config.palette.soft
        } as CSSProperties
      }
    >
      {config.blocks.map((block) => {
        if (!KNOWN_BLOCKS.has(block.type)) {
          return mode === "preview" ? (
            <div className="unknown-block" key={block.id}>
              <span>!</span>
              <div>
                <strong>지원하지 않는 화면 영역을 건너뛰었습니다.</strong>
                <p>{block.type}: 나머지 화면은 계속 표시됩니다.</p>
              </div>
            </div>
          ) : null;
        }
        if (block.type === "hero") {
          return (
            <Hero
              block={block}
              config={config}
              mode={mode}
              onEditHero={onEditHero}
              key={block.id}
            />
          );
        }
        if (block.type === "signal_strip") return <SignalStrip block={block} key={block.id} />;
        if (block.type === "product_rail") {
          return (
            <section className="campaign-section" key={block.id} data-block-id={block.id}>
              <div className="section-heading">
                <div>
                  <p className="section-number">02 · CURATED</p>
                  <h2>{block.title}</h2>
                  <p>{block.subtitle}</p>
                </div>
                <span className="section-arrow">↗</span>
              </div>
              <ProductCollection
                block={block}
                ids={block.productIds ?? []}
                kind="rail"
                products={products}
                mode={mode}
                liked={liked}
                onToggleLike={toggleLike}
                onEvent={onEvent}
                onRemoveProduct={onRemoveProduct}
              />
            </section>
          );
        }
        if (block.type === "routine_steps") {
          return (
            <section className="routine-section" key={block.id} data-block-id={block.id}>
              <div className="routine-intro">
                <p className="section-number">03 · ROUTINE</p>
                <h2>{block.title}</h2>
                <p>완벽함보다 꾸준히 이어 갈 수 있는 작은 선택을 제안해요.</p>
              </div>
              <div className="routine-list">
                {(block.steps ?? []).map((step, index) => {
                  const product = step.productId ? products[step.productId] : undefined;
                  return (
                    <article key={`${step.time}-${index}`}>
                      <span className="routine-index">0{index + 1}</span>
                      <div>
                        <p>{step.time}</p>
                        <h3>{step.label}</h3>
                        <span>{product?.name ?? "내게 맞는 루틴 찾기"}</span>
                      </div>
                      {product ? <ProductPackshot product={product} /> : null}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        }
        if (block.type === "product_grid") {
          return (
            <section className="campaign-section muted-section" key={block.id} data-block-id={block.id}>
              <div className="section-heading">
                <div>
                  <p className="section-number">04 · EXPLORE</p>
                  <h2>{block.title}</h2>
                </div>
              </div>
              <ProductCollection
                block={block}
                ids={block.productIds ?? []}
                kind="grid"
                products={products}
                mode={mode}
                liked={liked}
                onToggleLike={toggleLike}
                onEvent={onEvent}
                onRemoveProduct={onRemoveProduct}
              />
            </section>
          );
        }
        return (
          <section className="evidence-note" key={block.id} data-block-id={block.id}>
            <p>{block.eyebrow}</p>
            <h2>{block.title}</h2>
            <span>{block.body}</span>
            <div className="evidence-stamp">BETTER<br />STANDARD</div>
          </section>
        );
      })}
    </div>
  );
}
