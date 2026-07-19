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
│   ├── ReplayIsland.tsx        # 핵심(단일 아일랜드): 재생·사이드바·수집함·시뮬레이터 상태 공유 (§2)
│   ├── replay/                 # ReplayIsland 하위 분해 (M4-C AW-23, #46)
│   │   ├── PlaybackControls.tsx  # 재생 컨트롤(한 벌) — 버튼·배속·스크러버·마커·대기쓰레기(보드별)
│   │   ├── RoundSelect.tsx       # 라운드 선택 + 지원 배지 (M6-B로 플레이어 셀렉터 제거 — AW-37)
│   │   ├── BranchBar.tsx         # 분기 바 + 분기 불가 인라인 안내 (AW-22)
│   │   ├── Sidebar.tsx           # 노트 사이드바 + 노트 수집함
│   │   ├── UploadPanel.tsx       # 리플레이 업로드 패널 + 공유 배너
│   │   └── EmptyState.tsx        # 빈 상태·오류 상태 화면
│   ├── SimulatorPanel.tsx      # 저작 세션 조작(키+포인터·팔레트)·페이지·주석·노트 완성 (업로드 없음 — M3-B)
│                               # 재생 영역 자리에 놓이는 인플레이스 편집 영역 — 오버레이 모달 아님 (M6-A AW-34)
│   ├── NoteViewer.tsx          # 노트 열람: createViewerSession 기반 보드 뷰어 + 이어서 편집 (AW-12·13)
│   ├── GameHud.tsx             # 공통 게임 HUD — 재생·시뮬레이터·노트 뷰어 3화면 공용 (M5-A AW-26~29)
│   ├── SettingsPanel.tsx       # 핸들링·키·테마
│   ├── PiecePreview.tsx        # renderPiecePreview 마운트 — Next·Hold 아이콘 (AW-18)
│   └── BoardCanvas.tsx         # @tetorial/renderer 마운트
├── styles/                     # tokens.css — 디자인 토큰 + 라이트/다크 (§2)
│                               # controls.css — 공용 컨트롤 조각 (M4-C AW-24, #48)
└── lib/                        # 프레임워크 무관 조립 로직(전부 유닛 테스트 — AW-*)
    ├── base-url.ts             # withBase 헬퍼 + stripBase(수신) + 하드코딩 경로 스캔 (AW-1)
    ├── deeplink.ts             # 경로형 딥링크 조립/파싱 — /replays/<id>?note=&#p<n> (M1d-1~5)
    ├── gist-input.ts           # gist URL/id 입력 정규화 — OpenIsland·EmptyState 공용 (M4-B AW-20, #43)
    ├── note-limit.ts           # 노트 생성 한도 차단 + 묶음 업로드 합산 사전 검사 (M1d-6·AW-17)
    ├── note-collection.ts      # 노트 수집함(메모리) + 묶음 조립 + 단일 PUT (AW-15·16·17)
    ├── note-viewer.ts          # createViewerSession 배선 + 편집 진입 조건 (AW-12·13)
    ├── piece-preview.ts        # Next·Hold 표시 슬라이스·매핑 (AW-18)
    ├── game-hud.ts             # HudModel 계산부 — 재생 뷰·작업 뷰 공용 매핑 (M5-A AW-26~29)
    ├── palette.ts              # 셀 팔레트·포인터 도구 — 선택→Tool·고스트·우클릭·스포이드 (M5-D AW-30~33)
    ├── sim-view.ts             # 재생 ↔ 편집 인플레이스 전환 표시 계약 — 모드 판정·크롬 표시 (M6-A AW-34·35)
    ├── open-replay.ts          # 로컬/gist 열기 오케스트레이션 + 무결성 게이트 + originalRound (AW-2·AW-4·AW-25)
    ├── handoff.ts              # 홈→리플레이 로컬 파일 1회성 전달(IndexedDB — 대용량 생존, W4)
    ├── playback-session.ts     # N보드 세션 — createPlayback×N + 합성 컨트롤러 + PlaybackClock 셸 (AW-2·38)
    ├── dual-playback.ts        # 양보드 순수 로직 — 대상 선택·합성 컨트롤러·스왑 매핑 (M6-B AW-37~40)
    ├── notes-loading.ts        # notes-*.json 로드·사이드바 평탄화·딥링크 후보 (AW-4·AW-10)
    ├── markers.ts              # 타임라인 노트 마커 배치·클러스터 + 양보드 합집합 + 표시·상호작용 헬퍼 (AW-10·40·43·44)
    ├── simulator.ts            # 저작 세션 + input 배선(suspend) (AW-5)
    ├── upload.ts               # 라운드 발췌 → MetaFile 조립 + 용량 추정 (AW-3)
    ├── worker-client.ts        # PUBLIC_WORKER_URL fetch 래퍼 + zod 응답 검증 (§4)
    ├── compression.ts          # pako gzip/gunzip + base64 (§4)
    ├── integrity.ts            # SHA-256(crypto.subtle) 대조
    ├── storage.ts              # tetorial: 네임스페이스 localStorage 유틸 (§4·§7)
    ├── settings.ts             # 핸들링·키·테마 해석·영속 (AW-8)
    └── errors.ts               # §6 오류·빈 상태 문구 매핑 (AW-9)
