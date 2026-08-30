# AI Collaboration

## 사용 도구

- Codex: 요구사항 분석, 아키텍처 설계, 구현, 테스트, 문서화
- Browser 자동화: 운영자→발행→고객 반응→재생성 흐름과 반응형 화면 검증
- Image generation: 완성된 사이트의 소셜 미리보기 카드 제작

## 작업 기록 색인

| 작업 영역 | 관련 로그 또는 파일 | 실행 결과 위치 |
| --------- | ------------------- | -------------- |
| 과제 요구사항 해석 | 사용자 제공 과제 본문 | `README.md` 구현 범위 |
| 데이터·안전 엔진 | `lib/engine.mjs`, `data/rules.json` | `tests/engine.test.mjs` |
| 300개 데모 데이터 | `scripts/generate-demo-data.mjs` | `data/products.json` |
| 공개 소스·안전 카피 엔진 | `app/api/research/route.ts`, `app/api/generate-banner/route.ts`, `lib/safe-copy.mjs` | 운영자 화면 근거 패널 |
| 운영자 검토·발행 | `app/components/Workbench.tsx` | `screenshots/01-operator-review.jpg` |
| 고객 화면·반응 수집 | `app/components/Shop.tsx`, `app/components/PageRenderer.tsx` | `screenshots/02-customer-published.jpg`, `screenshots/03-customer-reaction.jpg` |
| 반응 재적용 | `lib/engine.mjs` | `screenshots/04-feedback-reapplied.jpg` |
| 공유 발행과 이벤트 저장 | `app/api/campaign/route.ts`, `app/api/events/route.ts`, `lib/server-store.ts`, `db/schema.ts` | D1 통합 테스트 |
| 운영 API 보호 | `lib/operator-auth.ts`, `lib/request-security.ts` | 권한 거부, 요청 크기와 호출 제한 테스트 |
| 반응형·빈 상태 | `app/globals.css` | `screenshots/05-customer-mobile.jpg` |
| 소셜 미리보기 | `public/og.png`, `app/layout.tsx` | Open Graph/X 메타데이터 |
| 자동화 검증 | `tests/*.test.mjs` | `npm test` 결과 |

## 최종 실행 확인

- 명령: `npm run typecheck`
- 결과: TypeScript 오류 없음
- 명령: `npm run build`
- 결과: 운영자·고객·API 경로 프로덕션 빌드 성공
- 명령: `npm test`
- 결과: 자동화 테스트 26건 전체 통과
- 명령: `npm run lint`
- 결과: 오류 없음
- 명령: `npm audit --omit=dev`, `npm audit`
- 결과: 프로덕션과 전체 의존성 모두 고위험 및 치명적 취약점 없음
- 브라우저 흐름: 운영자 발행 → 별도 고객 세션 조회 → 구매 반응 → 다음 초안 재생성
- 결과: 공유 발행본 노출, 구매 7점 반영, 데스크톱과 390px 모바일 가로 넘침 없음
