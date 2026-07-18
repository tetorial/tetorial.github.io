# Tetorial 명세: 공통 게임 HUD (@tetorial/web)

> 상태: M5 W5-1 (#53 U-6) · 관련 모듈: **apps/web 단독**
> 역할: **재생·시뮬레이터·노트 뷰어의 Hold/Next/B2B/Combo 표시를 하나의 공통 HUD 컴포넌트로 통일하고 레이아웃 규범을 적용한다.**
>
> 실증 전제 (2026-07-18 총괄 실측): 세 화면의 HUD 데이터는 이미 전부 노출되어 있다 — **타 패키지 수정이 필요 없다.**
>
> - 재생: `PlaybackView.next` / `.hold{piece,locked}` / `.stats{b2b,combo,…}` — `packages/replay-tetrio/src/playback.ts`
> - 시뮬레이터: `WorkView.next` / `.hold{piece,locked}` / `.counters{b2b,combo}` — `packages/sim/src/work.ts`
> - 뷰어: `createNoteViewer(...).view`가 WorkView 형태(현행도 `workFrame(view)`에 태운다) — `apps/web/src/components/NoteViewer.tsx`

## 1. 경계 / 책임

- 수정 범위는 **apps/web뿐이다.** `packages/*`·`workers/*` 수정 금지 — 수정이 필요해 보이면 QUESTIONS.md에 기록하고 보류.
- HUD는 **DOM 컴포넌트**다. 미노 아이콘은 기존 `PiecePreview`(renderer `renderPiecePreview` 배선, RD-4)를 재사용한다. renderer에 새 그리기 경로를 만들지 않는다.
- **하지 않는 것**: 보드 캔버스 변경 · PlaybackControls 변경 · 시뮬 도구 UI 개편(#54, W5-2) · 모달→인플레이스 전환(#55) · 1vs1 양보드(#15).

## 2. 공통 HUD — 컴포넌트와 계산부

- 신규: `src/components/GameHud.tsx`(DOM) + `src/lib/game-hud.ts`(계산부 — 테스트 대상).
- 계산부는 각 화면의 뷰를 단일 뷰모델로 매핑한다:

```ts
interface HudModel {
  hold: { piece: PieceType; locked: boolean } | null;
  next: PieceType[]; // [0] = 가장 먼저 나오는 미노
  counters: { label: "B2B" | "Combo"; value: number }[]; // 표시할 것만 담는다
}

function playbackHud(view: PlaybackView): HudModel;
function workHud(view: WorkView): HudModel; // 시뮬레이터·뷰어 공용
```

- 기존 `lib/piece-preview.ts`의 `holdPreview`·`nextPreviewSlice`(NEXT_PREVIEW_COUNT=5)를 계산부에서 재사용한다 — 표시 개수 규약을 바꾸지 않는다.
- **규범(規範) — 카운터 표시 규칙**:
  - 입력은 tetr.io 원값 규약이다: `-1 = 없음, 0부터 유효` (D-10). 정규화 계층을 만들지 않는다.
  - **`value >= 1`일 때만 `counters`에 포함한다. 표시 숫자는 원값 그대로 — 가공(±1) 금지.**
  - b2b·combo는 각각 독립 판정이다 (한쪽만 표시될 수 있다).
  - 지표 이름 표기는 `B2B` · `Combo`.

## 3. 레이아웃 규범(規範)

- **Hold = 보드 왼쪽, Next = 보드 오른쪽** — HUD가 보드를 사이에 두는 3열 구성. GameHud가 보드(children)를 감싸는 형태를 권장하나 구조는 재량.
- Next는 **세로 배치, `next[0]`이 맨 위**.
- Hold·보드·Next는 **상단 정렬**.
- Hold·Next의 미노는 **정사각형 박스**로 감싼다. (PiecePreview 캔버스는 4×2 격자 비율 — 박스를 정사각으로 잡고 아이콘을 중앙 배치.)
- **"홀드"/"다음" 텍스트 레이블을 두지 않는다** — 위치로 식별한다. 접근성 `aria-label`은 유지.
- 빈 홀드는 빈 정사각 박스로 표시한다(기존 `—` 텍스트 자리표시자 제거).
- **B2B/Combo는 Next 열 아래.** 굵은 글씨(font-weight 600 이상), **지표 이름 위 + 숫자 아래** 세로 배치.
- 모바일(48rem 이하) 대응은 기존 화면들의 축소 방식을 따르되 규범(좌/우/세로/정렬)을 깨지 않는 선에서 재량.

## 4. 화면별 적용

| 화면 | 현행 | 적용 |
|---|---|---|
| 재생 `ReplayIsland` | HUD 없음 — `BoardCanvas`만 | `session.view`(PlaybackView)로 `playbackHud` → GameHud. 기존 rAF 재렌더 루프가 HUD도 갱신한다 — **추가 루프 금지** |
| 시뮬 `SimulatorPanel` | `PieceBar`(DOM, 텍스트 레이블) | PieceBar 제거 → GameHud (`workHud(work)`) |
| 뷰어 `NoteViewer` | `vm-pieces`(DOM, 텍스트 레이블) | vm-pieces 제거 → GameHud (`workHud(view)`) |

- **관측 규약**: 그래픽 표기라 상태가 텍스트로 남지 않는다 — 기존 방식대로 data 속성으로 관측 가능하게 유지한다. 공통 testid: `hud-hold`(`data-piece`·`data-locked`), `hud-next`(`data-next`), `hud-counters`(`data-b2b`·`data-combo` — 비표시면 속성 없음). 기존 `sim-hold`·`sim-next` 등을 참조하는 e2e(`apps/web/e2e/m3b.spec.ts` 등)는 새 testid로 갱신한다.
- **CSS 정리**: 대체 후 사문이 되는 잔류 규칙을 제거한다 — SimulatorPanel `.piece-bar`·`.piece-slot`·`.piece-empty`, ReplayIsland STYLES의 `.piece-slot`·`.piece-empty` 잔류분(M4-C 캐스케이드 보존 주석 — 대체되면 보존 대상이 사라진다), NoteViewer `.vm-pieces` 계열.

## 수용 기준 (작업 세션 완료 조건)

- **AW-26 공통 HUD**: 재생·시뮬레이터·뷰어가 동일 HUD 컴포넌트로 Hold/Next를 렌더한다 — 계산부 검증: `playbackHud`·`workHud`가 세 화면의 뷰를 동일 HudModel로 매핑한다(hold 유/무·locked, next 슬라이스 5개 상한 포함)
- **AW-27 레이아웃 규범** [문서]: Hold 왼쪽 / Next 오른쪽 세로(빠른 순서 위) / 상단 정렬 / 미노 정사각 박스 / "홀드"·"다음" 텍스트 없음 — e2e(testid·data 속성) + 게이트 11 실조작으로 검증
- **AW-28 B2B·combo**: Next 아래 굵은 글씨, 이름+숫자 세로 배치, 값 1 이상일 때만 표시 — 계산부 검증: `-1`·`0` 비표시, `1` 표시 경계, 원값 무가공, b2b/combo 독립 판정
- **AW-29 재생 HUD 데이터**: 재생 중 현재 프레임의 Hold/Next/B2B/combo가 HUD에 표시된다 — 계산부 검증: PlaybackView(stats 원값 포함) → HudModel 매핑

## 참고자료

- #53 (U-6) — 이슈 본문에 레이아웃 규범 원문
- D-10 (카운터 `-1` 규약 전 모듈 공유) · D-16 (Preact·캔버스는 에이전트 판단 수용 상태 — 이 웨이브에서 재론하지 않는다)
- m3b AW-18 선례: 계산부(lib) 테스트 + data 속성 관측 + e2e 패턴 (`lib/piece-preview.ts`·`components/PiecePreview.tsx`)