e2e/                            # Playwright 스모크 (Worker·rawUrl 라우트 mock, fixture 사용)
```

## 노트 흐름 (M3-B — 수집 → 묶음 업로드)

**업로드 경로는 하나다.** 시뮬레이터 안에는 업로드가 없다 — 노트 단위 PUT은 M3-B에서 제거됐다.

```
분기 / 사이드바 "이어서 편집"
        ↓
  SimulatorPanel — "노트 완성"(finishNote) … 노트 단위 한도 위반은 여기서 보고
        ↓  onCollect
  수집함(ReplayIsland의 메모리 상태 — 리플레이 단위, 영속화 없음)
        ↓  "모두 업로드"(uploadCollectedNotes)
  assembleCollectedFile: 수집 노트 전부 → 자기 파일 하나 (assembleNotesFile 순차 체이닝)
        ↓  replayLimitViolation: 합산 한도 사전 검사(Worker M2E 교차 검사와 동일 기준)
  PUT /g/:id/notes  ×1        ← 와이어 포맷·Worker 계약 무변경
        ↓  applyUploadedFile
  loaded.notesFiles 갱신 → 사이드바 즉시 반영(재로드 없음)
```

- **수집함은 메모리 전용**이다. 미업로드 상태로 이탈하면 `beforeunload` **경고만** 하고 사라진다 —
  localStorage 영속화는 하지 않는다(소유자 결정 2026-07-17). 홈→리플레이 로컬 파일 핸드오프
  (`handoff.ts`)와는 별개 경로로, 현행 동작을 유지한다.
- **`assembleNotesFile`(sim)은 단건 upsert**다. 묶음 조립은 웹의 `assembleCollectedFile`이 앞 결과를
  다음 호출의 `current`로 넘겨 순차 체이닝한다 — 노트 id 기준 교체/추가가 누적된다.
- **재편집도 같은 수집함을 거친다**. `createSimulator({ existing })`는 노트 id를 보존하므로 조립에서
  기존 노트를 교체한다(노트 수가 늘지 않아 생성 한도 차단 대상이 아니다 — `note-limit.ts` 주석).
- **업로드 결과 표시는 수집함 밖에 산다**. 성공하면 수집함이 비어 사라지므로, 안에 두면 결과 문구가
  함께 증발한다(AW-11의 "성공 문구" 요구가 무음이 된다).

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
  Space 등이 재클릭한다. `SimulatorPanel`이 편집 영역 내 버튼 클릭을 버블링에서 blur(§5, W4 결함7).
  모달을 인플레이스 전환으로 바꿔도(M6-A) 이 blur 배선(`sim-inner`의 onClick)은 유지된다.
- **재생 ↔ 편집 인플레이스 전환(M6-A AW-34~36)**: `simEntry` 활성 시 `ReplayIsland`가 재생 영역
  (재생 컨트롤·라운드/플레이어·업로드·분기 바·노트 사이드바)을 편집 영역(`SimulatorPanel`)으로
  **같은 화면 자리에서 교체**한다 — 오버레이 모달(fixed·backdrop·z-index·`role="dialog"`) 없음.
  모드 판정은 순수 헬퍼 `lib/sim-view.ts`(`replayViewMode`·`showsPlaybackChrome`). 종료 시 분기
  프레임 복귀·수집함 유지·rAF `input.tick` 수명 주기는 현행 그대로다.
- **round 번호**: 재생은 doc 내부 인덱스, `origin.round`·라운드 표시는 원본 번호(`roundMap` — 로컬은 항등,
  gist는 `meta.rounds.map`). `open-replay.originalRound`/`branchOrigin`이 변환.
- **양보드 재생(M6-B AW-37~40)**: 1vs1(플레이어 ≥ 2)은 두 플레이어의 보드+공통 HUD를 좌우로 동시
  재생하고(솔로 ttr은 단일 보드 유지), `RoundSelect`의 플레이어 셀렉터는 사라진다. **구동원(시계)은
  하나**다 — `playback-session.ts`가 플레이어별 `createPlayback` 컨트롤러 N개를 `createCompositeController`
  (`dual-playback.ts`)로 묶어 단일 `PlaybackClock`이 구동한다. 합성 컨트롤러는 `step`·`seek`를 모든 자식에
  함께 적용하므로 정지 상태에서 두 보드의 frame이 언제나 동일하고(AW-38), 슬라이더 범위는 두 보드의
  `max(totalFrames)`, 짧은 쪽은 자기 마지막 프레임에서 멈춘 채 유지된다(범위 밖 seek 무오류). 재생 컨트롤·
  노트 마커·사이드바는 **한 벌**이며, 마커는 표시 중인 두 플레이어의 노트를 `collectMarkersForPlayers`로
  한 타임라인에 모은다.
- **보드 스왑(AW-39·40)**: 두 보드 사이 스왑 버튼은 **화면 배치만** 바꾼다(`displayOrder`) — 각 보드가
  나타내는 실제 플레이어 인덱스, 노트의 `origin.player`, 마커·사이드바 해석은 불변이다. 시뮬레이터 진입
  (분기)은 **왼쪽 보드만** 허용하며(`leftBoardIndex`), 분기 `player`·`frame`은 현재 왼쪽에 놓인 보드의 실제
  플레이어 인덱스·자기 프레임이다 — 원하는 플레이어를 편집하려면 스왑으로 왼쪽에 두고 진입한다.

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
| AW-5 | 분기→조작·그리기→페이지→주석(포커스 정지)→PUT | `simulator.test.ts`·`note-collection.test.ts`·`worker-client.test.ts` |
| AW-6 | ~~드래프트 왕복 복구~~ — 사슬 제거됨(m4a, #42). AW-19가 잔재 부재를 고정 | `simulator.test.ts`·`storage.test.ts` |
| AW-7 | 편집 키 최초 생성·재사용·타 브라우저 403 | `storage.test.ts`·`note-collection.test.ts` |
| AW-8 | 핸들링·키 즉시 반영·영속·리셋 | `settings.test.ts` |
| AW-9 | §6 오류 매핑 전 행 | `errors.test.ts` |
| AW-10 | 마커 위치·클러스터·딥링크·noteId 충돌 후보 | `markers.test.ts`·`notes-loading.test.ts`·`deeplink.test.ts` |

## 수용 기준 (AW-11 ~ AW-18 — M3-B 노트 UX 정상화)

브랜치 한정 명세 `docs/specs/m3b-notes-ux.md`의 수용 기준이다(#36 #37 #38 #39).
`e2e/m3b.spec.ts`가 실브라우저 배선(수집→단일 PUT→사이드바 반영·재편집 진입·403 문구)을 보완한다.

| ID | 검증 | 위치 |
| --- | --- | --- |
| AW-11 | 업로드 즉시 반영 + 정직한 성공 문구 | `notes-loading.test.ts`(`applyUploadedFile`) + `e2e/m3b` |
| AW-12 | 보드 렌더 뷰어·페이지 이동·딥링크 서수 | `note-viewer.test.ts` + `e2e/m3b`·`e2e/m1d` |
| AW-13 | 내 노트 이어서 편집(같은 id upsert)·타인 열람 전용 | `note-viewer.test.ts`·`note-collection.test.ts` + `e2e/m3b` |
| AW-14 | 403 → `toDisplayError` 매핑(시크릿 미노출) | `note-collection.test.ts`·`errors.test.ts` + `e2e/m3b` |
| AW-15 | 노트 완성 = 메모리 수집(전송 없음)·이탈 경고 조건 | `note-collection.test.ts` + `e2e/m3b` |
| AW-16 | 수집 노트 전부 → 파일 하나 → 단일 PUT | `note-collection.test.ts` + `e2e/m3b` |
| AW-17 | 합산·파일 한도 PUT 전 차단(Worker M2E와 정합) | `note-collection.test.ts`·`note-limit.test.ts` |
| AW-18 | Next·Hold 표시 슬라이스·매핑 (그리기는 RD-4) | `piece-preview.test.ts` + `e2e/w4-smoke`·`e2e/m1d` |

## 수용 기준 (AW-19 ~ AW-25 — M4 감사 정리)

브랜치 한정 명세(M4 웨이브)의 수용 기준이다(#42~#48). AW-22~24는 구조·UI 변경이라
테스트 대응 없는 `[문서]` 기준이었다 — 코드 위치로 대신 기록한다.

| ID | 검증 | 위치 |
| --- | --- | --- |
| AW-19 | 웹 드래프트 잔재 소멸 — simulator·storage 공개 표면에 draft API 부재 (#42) | `simulator.test.ts`·`storage.test.ts` |
| AW-20 | gist 입력 정규화 공용 헬퍼 — URL/id/공백/오류 문구 (#43) | `gist-input.test.ts` |
| AW-21 | worker 미설정 읽기 실패 문구 — writes-disabled와 구분 (#44) | `errors.test.ts` |
| AW-22 | 분기 불가 인라인 안내 — alert 제거 (#45) | `[문서]` — `replay/BranchBar.tsx`·`ReplayIsland.tsx` |
| AW-23 | ReplayIsland(1,023줄) 분해 (#46) | `[문서]` — `components/replay/` 구조 자체 |
| AW-24 | 공용 컨트롤 CSS 전역 승격 (#48) | `[문서]` — `styles/controls.css` |
| AW-25 | originalRound 헬퍼 — roundMap 손계산 치환·항등 fallback (#47) | `open-replay.test.ts` |

## 수용 기준 (AW-26 ~ AW-33 — M5 공통 HUD + 저작 도구)

브랜치 한정 명세(M5-A·M5-D 웨이브)의 수용 기준이다(#53 #54). `e2e/m5a.spec.ts`(HUD 관측면)·
`e2e/m5-d-web.spec.ts`(팔레트·포인터 실브라우저 — 포인터 캡처 회귀 포함)가 배선을 보완한다.

| ID | 검증 | 위치 |
| --- | --- | --- |
| AW-26 | 공통 HUD 계산부 — 재생 뷰·작업 뷰 → 동일 HudModel | `game-hud.test.ts` + `e2e/m5a` |
| AW-27 | HUD 관측면 — 3화면 통일, 텍스트 레이블·자리표시자 부재 | `game-hud.test.ts` + `e2e/m5a` |
| AW-28 | 카운터 표시 규칙 — 원값 규약(-1=없음, D-10), 1부터 표시, 가공(±1) 금지 | `game-hud.test.ts` |
| AW-29 | 재생 HUD 데이터 — PlaybackView(stats 원값) → HudModel | `game-hud.test.ts` |
| AW-30 | 셀 팔레트 — G·D·미노 7종 9개, 선택→`Tool` 매핑(하드코딩 없음) | `palette.test.ts` + `e2e/m5-d-web` |
| AW-31 | 고스트 프리뷰 — 호버 표시·셀 좌상단 스냅·알파 0.4~0.6 | `palette.test.ts` + `e2e/m5-d-web` |
| AW-32 | 우클릭 지우기 — cell/erase→erase, highlight→`force:"off"`, 컨텍스트메뉴 억제 | `palette.test.ts` + `e2e/m5-d-web` |
| AW-33 | 휠클릭 스포이드 — 셀 값→팔레트 선택+cell 도구 전환, 빈 칸 무시 | `palette.test.ts` + `e2e/m5-d-web` |

## 수용 기준 (AW-34 ~ AW-36 — M6-A 비모달 인플레이스 전환)

브랜치 한정 명세 `docs/specs/m6a-inplace-sim.md`의 수용 기준이다(#55). 시뮬레이터 오버레이 모달을
제거하고, 재생 화면 자리에서 재생↔편집 모드가 교체되는 인플레이스 전환으로 바꾼다. 표시 위치·전환
방식만 바뀌며 시뮬레이터 기능(키·포인터·팔레트·페이지/주석·수집)은 무변경이다. 순수 판정부
(`sim-view.ts`)는 유닛이, 실브라우저 전환·복귀·포커스·키 배선은 `e2e/m6a.spec.ts`가 고정한다.
좌표 재사용에 의존하던 `e2e/m5-d-web` AW-31의 조정 사유는 `QUESTIONS.md` 참조.

| ID | 검증 | 위치 |
| --- | --- | --- |
| AW-34 | 인플레이스 전환 — fixed 오버레이·backdrop·dialog 부재, 보드·HUD 배치 유지 | `sim-view.test.ts` + `e2e/m6a` |
| AW-35 | 팔레트가 재생 슬라이더 자리에 배치, 재생 전용 크롬은 편집 중 미표시 | `sim-view.test.ts` + `e2e/m6a` |
| AW-36 | 회귀 없음 — 분기 프레임 복귀·포커스(Space 누출 없음)·키 배선·수집 흐름 | `e2e/m6a`(+ 기존 `w4-smoke`·`m3b`·`m5a`·`m5-d-web` 통과) |

## 수용 기준 (AW-37 ~ AW-40 — M6-B 1vs1 양보드 재생)

브랜치 한정 명세 `docs/specs/m6b-dual-board.md`의 수용 기준이다(#15). 단일 보드+플레이어 셀렉터 구조를
두 플레이어 보드 동시 재생으로 대체한다. 순수 로직(양보드 대상 선택·동기 판정·max 프레임·스왑 매핑·
마커 합집합)은 유닛(`dual-playback.test.ts`·`markers.test.ts`)이, 실브라우저 양보드 렌더·스왑·왼쪽 진입은
`e2e/m6b.spec.ts`가 고정한다. 1vs1 ttrm이 두 보드를 렌더하게 되어 조정한 기존 e2e(`m5a`·`replay-gist`의
HUD·캔버스 스코프)는 해당 스펙 주석에 사유를 남겼다.

| ID | 검증 | 위치 |
| --- | --- | --- |
| AW-37 | 양보드 재생 — 1vs1 두 보드+공통 HUD 동시, 솔로 단일 보드·플레이어 셀렉터 제거 | `dual-playback.test.ts`(`roundTargets`·`isDualRound`) + `e2e/m6b` |
| AW-38 | 동기 컨트롤 — 한 시계·합성 컨트롤러, 정지 상태 frame 동일, max 슬라이더·짧은 쪽 마지막 상태 유지·범위 밖 seek 무오류 | `dual-playback.test.ts`(`createCompositeController`·`boardFrameAt`) + `e2e/m6b` |
| AW-39 | 보드 스왑 — 화면 배치 스왑(`displayOrder`), 분기 진입은 왼쪽 보드만(`leftBoardIndex`) | `dual-playback.test.ts` + `e2e/m6b` |
| AW-40 | 노트 호환 — `origin.player`는 실제 플레이어 인덱스, 스왑 무관·마커 합집합 | `dual-playback.test.ts`·`markers.test.ts`(`collectMarkersForPlayers`) + `e2e/m6b` |

## 수용 기준 (AW-42 ~ AW-44 — M6-C 슬라이더·마커 시각 통합)

브랜치 한정 명세 `docs/specs/m6c-slider-markers.md`의 수용 기준이다(#56). 재생 슬라이더 핸들과 노트 마커를
한 디자인 언어로 통합하고, 클러스터를 드롭다운 선택으로 바꾼다. 마커 **데이터 계산**(`clusterMarkers`·
`markerRatio`)의 의미론은 불변이고, 표시·상호작용만 바뀐다(`markers.ts`에 순수 헬퍼 `markerLabel`·
`clusterInteraction` 추가). 형태(AW-42·43)는 스타일 계약 유닛(`PlaybackControls.test.ts`) + 실렌더 관측
`e2e/m6c-markers.spec.ts`로, 상호작용(AW-44)은 순수 판정 유닛(`markers.test.ts`) + 실브라우저 호버·클릭
`e2e/m6c-markers.spec.ts`로 고정한다.

| ID | 검증 | 위치 |
| --- | --- | --- |
| AW-42 | 슬라이더 핸들 — 원형 네이티브 핸들을 세로 직사각형 커스텀(`::-webkit-slider-thumb`·`::-moz-range-thumb`)으로 교체 | `PlaybackControls.test.ts`(STYLES 계약) + `e2e/m6c-markers`(appearance 리셋) |
| AW-43 | 마커 화살촉 — 원형 대신 위로 뾰족한 화살촉(clip-path 다각형), 슬라이더와 토큰 통합·클러스터 수 식별 유지 | `PlaybackControls.test.ts`·`markers.test.ts`(`markerLabel`) + `e2e/m6c-markers` |
| AW-44 | 클러스터 드롭다운 — 노트 2개 이상은 호버/포커스 드롭다운 선택 열기, 단일 마커는 클릭 즉시 열기 | `markers.test.ts`(`clusterInteraction`) + `e2e/m6c-markers`(호버·항목 클릭) |
