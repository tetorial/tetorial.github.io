# @tetorial/web

Astro 정적 셸 + Preact 아일랜드(D-12)로 구성한 **전 패키지의 조립 계층**. 리플레이 재생·시뮬레이터·노트
저작을 단일 화면에서 잇는다. 다른 모듈이 "무엇"이라면 이 앱은 "어디서 어떻게 이어지는가"다.

- 배포: Cloudflare Pages 직접 업로드(D-19) — `https://tetorial.pages.dev/`. `astro.config.mjs`의
  `site="https://tetorial.pages.dev"` + `base="/"`. 내부 링크·에셋은 `withBase` 헬퍼 경유 의무.
  경로형 딥링크(`/replays/{id}`)는 `public/_redirects`의 200 리라이트로 서빙.
- 런타임 의존성(승인): `astro`·`@astrojs/preact`·`preact`·`pako`·`zod`(응답 검증, 명세 §4). 워크스페이스 패키지 전부.
  devDependency로 `wrangler`(E2E 서빙 전용 — 아래 딥링크·라우팅 절 참조).

## 딥링크·라우팅 (M1d — F-1 동결)

정규형은 **경로형뿐**이다: `{origin}/replays/<replayId>[?note=<clientId>.<noteId>][#p<n>]`
(`src/lib/deeplink.ts`). 구형 `?gist=`·`page=` 해석은 제거됐다(공유된 링크 0개 — D-2 따름정리).

- **replayId**: 32자 hex gistId는 16바이트 → base64url 22자(패딩 없음)로 인코딩해 발신한다.
  32-hex가 아니면 원문 그대로 발신(GitHub id 체계 변경 대비 fallback). 수신은 세그먼트가
  22자 + `[A-Za-z0-9_-]`면 디코딩해 32-hex 복원, 아니면 원문을 그대로 gistId로 쓴다
  (`encodeReplayId`/`decodeReplayId`).
- **note**: 발신은 항상 `<clientId>.<noteId>` 한정형. 수신은 bare `noteId`도 관용 해석.
- **fragment `#p<n>`**: 1-기준 페이지 서수, best-effort — 부재·범위 밖이면 첫 페이지
  (`pageIndexFromOrdinal`). 에러가 아니다.
- **경로 해석**: 브라우저는 `/replays/<id>`에 머물지만 서버는 `_redirects`의 200 리라이트로
  `/replay/`를 서빙한다(D-19). 파서는 `location.pathname`에서 `stripBase`로 base 접두를 벗긴
  뒤 세그먼트를 추출한다 — 루트 절대 경로 하드코딩 금지(AW-1).
- **로컬 개발(astro dev)**: `_redirects`는 Vite dev 서버에 적용되지 않으므로, `astro.config.mjs`의
  작은 Vite 미들웨어가 `/replays/*` → `/replay/`를 동일하게 흉내낸다(선택 항목, DX용).

## 구조

