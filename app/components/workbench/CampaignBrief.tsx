import type { CSSProperties } from "react";
import { WELL_META } from "@/lib/engine.mjs";
import type { Well } from "@/lib/types";
import { STAGE_LABELS, type Stage } from "./types";

const SAMPLE_PROMPTS = {
  evening: "스마트폰을 사용한 뒤 편안하게 쉬고 싶은 30대 고객을 위한 저녁 루틴",
  runner: "운동을 막 시작한 초보 러너를 위한 출근 전 단백질 보충과 회복 루틴"
};

const PROGRESS_LABELS = [
  "공개 트렌드 수집",
  "관련 없는 정보 제외",
  "상품 안전 기준 확인",
  "안전한 대표 문구 생성"
];

type WellMeta = {
  accent: string;
  short: string;
};

type CampaignBriefProps = {
  request: string;
  well: Well;
  stage: Stage;
  progressIndex: number;
  generationError: string;
  notice: string;
  onRequestChange: (request: string) => void;
  onWellChange: (well: Well) => void;
  onCreate: () => void;
};

export default function CampaignBrief({
  request,
  well,
  stage,
  progressIndex,
  generationError,
  notice,
  onRequestChange,
  onWellChange,
  onCreate
}: CampaignBriefProps) {
  const generating = progressIndex > 0 && progressIndex < 4;

  return (
    <section className="brief-card">
      <div className="brief-heading">
        <div><span className="step-chip">STEP 1</span><h2>어떤 기획전을 만들까요?</h2></div>
        <span className="autosave">● 이 브라우저에 자동 저장</span>
      </div>
      <label htmlFor="md-request">MD 기획 요청</label>
      <textarea
        id="md-request"
        value={request}
        maxLength={500}
        onChange={(event) => onRequestChange(event.target.value)}
        placeholder="대상 고객, 시즌, 상황과 기획 의도를 적어 주세요."
      />
      <div className="request-footer">
        <span>{request.length} / 500</span>
        <div className="sample-prompts">
          <button type="button" onClick={() => onRequestChange(SAMPLE_PROMPTS.evening)}>저녁 휴식</button>
          <button type="button" onClick={() => onRequestChange(SAMPLE_PROMPTS.runner)}>초보 러너</button>
        </div>
      </div>
      <div className="well-picker">
        <p>먼저 살펴볼 웰니스 영역</p>
        <div>
          {(Object.entries(WELL_META) as Array<[Well, WellMeta]>).map(([key, meta]) => (
            <button
              type="button"
              key={key}
              className={well === key ? "is-selected" : ""}
              onClick={() => onWellChange(key)}
              style={{ "--well-color": meta.accent } as CSSProperties}
            >
              <span>{key[0]}</span>
              <b>{key}</b>
              <small>{meta.short}</small>
            </button>
          ))}
        </div>
      </div>
      <button
        className="generate-button"
        type="button"
        onClick={onCreate}
        disabled={generating || stage === "publishing"}
      >
        <span>✦</span>
        {generating ? STAGE_LABELS[stage] : "트렌드 조사하고 초안 만들기"}
        <small>공개 자료 조사 → 관련 없는 정보 제외 → 상품 검증 → 안전한 문구 생성</small>
      </button>
      {generating ? (
        <div className="generation-progress" role="status" aria-live="polite">
          {PROGRESS_LABELS.map((label, index) => (
            <div
              key={label}
              className={index < progressIndex ? "is-done" : index === progressIndex ? "is-active" : ""}
            >
              <span>{index < progressIndex ? "✓" : index + 1}</span>
              <b>{label}</b>
            </div>
          ))}
        </div>
      ) : null}
      {generationError ? (
        <div className="inline-alert is-error" role="alert"><span>!</span><p>{generationError}</p></div>
      ) : null}
      {notice ? (
        <div className="inline-alert" role="status"><span>i</span><p>{notice}</p></div>
      ) : null}
    </section>
  );
}
