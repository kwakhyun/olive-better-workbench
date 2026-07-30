"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CustomerEvent, Draft } from "@/lib/types";
import PageRenderer from "./PageRenderer";

const PUBLISHED_KEY = "olive-better:published";
const EVENTS_KEY = "olive-better:events";

export default function Shop() {
  const [published, setPublished] = useState<Draft | null>(null);
  const [toast, setToast] = useState("");
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const campaign = JSON.parse(window.localStorage.getItem(PUBLISHED_KEY) ?? "null") as Draft | null;
        setPublished(campaign?.status === "published" ? campaign : null);
        const events = JSON.parse(window.localStorage.getItem(EVENTS_KEY) ?? "[]") as CustomerEvent[];
        setEventCount(events.length);
      } catch {
        setPublished(null);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function recordEvent(event: Omit<CustomerEvent, "id" | "at">) {
    const nextEvent: CustomerEvent = {
      ...event,
      id: crypto.randomUUID(),
      at: new Date().toISOString()
    };
    let events: CustomerEvent[] = [];
    try {
      events = JSON.parse(window.localStorage.getItem(EVENTS_KEY) ?? "[]") as CustomerEvent[];
    } catch {
      events = [];
    }
    events.push(nextEvent);
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
    setEventCount(events.length);
    const labels = { click: "관심 상품을 확인했어요.", like: "좋아요에 담았어요.", purchase: "모의 구매가 기록됐어요." };
    setToast(`${labels[nextEvent.type]} 다음 추천에 반영됩니다.`);
    window.setTimeout(() => setToast(""), 2400);
  }

  return (
    <div className="shop">
      <header className="shop-header">
        <a className="shop-logo" href="/shop"><b>OLIVE</b><span>BETTER</span></a>
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
        <p>오늘의 나에게 맞는 건강한 아름다움</p>
          <Link href="/">MD 운영 화면 ↗</Link>
      </div>

      {published ? (
        <>
          <PageRenderer config={published} mode="customer" onEvent={recordEvent} />
          <footer className="shop-footer">
            <div className="shop-logo"><b>OLIVE</b><span>BETTER</span></div>
            <p>건강한 아름다움을 일상 가까이. © 2026 OLIVE BETTER MVP</p>
            <div><Link href="/">운영자 화면</Link><a href="#policy">표시 기준</a><a href="#help">도움말</a></div>
          </footer>
        </>
      ) : (
        <main className="unpublished-state">
          <div className="empty-orbit"><span>b.</span></div>
          <p>NOT PUBLISHED YET</p>
          <h1>새로운 웰니스 이야기를<br />준비하고 있어요.</h1>
          <span>안전 검토를 마친 기획전만 이곳에 공개됩니다.</span>
          <Link href="/">운영자 화면에서 기획전 만들기 →</Link>
        </main>
      )}
      {toast && <div className="shop-toast" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}