```
src/
├── layouts/Layout.astro        # 공통 셸 — 문서 메타·헤더(네비 슬롯)·푸터 (§2)
├── pages/                      # 라우트 (index / replay / 404)
├── components/                 # Preact 아일랜드
│   ├── OpenIsland.tsx          # 홈: 파일 드롭/선택 + gist URL 입력
│   ├── ReplayIsland.tsx        # 핵심(단일 아일랜드): 재생·사이드바·시뮬레이터 상태 공유 (§2)
│   ├── SimulatorPanel.tsx      # 저작 세션 조작(키+포인터)·페이지·주석·업로드
│   ├── SettingsPanel.tsx       # 핸들링·키·테마
│   └── BoardCanvas.tsx         # @tetorial/renderer 마운트
├── styles/tokens.css           # 디자인 토큰(--color-*·--space-* …) + 라이트/다크 (§2)
└── lib/                        # 프레임워크 무관 조립 로직(전부 유닛 테스트 — AW-*)
    ├── base-url.ts             # withBase 헬퍼 + stripBase(수신) + 하드코딩 경로 스캔 (AW-1)
    ├── deeplink.ts             # 경로형 딥링크 조립/파싱 — /replays/<id>?note=&#p<n> (M1d-1~5)
    ├── note-limit.ts           # 노트 생성 한도 차단 — 전체 notes-*.json 합산 (M1d-6)
    ├── open-replay.ts          # 로컬/gist 열기 오케스트레이션 + 무결성 게이트 (AW-2·AW-4)
    ├── handoff.ts              # 홈→리플레이 로컬 파일 1회성 전달(IndexedDB — 대용량 생존, W4)
    ├── playback-session.ts     # createPlayback + PlaybackClock 셸 (AW-2)
    ├── notes-loading.ts        # notes-*.json 로드·사이드바 평탄화·딥링크 후보 (AW-4·AW-10)
    ├── markers.ts              # 타임라인 노트 마커 배치·클러스터 (AW-10)
    ├── simulator.ts            # 저작 세션 + input 배선(suspend) + 업로드 조립 (AW-5·AW-7)
    ├── upload.ts               # 라운드 발췌 → MetaFile 조립 + 용량 추정 (AW-3)
    ├── worker-client.ts        # PUBLIC_WORKER_URL fetch 래퍼 + zod 응답 검증 (§4)
    ├── compression.ts          # pako gzip/gunzip + base64 (§4)
    ├── integrity.ts            # SHA-256(crypto.subtle) 대조
    ├── storage.ts              # tetorial: 네임스페이스 localStorage 유틸 (§4·§7)
    ├── settings.ts             # 핸들링·키·테마 해석·영속 (AW-8)
    └── errors.ts               # §6 오류·빈 상태 문구 매핑 (AW-9)
e2e/                            # Playwright 스모크 (Worker·rawUrl 라우트 mock, fixture 사용)
```

## 조립 계약 (다른 패키지와의 접점)

- **base path**: 모든 내부 링크·에셋은 `withBase()` 경유. 루트 절대 경로 하드코딩 금지(AW-1 스캔).
- **Worker**: `worker-client.ts`만 HTTP로 통신. `rawUrl`은 응답 값 그대로 fetch(손조립 금지 — gist-proxy §3).
  `PUBLIC_WORKER_URL` 미설정 시 저장·공유 비활성(재생·시뮬레이터는 무관하게 동작).
- **input ↔ sim**: input의 `EngineControls`는 `currentPiece`를 요구하지만 sim `session.controls`에는 없으므로,
  `simulator.ts`가 `session.controls` + `session.work.current`를 합쳐 어댑터를 만든다. 메타 액션 기본 조합
  (`undo=Ctrl+KeyZ` 등)은 apps/web이 `rebind`로 주입(input 명세 §2 — 메타 기본 바인딩은 비어 있음).
- **주석 포커스 ↔ suspend**: 주석 입력창 focus/blur가 `input.suspend()/resume()`를 구동(§3-D).
- **input tick은 앱이 구동**: input 코어는 주입식 시각의 순수 상태 머신이라 DAS/ARR/SDF 반복이
  진행되려면 앱이 매 프레임 `input.tick(t)`를 호출해야 한다(input README). `SimulatorPanel`이
  `attachDom`과 함께 rAF 루프로 `tick`을 구동한다 — 이 배선 누락이 W4 결함1이었다.
- **canvas 표시 크기는 DOM 책임**: 렌더러는 내부 픽셀 해상도(`canvas.width/height = CSS px × dpr`)만
  설정한다. 고DPI에서 히트테스트 좌표(offsetX/Y = CSS px)가 맞으려면 `BoardCanvas`가 `style.width/height`
  = 내부 픽셀 ÷ dpr로 표시 크기를 명시해야 한다 — 누락 시 그리기 오프셋(W4 결함6).
