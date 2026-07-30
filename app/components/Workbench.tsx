"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import productsJson from "@/data/products.json";
import rules from "@/data/rules.json";
import {
  WELL_META,
  canPublish,
  cleanSignals,
  createDraft,
  inspectCopy,
  resolveResearchFallback
} from "@/lib/engine.mjs";
import type { CustomerEvent, Draft, Product, TrendSignal } from "@/lib/types";
import PageRenderer from "./PageRenderer";

const STORAGE = {
  draft: "olive-better:draft",
  published: "olive-better:published",
  events: "olive-better:events",
  research: "olive-better:research-cache"
};

type Stage = "idle" | "researching" | "curating" | "generating" | "review" | "published";
type Panel = "evidence" | "safety" | "json";

const defaultPrompt =
  "장마철에도 가볍게 컨디션을 챙기고 싶은 20–30대 직장인을 위한 출근 전 웰니스 루틴";

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

function statusLabel(stage: Stage) {
  return {
    idle: "요청 대기",
    researching: "공개 소스 조사 중",
    curating: "신호·상품 정제 중",
    generating: "안전 카피 생성 중",
    review: "검토 가능",
    published: "발행 완료"
  }[stage];
}

export default function Workbench() {
  const [request, setRequest] = useState(defaultPrompt);
  const [well, setWell] = useState("Fit Well");
  const [stage, setStage] = useState<Stage>("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [activePanel, setActivePanel] = useState<Panel>("evidence");
  const [notice, setNotice] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storedEventCount, setStoredEventCount] = useState(0);
  const [hasPublished, setHasPublished] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = readStorage<Draft | null>(STORAGE.draft, null);
      const events = readStorage<CustomerEvent[]>(STORAGE.events, []);
      const published = readStorage<Draft | null>(STORAGE.published, null);
      setStoredEventCount(events.length);
      setHasPublished(Boolean(published));
      if (saved?.status === "draft") {
        setDraft(saved);
        setRequest(saved.request);
        setWell(saved.well);
        setStage("review");
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (draft?.status === "draft") {
      window.localStorage.setItem(STORAGE.draft, JSON.stringify(draft));
    }
  }, [draft]);

  const publishCheck = useMemo(
    () => canPublish(draft, rules),
    [draft]
  ) as {
    allowed: boolean;
    reasons: string[];
    safety?: { safe: boolean; violations: Array<{ reason: string }> };
    config?: { issues: string[] };
  };

  const metrics = useMemo(() => {
    return {
      signals: draft?.research?.signals?.length ?? 0,
      safeProducts: draft?.audit?.includedCount ?? 0,
      events: storedEventCount,
      published: hasPublished
    };
  }, [draft, storedEventCount, hasPublished]);

  async function createCampaign() {
    setGenerationError("");
    setNotice("");
    setDraft(null);
    setStage("researching");

    let researchPayload: {
      status: "live" | "cached";
      topic: string;
      fetchedAt: string;
      sources: Array<{ name: string; url: string; itemCount: number }>;
      signals: TrendSignal[];
      fallbackReason?: string;
    };

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request, well })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          [payload.message || "공개 소스 조사 실패", payload.nextAction]
            .filter(Boolean)
            .join(" ")
        );
      }
      researchPayload = payload;
      window.localStorage.setItem(STORAGE.research, JSON.stringify(payload));
    } catch (error) {
      const cached = readStorage<typeof researchPayload | null>(STORAGE.research, null);
      const fallback = resolveResearchFallback(
        cached,
        error instanceof Error ? error.message : "공개 소스 연결에 실패했습니다."
      ) as typeof researchPayload | null;
      if (!fallback) {
        setStage("idle");
        setGenerationError(
          `${error instanceof Error ? error.message : "공개 소스 조사 실패"} 이전 성공 자료가 없어 초안을 만들지 않았습니다.`
        );
        return;
      }
      researchPayload = fallback;
    }

    setStage("curating");
    const signalContext = `${(WELL_META[well]?.keywords ?? []).join(" ")} ${request}`;
    const cleaned = cleanSignals(researchPayload.signals, signalContext, rules) as {
      accepted: TrendSignal[];
      excluded: Array<TrendSignal & { reason: string }>;
    };
    if (!cleaned.accepted.length) {
      setStage("idle");
      setGenerationError(
        "요청과 관련된 최신 안전 신호가 부족해 초안을 만들지 않았습니다. 대상이나 상황을 더 구체적으로 입력해 주세요."
      );
      return;
    }

    const events = readStorage<CustomerEvent[]>(STORAGE.events, []);
    const baseResearch = {
      status: researchPayload.status,
      topic: researchPayload.topic,
      fetchedAt: researchPayload.fetchedAt,
      sources: researchPayload.sources,
      signals: cleaned.accepted,
      excludedSignals: cleaned.excluded,
      bannerStatus: "failed" as const,
      fallbackReason: researchPayload.fallbackReason
    };
    const provisional = createDraft({
      request,
      selectedWell: well,
      products: productsJson as Product[],
      rules,
      signals: cleaned.accepted,
      events,
      research: baseResearch
    }) as Draft;

    setStage("generating");
    let banner:
      | { eyebrow: string; title: string; subtitle: string; cta: string }
      | undefined;
    let bannerState: Draft["research"]["bannerStatus"] = "failed";
    let bannerEngine = "";
    let bannerGeneratedAt = "";
    let bannerError = "";

    try {
      const response = await fetch("/api/generate-banner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request,
          well,
          theme: provisional.theme,
          signals: cleaned.accepted.map((signal) => signal.title),
          products: Object.values(provisional.products).map((product) => product.name)
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || "안전 카피 생성 실패");
      }
      banner = payload.banner;
      bannerState = "generated";
      bannerEngine = payload.engine;
      bannerGeneratedAt = payload.generatedAt;
    } catch (error) {
      bannerError = error instanceof Error ? error.message : "안전 카피 생성 실패";
    }

    const finalDraft = createDraft({
      request,
      selectedWell: well,
      products: productsJson as Product[],
      rules,
      signals: cleaned.accepted,
      events,
      banner,
      research: {
        ...baseResearch,
        bannerStatus: bannerState,
        bannerEngine,
        bannerGeneratedAt,
        fallbackReason: [baseResearch.fallbackReason, bannerError].filter(Boolean).join(" · ")
      }
    }) as Draft;
    setDraft(finalDraft);
    setStage("review");
    if (bannerError) {
      setNotice(
        `${bannerError} 화면 검토용 기본 문구를 표시하지만, 안전 카피 생성이 완료되지 않아 발행은 차단됩니다.`
      );
    }
  }

  function updateHero(field: "title" | "subtitle" | "cta", value: string) {
    setDraft((current) => {
      if (!current) return current;
      const blocks = current.blocks.map((block) =>
        block.type === "hero" ? { ...block, [field]: value } : block
      );
      const hero = blocks.find((block) => block.type === "hero");
      const heroSafety = inspectCopy(
        [hero?.eyebrow, hero?.title, hero?.subtitle, hero?.cta].filter(Boolean).join(" "),
        rules
      );
      return { ...current, blocks, audit: { ...current.audit, heroSafety } };
    });
  }

  function removeProduct(productId: string) {
    setDraft((current) => {
      if (!current) return current;
      const products = { ...current.products };
      delete products[productId];
      const blocks = current.blocks.map((block) => ({
        ...block,
        productIds: block.productIds?.filter((id) => id !== productId),
        steps: block.steps?.filter((step) => step.productId !== productId)
      }));
      return {
        ...current,
        products,
        blocks,
        audit: {
          ...current.audit,
          includedCount: Object.keys(products).length,
          excluded: [
            ...current.audit.excluded,
            { id: productId, name: "운영자 제외 상품", reason: "MD 수동 제외" }
          ]
        }
      };
    });
    setNotice("상품을 초안에서 제외했습니다. 고객 화면에는 발행 후 반영됩니다.");
  }

  function publish() {
    if (!draft) return;
    const check = canPublish(draft, rules) as { allowed: boolean; reasons: string[] };
    if (!check.allowed) {
      setActivePanel("safety");
      setNotice(`발행할 수 없습니다. ${check.reasons[0]}`);
      return;
    }
    const published = {
      ...draft,
      status: "published" as const,
      publishedAt: new Date().toISOString()
    };
    window.localStorage.setItem(STORAGE.published, JSON.stringify(published));
    window.localStorage.removeItem(STORAGE.draft);
    setDraft(published);
    setHasPublished(true);
    setStage("published");
    setNotice("안전 검사를 다시 통과해 고객 화면에 발행했습니다.");
  }

  function resetDemo() {
    Object.values(STORAGE).forEach((key) => window.localStorage.removeItem(key));
    setDraft(null);
    setRequest(defaultPrompt);
    setWell("Fit Well");
    setStage("idle");
    setStoredEventCount(0);
    setHasPublished(false);
    setNotice("초안·발행본·고객 반응·조사 캐시를 초기화했습니다.");
  }

  const progressIndex =
    stage === "idle" ? 0 : stage === "researching" ? 1 : stage === "curating" ? 2 : stage === "generating" ? 3 : 4;

  return (
    <div className="workbench">
      <aside className={`workbench-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <Link className="workbench-brand" href="/" aria-label="Better Workbench 홈">
          <span className="brand-mark">b.</span>
          <span>
            <b>better</b>
            <small>WORKBENCH</small>
          </span>
        </Link>
        <nav aria-label="운영자 메뉴">
          <a className="is-active" href="#create"><span>✦</span>기획전 만들기</a>
          <a href="#review"><span>◎</span>검토 & 발행</a>
          <a href="#learning"><span>↗</span>반응 학습</a>
        </nav>
        <div className="sidebar-bottom">
          <a href="/shop" target="_blank"><span>↗</span>고객 화면 열기</a>
          <button type="button" onClick={resetDemo}><span>↺</span>데모 초기화</button>
          <div className="md-profile">
            <span>MD</span>
            <div><b>웰니스 상품팀</b><small>olivebetter@demo</small></div>
          </div>
        </div>
      </aside>

      <main className="workbench-main">
        <header className="operator-header">
          <button className="mobile-menu" type="button" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div>
            <span className="live-dot" />
            <b>OLIVE BETTER LIVE</b>
            <span>공개 소스 + 안전 카피 엔진</span>
          </div>
          <div className="header-actions">
            <span className={`stage-pill stage-${stage}`}>{statusLabel(stage)}</span>
            <a href="/shop" target="_blank" className="ghost-link">고객 화면 ↗</a>
          </div>
        </header>

        <div className="operator-content">
          <section className="operator-intro" id="create">
            <div>
              <p className="operator-kicker"><span>01</span> AI MERCHANDISING COPILOT</p>
              <h1>웰니스 기획전,<br /><em>근거부터 발행까지.</em></h1>
              <p className="operator-lead">
                최신 신호를 읽고, 안전한 상품만 골라, 고객 반응으로 더 나은 화면을 만듭니다.
              </p>
            </div>
            <div className="operator-metrics">
              <div><span>채택 신호</span><strong>{metrics.signals}</strong><small>LIVE SOURCES</small></div>
              <div><span>안전 상품</span><strong>{metrics.safeProducts}</strong><small>VALIDATED SKU</small></div>
              <div><span>고객 반응</span><strong>{metrics.events}</strong><small>THIS SESSION</small></div>
            </div>
          </section>

          <section className="brief-card">
            <div className="brief-heading">
              <div><span className="step-chip">STEP 1</span><h2>어떤 기획전을 만들까요?</h2></div>
              <span className="autosave">● 로컬 자동 저장</span>
            </div>
            <label htmlFor="md-request">MD 기획 요청</label>
            <textarea
              id="md-request"
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder="대상 고객, 시즌, 상황과 기획 의도를 적어 주세요."
            />
            <div className="request-footer">
              <span>{request.length} / 500</span>
              <div className="sample-prompts">
                <button type="button" onClick={() => setRequest("저녁 스마트폰 사용 후 편안한 휴식을 원하는 30대 고객의 나이트 루틴")}>저녁 휴식</button>
                <button type="button" onClick={() => setRequest("운동을 막 시작한 초보 러너의 출근 전 단백질과 회복 루틴")}>초보 러너</button>
              </div>
            </div>
            <div className="well-picker">
              <p>우선 탐색할 6대 Well</p>
              <div>
                {Object.entries(WELL_META).map(([key, meta]) => (
                  <button
                    type="button"
                    key={key}
                    className={well === key ? "is-selected" : ""}
                    onClick={() => setWell(key)}
                    style={{ "--well-color": meta.accent } as React.CSSProperties}
                  >
                    <span>{key.split(" ")[0][0]}</span>
                    <b>{key}</b>
                    <small>{meta.short}</small>
                  </button>
                ))}
              </div>
            </div>
            <button
              className="generate-button"
              type="button"
              onClick={createCampaign}
              disabled={progressIndex > 0 && progressIndex < 4}
            >
              <span>✦</span>
              {progressIndex > 0 && progressIndex < 4 ? statusLabel(stage) : "트렌드 조사 & 초안 만들기"}
              <small>공개 데이터 조사 → 정제 → 상품 검증 → 안전 카피 생성</small>
            </button>
            {(progressIndex > 0 && progressIndex < 4) && (
              <div className="generation-progress" role="status">
                {["공개 신호 수집", "노이즈 정제", "상품 안전 검증", "대표 문구 생성"].map((label, index) => (
                  <div key={label} className={index < progressIndex ? "is-done" : index === progressIndex ? "is-active" : ""}>
                    <span>{index < progressIndex ? "✓" : index + 1}</span>
                    <b>{label}</b>
                  </div>
                ))}
              </div>
            )}
            {generationError && <div className="inline-alert is-error"><span>!</span><p>{generationError}</p></div>}
            {notice && <div className="inline-alert"><span>i</span><p>{notice}</p></div>}
          </section>

          {draft && (
            <section className="review-workspace" id="review">
              <div className="review-heading">
                <div>
                  <p className="operator-kicker"><span>02</span> REVIEW & PUBLISH</p>
                  <h2>초안을 검토하고 안전하게 발행하세요.</h2>
                  <p>고객에게 보이는 문구와 상품을 직접 수정할 수 있습니다.</p>
                </div>
                <div className="review-actions">
                  <span className={publishCheck.allowed ? "safety-badge is-safe" : "safety-badge"}>
                    {publishCheck.allowed ? "✓ 발행 전 검사 통과" : `! 확인 ${publishCheck.reasons.length}건`}
                  </span>
                  <button type="button" className="publish-button" disabled={!publishCheck.allowed || stage === "published"} onClick={publish}>
                    {stage === "published" ? "발행 완료" : "고객 화면에 발행"}
                  </button>
                </div>
              </div>

              <div className="review-grid">
                <div className="preview-shell">
                  <div className="preview-toolbar">
                    <div><span className="browser-dot" /><span className="browser-dot" /><span className="browser-dot" /></div>
                    <span>미리보기 · 고객 화면 1440px</span>
                    <b>{draft.status === "published" ? "PUBLISHED" : "DRAFT · 비공개"}</b>
                  </div>
                  <PageRenderer
                    config={draft}
                    mode="preview"
                    onEditHero={updateHero}
                    onRemoveProduct={removeProduct}
                  />
                </div>

                <aside className="audit-panel">
                  <div className="audit-tabs">
                    <button type="button" className={activePanel === "evidence" ? "is-active" : ""} onClick={() => setActivePanel("evidence")}>근거</button>
                    <button type="button" className={activePanel === "safety" ? "is-active" : ""} onClick={() => setActivePanel("safety")}>제외·안전</button>
                    <button type="button" className={activePanel === "json" ? "is-active" : ""} onClick={() => setActivePanel("json")}>화면 JSON</button>
                  </div>

                  {activePanel === "evidence" && (
                    <div className="audit-content">
                      <div className={`source-status status-${draft.research.status}`}>
                        <span>{draft.research.status === "live" ? "●" : "↺"}</span>
                        <div>
                          <b>{draft.research.status === "live" ? "실시간 공개 소스" : "이전 성공 자료로 전환"}</b>
                          <small>{new Date(draft.research.fetchedAt).toLocaleString("ko-KR")}</small>
                        </div>
                      </div>
                      <div className="audit-summary">
                        <span>조사 주제</span><strong>{draft.research.topic}</strong>
                      </div>
                      <h3>채택한 신호 <span>{draft.research.signals.length}</span></h3>
                      <div className="signal-list">
                        {draft.research.signals.map((signal) => (
                          <a href={signal.url} target="_blank" rel="noreferrer" key={signal.id}>
                            <div><span>{signal.source}</span><small>관련도 {Math.round(signal.relevance * 100)}%</small></div>
                            <b>{signal.title}</b>
                            <em>원문 보기 ↗</em>
                          </a>
                        ))}
                      </div>
                      <h3>반응 재적용</h3>
                      <p className="feedback-note">{draft.audit.feedback}</p>
                    </div>
                  )}

                  {activePanel === "safety" && (
                    <div className="audit-content">
                      <div className={draft.research.bannerStatus === "generated" ? "source-status status-live" : "source-status status-failed"}>
                        <span>{draft.research.bannerStatus === "generated" ? "✓" : "!"}</span>
                        <div>
                          <b>{draft.research.bannerStatus === "generated" ? "안전 카피 엔진 생성" : "카피 생성 확인 필요"}</b>
                          <small>{draft.research.bannerEngine || draft.research.fallbackReason}</small>
                        </div>
                      </div>
                      <h3>발행 검사</h3>
                      {publishCheck.reasons.length ? (
                        <ul className="issue-list">{publishCheck.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                      ) : (
                        <div className="safe-box"><span>✓</span><div><b>문구·상품·화면 검사 통과</b><p>운영자 수정 문구까지 다시 확인했습니다.</p></div></div>
                      )}
                      <h3>제외한 상품 <span>{draft.audit.excluded.length}</span></h3>
                      <div className="exclusion-list">
                        {draft.audit.excluded.slice(0, 24).map((item) => (
                          <div key={`${item.id}-${item.reason}`}><span>{item.reason}</span><b>{item.name}</b><small>{item.id}</small></div>
                        ))}
                      </div>
                      <h3>제외한 신호 <span>{draft.research.excludedSignals.length}</span></h3>
                      <div className="exclusion-list">
                        {draft.research.excludedSignals.slice(0, 12).map((item) => (
                          <div key={item.id}><span>{item.reason}</span><b>{item.title}</b></div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activePanel === "json" && (
                    <div className="audit-content">
                      <div className="json-note"><span>{draft.blocks.length}</span>개 화면 영역이 데이터 순서대로 조립됩니다.</div>
                      <pre>{JSON.stringify({ schemaVersion: draft.schemaVersion, palette: draft.palette, blocks: draft.blocks }, null, 2)}</pre>
                    </div>
                  )}
                </aside>
              </div>
            </section>
          )}

          <section className="learning-strip" id="learning">
            <div>
              <span>03</span>
              <p>FEEDBACK LOOP</p>
              <h2>클릭 1 · 좋아요 3 · 구매 7</h2>
            </div>
            <p>고객 화면에서 새로 쌓인 반응은 다음 초안의 상품 점수와 화면 영역 순서에 반영됩니다.</p>
            <a href="/shop" target="_blank">고객 반응 만들기 ↗</a>
          </section>
        </div>
      </main>
    </div>
  );
}
