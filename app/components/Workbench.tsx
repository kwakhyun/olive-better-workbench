"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import rules from "@/data/rules.json";
import {
  WELL_META,
  canPublish,
  cleanSignals,
  inspectCopy,
  resolveResearchFallback
} from "@/lib/engine.mjs";
import {
  assembleDraft,
  publishDraft,
  requestBanner,
  requestEventSummary,
  requestResearch
} from "@/lib/client-api";
import {
  clearAppStorage,
  readDraft,
  readResearch,
  removeDraft,
  saveDraft,
  saveResearch
} from "@/lib/client-storage";
import type { Draft, PublishCheck, ResearchPayload, TrendSignal, Well } from "@/lib/types";
import CampaignBrief from "./workbench/CampaignBrief";
import ReviewWorkspace from "./workbench/ReviewWorkspace";
import { STAGE_LABELS, type Panel, type Stage } from "./workbench/types";

const defaultPrompt =
  "장마철에도 가볍게 컨디션을 챙기고 싶은 20~30대 직장인을 위한 출근 전 웰니스 루틴";

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function Workbench({ operatorName }: { operatorName: string }) {
  const [request, setRequest] = useState(defaultPrompt);
  const [well, setWell] = useState<Well>("Fit Well");
  const [stage, setStage] = useState<Stage>("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [activePanel, setActivePanel] = useState<Panel>("evidence");
  const [notice, setNotice] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storedEventCount, setStoredEventCount] = useState(0);

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      const saved = readDraft();
      if (saved?.status === "draft") {
        setDraft(saved);
        setRequest(saved.request);
        setWell(saved.well);
        setStage("review");
      }
    });
    void requestEventSummary()
      .then(({ count }) => {
        if (active) setStoredEventCount(count);
      })
      .catch(() => {
        if (active) setStoredEventCount(0);
      });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (draft?.status === "draft") {
      saveDraft(draft);
    }
  }, [draft]);

  const publishCheck = useMemo(() => canPublish(draft, rules) as PublishCheck, [draft]);

  const metrics = {
    signals: draft?.research?.signals?.length ?? 0,
    safeProducts: draft?.audit?.includedCount ?? 0,
    events: storedEventCount
  };

  async function createCampaign() {
    setGenerationError("");
    setNotice("");
    setDraft(null);
    setStage("researching");

    const bannerTask = requestBanner(request, well)
      .then((payload) => ({ payload, error: "" }))
      .catch((error: unknown) => ({
        payload: null,
        error: messageFrom(error, "안전한 대표 문구를 만들지 못했습니다.")
      }));

    let researchPayload: ResearchPayload;

    try {
      researchPayload = await requestResearch(request, well);
      saveResearch(researchPayload);
    } catch (error) {
      const cached = readResearch();
      const fallback = resolveResearchFallback(
        cached,
        messageFrom(error, "공개 트렌드 자료에 연결하지 못했습니다.")
      ) as ResearchPayload | null;
      if (!fallback) {
        setStage("idle");
        setGenerationError(
          `${messageFrom(error, "공개 트렌드 조사에 실패했습니다.")} 이전에 수집한 자료도 없어 초안을 만들지 않았습니다.`
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
        "요청과 관련된 최신 트렌드 근거가 부족해 초안을 만들지 않았습니다. 대상 고객이나 상황을 더 구체적으로 입력해 주세요."
      );
      return;
    }

    setStage("generating");
    const bannerResult = await bannerTask;
    try {
      const finalDraft = await assembleDraft({
        request,
        well,
        research: researchPayload,
        banner: bannerResult.payload?.banner,
        bannerStatus: bannerResult.payload ? "generated" : "failed",
        bannerEngine: bannerResult.payload?.engine,
        bannerGeneratedAt: bannerResult.payload?.generatedAt,
        bannerError: bannerResult.error
      });
      setDraft(finalDraft);
      setStoredEventCount(finalDraft.audit.eventCount);
      setStage("review");
    } catch (error) {
      setStage("idle");
      setGenerationError(messageFrom(error, "초안 조립에 실패했습니다."));
      return;
    }

    if (bannerResult.error) {
      setNotice(
        `${bannerResult.error} 검토를 위한 기본 문구를 표시하지만, 안전한 대표 문구가 준비되지 않아 발행할 수 없습니다.`
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
            { id: productId, name: "직접 제외한 상품", reason: "MD가 직접 제외" }
          ]
        }
      };
    });
    setNotice("상품을 초안에서 제외했습니다. 변경 내용은 다시 발행한 뒤 고객 화면에 반영됩니다.");
  }

  async function publish() {
    if (!draft) return;
    const check = canPublish(draft, rules) as { allowed: boolean; reasons: string[] };
    if (!check.allowed) {
      setActivePanel("safety");
      setNotice(`발행할 수 없습니다. ${check.reasons[0]}`);
      return;
    }
    try {
      const published = await publishDraft(draft);
      removeDraft();
      setDraft(published);
      setStage("published");
      setNotice("안전 검사를 통과한 내용을 모든 고객 화면에 발행했습니다.");
    } catch (error) {
      setNotice(messageFrom(error, "기획전을 발행하지 못했습니다."));
    }
  }

  function resetDemo() {
    clearAppStorage();
    setDraft(null);
    setRequest(defaultPrompt);
    setWell("Fit Well");
    setStage("idle");
    setNotice("이 브라우저의 초안과 조사 자료를 초기화했습니다. 발행본과 고객 반응은 유지됩니다.");
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
          <a href="#review"><span>◎</span>검토·발행</a>
          <a href="#learning"><span>↗</span>고객 반응 반영</a>
        </nav>
        <div className="sidebar-bottom">
          <a href="/shop" target="_blank" rel="noreferrer"><span>↗</span>고객 화면 열기</a>
          <button type="button" onClick={resetDemo}><span>↺</span>로컬 초안 초기화</button>
          <div className="md-profile">
            <span>MD</span>
            <div><b>{operatorName}</b><small>웰니스 상품팀</small></div>
          </div>
        </div>
      </aside>

      <main className="workbench-main">
        <header className="operator-header">
          <button className="mobile-menu" type="button" onClick={() => setSidebarOpen((current) => !current)}>☰</button>
          <div>
            <span className="live-dot" />
            <b>OLIVE BETTER LIVE</b>
            <span>공개 데이터 조사와 안전 문구 생성</span>
          </div>
          <div className="header-actions">
            <span className={`stage-pill stage-${stage}`}>{STAGE_LABELS[stage]}</span>
            <a href="/shop" target="_blank" rel="noreferrer" className="ghost-link">고객 화면 ↗</a>
          </div>
        </header>

        <div className="operator-content">
          <section className="operator-intro" id="create">
            <div>
              <p className="operator-kicker"><span>01</span> AI MERCHANDISING COPILOT</p>
              <h1>웰니스 기획전,<br /><em>근거부터 발행까지.</em></h1>
              <p className="operator-lead">
                최신 트렌드를 살펴보고, 기준에 맞는 상품만 골라, 고객 반응을 다음 기획에 반영합니다.
              </p>
            </div>
            <div className="operator-metrics">
              <div><span>채택 근거</span><strong>{metrics.signals}</strong><small>PUBLIC SOURCES</small></div>
              <div><span>검증 상품</span><strong>{metrics.safeProducts}</strong><small>VALIDATED SKU</small></div>
              <div><span>고객 반응</span><strong>{metrics.events}</strong><small>SHARED EVENTS</small></div>
            </div>
          </section>

          <CampaignBrief
            request={request}
            well={well}
            stage={stage}
            progressIndex={progressIndex}
            generationError={generationError}
            notice={notice}
            onRequestChange={setRequest}
            onWellChange={setWell}
            onCreate={createCampaign}
          />

          {draft ? (
            <ReviewWorkspace
              draft={draft}
              stage={stage}
              activePanel={activePanel}
              publishCheck={publishCheck}
              onPanelChange={setActivePanel}
              onPublish={publish}
              onEditHero={updateHero}
              onRemoveProduct={removeProduct}
            />
          ) : null}

          <section className="learning-strip" id="learning">
            <div>
              <span>03</span>
              <p>FEEDBACK LOOP</p>
              <h2>클릭 1점, 좋아요 3점, 구매 7점</h2>
            </div>
            <p>고객 화면에서 기록된 반응은 다음 초안의 상품 점수와 화면 영역 순서에 반영됩니다.</p>
            <a href="/shop" target="_blank" rel="noreferrer">고객 화면에서 반응 남기기 ↗</a>
          </section>
        </div>
      </main>
    </div>
  );
}