- **시뮬레이터 포커스 함정**: 무전환 동시 조작(D-14)이라 게임 키가 항상 활성 → 버튼 포커스 잔류 시
  Space 등이 재클릭한다. `SimulatorPanel`이 모달 내 버튼 클릭을 버블링에서 blur(§5, W4 결함7).
- **round 번호**: 재생은 doc 내부 인덱스, `origin.round`·라운드 표시는 원본 번호(`roundMap` — 로컬은 항등,
  gist는 `meta.rounds.map`). `open-replay.originalRound`/`branchOrigin`이 변환.

## 사용

```sh
pnpm --filter @tetorial/web dev        # 개발 서버
pnpm --filter @tetorial/web build      # 정적 빌드 (dist/)
pnpm --filter @tetorial/web typecheck  # tsc --noEmit
pnpm --filter @tetorial/web e2e        # Playwright 스모크 (playwright install chromium 필요)
                                        # webServer: pnpm build → wrangler pages dev (M1d §6 —
                                        # astro preview는 public/_redirects를 처리하지 않아
                                        # 경로형 딥링크 /replays/*가 404가 된다)

# 유닛/조립 테스트는 루트에서
pnpm test        # 전 패키지 (apps/web 유닛 포함)
```

Worker URL 주입(로컬):

```sh
PUBLIC_WORKER_URL="http://127.0.0.1:8787" pnpm --filter @tetorial/web dev
```

## 수용 기준 (AW-1 ~ AW-10)

유닛/조립 테스트(Vitest, `src/lib/*.test.ts`)가 수용 기준 ID를 테스트 이름에 명시한다
(`node tools/check-acceptance.mjs`가 자동 대조). Playwright 스모크(`e2e/`)가 브라우저 종단 흐름을 보완한다.
`e2e/w4-smoke.spec.ts`는 실기기 스모크에서 발견된 배선 결함 7건(rAF tick·홀드/넥스트·분기 프레임
복귀·업로드 버튼·대용량 드롭·고DPI 그리기 좌표·포커스 잔류)의 실브라우저 회귀 테스트다 — mock 계층
유닛을 통과하고도 실기기에서 깨졌던 결함들이라 canvas 좌표·rAF·버튼 존재는 실 페이지에서 검증한다.

M1d(경로형 딥링크 동결·한도 차단·키 기본값 — M1d-1 ~ M1d-7)는 브랜치 한정 명세
(`docs/specs/apps-web-m1d.md`, main에 머지되지 않음)의 수용 기준이며, 위 표와 별개로
`deeplink.test.ts`·`note-limit.test.ts`·`settings.test.ts`·`e2e/m1d.spec.ts`에서 검증한다.

| ID | 검증 | 위치 |
| --- | --- | --- |
| AW-1 | base 반영·하드코딩 스캔·딥링크 파싱 | `base-url.test.ts`·`deeplink.test.ts` |
| AW-2 | 로컬 열기·재생·seek·배속 | `open-replay.test.ts` + `e2e/replay-local` |
| AW-3 | 라운드 발췌·용량·MetaFile 조립·POST | `upload.test.ts`·`worker-client.test.ts` |
| AW-4 | index→rawUrl→무결성→재생, 손상·404 | `open-replay.test.ts`·`notes-loading.test.ts` + `e2e/replay-gist` |
| AW-5 | 분기→조작·그리기→페이지→주석(포커스 정지)→PUT | `simulator.test.ts`·`worker-client.test.ts` |
| AW-6 | 드래프트 왕복 복구(미페이지 보드 포함) | `simulator.test.ts`·`storage.test.ts` |
| AW-7 | 편집 키 최초 생성·재사용·타 브라우저 403 | `storage.test.ts`·`simulator.test.ts` |
| AW-8 | 핸들링·키 즉시 반영·영속·리셋 | `settings.test.ts` |
| AW-9 | §6 오류 매핑 전 행 | `errors.test.ts` |
| AW-10 | 마커 위치·클러스터·딥링크·noteId 충돌 후보 | `markers.test.ts`·`notes-loading.test.ts`·`deeplink.test.ts` |
