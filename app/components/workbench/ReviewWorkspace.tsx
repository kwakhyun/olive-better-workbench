import PageRenderer from "../PageRenderer";
import type { Draft, PublishCheck } from "@/lib/types";
import type { Panel, Stage } from "./types";

type ReviewWorkspaceProps = {
  draft: Draft;
  stage: Stage;
  activePanel: Panel;
  publishCheck: PublishCheck;
  onPanelChange: (panel: Panel) => void;
  onPublish: () => void;
  onEditHero: (field: "title" | "subtitle" | "cta", value: string) => void;
  onRemoveProduct: (productId: string) => void;
};

function AuditPanel({
  draft,
  activePanel,
  publishCheck,
  onPanelChange
}: Pick<ReviewWorkspaceProps, "draft" | "activePanel" | "publishCheck" | "onPanelChange">) {
  return (
    <aside className="audit-panel">
      <div className="audit-tabs" role="tablist" aria-label="초안 검토 정보">
        <button
          type="button"
          role="tab"
          aria-selected={activePanel === "evidence"}
          className={activePanel === "evidence" ? "is-active" : ""}
          onClick={() => onPanelChange("evidence")}
        >근거</button>
        <button
          type="button"
          role="tab"
          aria-selected={activePanel === "safety"}
          className={activePanel === "safety" ? "is-active" : ""}
          onClick={() => onPanelChange("safety")}
        >제외 내역·안전</button>
        <button
          type="button"
          role="tab"
          aria-selected={activePanel === "json"}
          className={activePanel === "json" ? "is-active" : ""}
          onClick={() => onPanelChange("json")}
        >화면 JSON</button>
      </div>

      {activePanel === "evidence" ? (
        <div className="audit-content" role="tabpanel">
          <div className={`source-status status-${draft.research.status}`}>
            <span>{draft.research.status === "live" ? "●" : "↺"}</span>
            <div>
              <b>{draft.research.status === "live" ? "방금 수집한 공개 자료" : "이전에 수집한 자료 사용 중"}</b>
              <small>{new Date(draft.research.fetchedAt).toLocaleString("ko-KR")}</small>
            </div>
          </div>
          <div className="audit-summary">
            <span>조사 주제</span><strong>{draft.research.topic}</strong>
          </div>
          <h3>채택한 트렌드 근거 <span>{draft.research.signals.length}</span></h3>
          <div className="signal-list">
            {draft.research.signals.map((signal) => (
              <a href={signal.url} target="_blank" rel="noreferrer" key={signal.id}>
                <div><span>{signal.source}</span><small>관련도 {Math.round(signal.relevance * 100)}%</small></div>
                <b>{signal.title}</b>
                <em>원문 보기 ↗</em>
              </a>
            ))}
          </div>
          <h3>고객 반응 반영 결과</h3>
          <p className="feedback-note">{draft.audit.feedback}</p>
        </div>
      ) : null}

      {activePanel === "safety" ? (
        <div className="audit-content" role="tabpanel">
          <div className={draft.research.bannerStatus === "generated" ? "source-status status-live" : "source-status status-failed"}>
            <span>{draft.research.bannerStatus === "generated" ? "✓" : "!"}</span>
            <div>
              <b>{draft.research.bannerStatus === "generated" ? "안전한 대표 문구 생성 완료" : "대표 문구 생성 상태 확인 필요"}</b>
              <small>{draft.research.bannerEngine || draft.research.fallbackReason}</small>
            </div>
          </div>
          <h3>발행 전 검사</h3>
          {publishCheck.reasons.length ? (
            <ul className="issue-list">{publishCheck.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          ) : (
            <div className="safe-box"><span>✓</span><div><b>문구, 상품, 화면 검사 통과</b><p>MD가 수정한 문구까지 다시 검사했습니다.</p></div></div>
          )}
          <h3>제외한 상품 <span>{draft.audit.excluded.length}</span></h3>
          <div className="exclusion-list">
            {draft.audit.excluded.slice(0, 24).map((item) => (
              <div key={`${item.id}-${item.reason}`}><span>{item.reason}</span><b>{item.name}</b><small>{item.id}</small></div>
            ))}
          </div>
          <h3>제외한 트렌드 자료 <span>{draft.research.excludedSignals.length}</span></h3>
          <div className="exclusion-list">
            {draft.research.excludedSignals.slice(0, 12).map((item) => (
              <div key={item.id}><span>{item.reason}</span><b>{item.title}</b></div>
            ))}
          </div>
        </div>
      ) : null}

      {activePanel === "json" ? (
        <div className="audit-content" role="tabpanel">
          <div className="json-note"><span>{draft.blocks.length}</span>개 화면 영역을 아래 데이터 순서대로 표시합니다.</div>
          <pre>{JSON.stringify({ schemaVersion: draft.schemaVersion, palette: draft.palette, blocks: draft.blocks }, null, 2)}</pre>
        </div>
      ) : null}
    </aside>
  );
}

export default function ReviewWorkspace({
  draft,
  stage,
  activePanel,
  publishCheck,
  onPanelChange,
  onPublish,
  onEditHero,
  onRemoveProduct
}: ReviewWorkspaceProps) {
  return (
    <section className="review-workspace" id="review">
      <div className="review-heading">
        <div>
          <p className="operator-kicker"><span>02</span> REVIEW & PUBLISH</p>
          <h2>초안을 검토한 뒤 안전하게 발행하세요.</h2>
          <p>고객에게 보이는 문구와 상품을 직접 수정할 수 있습니다.</p>
        </div>
        <div className="review-actions">
          <span className={publishCheck.allowed ? "safety-badge is-safe" : "safety-badge"}>
            {publishCheck.allowed ? "✓ 발행 전 검사 통과" : `! 확인할 항목 ${publishCheck.reasons.length}건`}
          </span>
          <button
            type="button"
            className="publish-button"
            disabled={!publishCheck.allowed || stage === "published"}
            onClick={onPublish}
          >
            {stage === "published" ? "발행 완료" : "고객 화면에 발행"}
          </button>
        </div>
      </div>

      <div className="review-grid">
        <div className="preview-shell">
          <div className="preview-toolbar">
            <div><span className="browser-dot" /><span className="browser-dot" /><span className="browser-dot" /></div>
            <span>고객 화면 미리보기 · 1440px</span>
            <b>{draft.status === "published" ? "발행됨" : "초안 · 비공개"}</b>
          </div>
          <PageRenderer
            config={draft}
            mode="preview"
            onEditHero={onEditHero}
            onRemoveProduct={onRemoveProduct}
          />
        </div>
        <AuditPanel
          draft={draft}
          activePanel={activePanel}
          publishCheck={publishCheck}
          onPanelChange={onPanelChange}
        />
      </div>
    </section>
  );
}
