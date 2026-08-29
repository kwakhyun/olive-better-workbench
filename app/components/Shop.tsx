"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  appendEvent,
  readEvents,
  readPublished,
  subscribeToAppStorage
} from "@/lib/client-storage";
import type { CustomerEvent, Draft } from "@/lib/types";
import PageRenderer from "./PageRenderer";

const EVENT_LABELS = {
  click: "상품을 살펴봤어요.",
  like: "관심 상품으로 저장했어요.",
  purchase: "데모 구매를 기록했어요."
};

export default function Shop() {
  const [published, setPublished] = useState<Draft | null>(null);
  const [toast, setToast] = useState("");
  const [eventCount, setEventCount] = useState(0);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    const syncFromStorage = () => {
      const campaign = readPublished();
      setPublished(campaign?.status === "published" ? campaign : null);
      setEventCount(readEvents().length);
    };
    const frame = window.requestAnimationFrame(syncFromStorage);
    const unsubscribe = subscribeToAppStorage(syncFromStorage);
    return () => {
      window.cancelAnimationFrame(frame);
      unsubscribe();
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  function recordEvent(event: Omit<CustomerEvent, "id" | "at">) {
    const nextEvent: CustomerEvent = {
      ...event,
      id: crypto.randomUUID(),
      at: new Date().toISOString()
    };
    const { events, saved } = appendEvent(nextEvent);
    setEventCount(events.length);
    setToast(
      saved
        ? `${EVENT_LABELS[nextEvent.type]} 다음 추천에 반영됩니다.`
        : "이 브라우저에 반응을 저장하지 못했습니다. 브라우저 설정을 확인해 주세요."
    );
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2400);
  }

  return (
    <div className="shop">
      <header className="shop-header">
        <Link className="shop-logo" href="/shop"><b>OLIVE</b><span>BETTER</span></Link>
        <nav aria-label="고객 메뉴">
          <a href="#well">6 WELLS</a>
          <a href="#new">NEW & BEST</a>
          <a href="#story">BETTER STORY</a>
        </nav>
        <div className="shop-actions">
          <button type="button" aria-label="검색">⌕</button>
          <button type="button" aria-label="좋아요">♡</button>
          <button type="button" aria-label="장바구니">BAG <span>{eventCount}</span></button>
        </div>
      </header>
      <div className="shop-notice">
        <span>OLIVE BETTER EXCLUSIVE</span>
        <p>오늘의 나에게 맞춘 웰니스 루틴</p>
          <Link href="/">MD 운영 화면 ↗</Link>
      </div>

      {published ? (
        <>
          <PageRenderer config={published} mode="customer" onEvent={recordEvent} />
          <footer className="shop-footer">
            <div className="shop-logo"><b>OLIVE</b><span>BETTER</span></div>
            <p>건강한 아름다움을 일상으로. © 2026 OLIVE BETTER MVP</p>
            <div><Link href="/">MD 운영 화면</Link><a href="#policy">표시 기준</a><a href="#help">도움말</a></div>
          </footer>
        </>
      ) : (
        <main className="unpublished-state">
          <div className="empty-orbit"><span>b.</span></div>
          <p>NOT PUBLISHED YET</p>
          <h1>새로운 웰니스 기획전을<br />준비하고 있어요.</h1>
          <span>안전 검토를 마친 기획전만 이곳에 공개됩니다.</span>
          <Link href="/">MD 운영 화면으로 돌아가기 →</Link>
        </main>
      )}
      {toast ? <div className="shop-toast" role="status"><span>✓</span>{toast}</div> : null}
    </div>
  );
}
