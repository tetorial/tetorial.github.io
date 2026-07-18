# Tetorial 명세: 리플레이 ↔ 시뮬레이터 비모달 전환 (M6-A, @tetorial/web)

> 상태: 작업 중 · 관련 모듈: apps/web (단독)
> 역할: **시뮬레이터 오버레이 모달을 제거하고, 재생 화면 자리에서 재생↔편집 모드가 교체되는 인플레이스 전환으로 바꾼다.**
> 근거: #55 (상담 정리 2026-07-18, 소유자 채택). 전제인 공통 HUD 통일(#53)·셀 팔레트(#54)는 완료 상태다.

## 1. 경계 / 책임

- 수정 범위는 **apps/web뿐**이다. `packages/*`·`workers/*`·`docs/`(이 명세 제외)·루트 설정 수정 금지.
- 시뮬레이터의 **기능**(키·포인터 조작, 팔레트, 페이지/주석, 노트 완성·수집)은 변경하지 않는다 — **표시 위치와 전환 방식만** 바꾼다.
- `NoteViewer`·`UploadPanel`·`SettingsPanel`의 표시 방식은 범위 밖이다. 건드리지 않는다.
- 스키마·딥링크·저장 와이어 포맷 무관 웨이브다. 흔적을 남기지 않는다.

## 2. 현행 구조 (출발점)

- `ReplayIsland.tsx`가 재생 영역(topbar → `GameHud`+`BoardCanvas` → `PlaybackControls` → `BranchBar` → 수집함)과 `simEntry` 상태를 소유한다.
- `simEntry` 활성 시 `SimulatorPanel`을 **fixed 오버레이 모달**로 띄운다: `.sim-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 60 }`, `role="dialog"` (SimulatorPanel.tsx:192·331).
- `SimulatorPanel`은 자체 `GameHud`+`BoardCanvas`·팔레트·페이지/주석 UI를 모달 내부에 그린다.
- 종료: `onExit` → `simEntry=null` → 재생 세션 재구축 + **분기 진입이었다면 분기 프레임으로 seek** (ReplayIsland.tsx:438-444, §3-D 결함3 회귀 방지).

## 3. 목표 동작

- `simEntry` 활성 시 **재생 영역이 편집 영역으로 교체**된다: 보드+HUD는 같은 자리(레이아웃 시프트 최소화), 재생 슬라이더(`PlaybackControls`) 자리에 팔레트·도구 UI가 놓인다.
- 규범(規範): fixed 포지셔닝·오버레이 배경(backdrop)·z-index 층·`role="dialog"` 없음 — 같은 문서 흐름 안의 모드 전환이다.
- 편집 모드 중 재생 전용 조작(라운드·플레이어 변경, 리플레이 업로드 등)은 숨김 또는 비활성 — 편집 중 재생 상태가 갈라지는 것을 막는다. 구체 방식은 구현 재량, 판단이 갈리면 QUESTIONS.md로.
- 다음은 **현행 유지**: 종료 시 분기 프레임 복귀·수집함 유지, 버튼 클릭 후 blur(Space 누출 방지 — W4 결함7), 주석 입력 포커스 ↔ `input.suspend()` 배선, rAF `input.tick` 구동.
- 기존 `data-testid` 관측면(`sim-panel` 등)은 유지한다. e2e가 존재·기능을 검증하므로 selector가 깨지면 구현을 먼저 재고하고, 불가피한 e2e 수정은 QUESTIONS.md에 사유를 남긴다.

## 수용 기준 (작업 세션 완료 조건)

- **AW-34 인플레이스 전환**: 시뮬레이터 진입·종료가 오버레이 모달 없이 같은 화면 자리에서 모드 전환된다 — fixed 오버레이·backdrop·dialog 부재, 보드·HUD 배치 유지.
- **AW-35 팔레트 배치**: 편집 모드에서 재생 슬라이더(`PlaybackControls`) 자리에 팔레트 UI가 배치되고, 재생 슬라이더는 편집 중 표시되지 않는다.
- **AW-36 회귀 없음**: 분기 프레임 복귀·포커스(Space 누출 없음)·키 배선·수집 흐름이 새 레이아웃에서 그대로 동작한다 — 기존 e2e(`w4-smoke`·`m3b`·`m5a`·`m5-d-web`) 전부 통과 + 신규 `e2e/m6a.spec.ts`에서 전환·복귀를 실브라우저로 고정.

※ 소유자가 승인한 것만. 여기 없는 기능은 만들지 않는다.
※ AW-34·35는 유닛(가능한 부분) + `e2e/m6a.spec.ts`로, AW-36은 `e2e/m6a.spec.ts`의 회귀 항목으로 테스트 이름에 ID를 명시한다 (`tools/check-acceptance.mjs` 대조).

## 참고자료

- #55 본문(채택 근거) · D-21(팔레트 존재 근거) · apps/web README "조립 계약" 절(포커스·tick·canvas 함정).
- e2e 실행: `pnpm --filter @tetorial/web e2e` — webServer가 `pnpm build → wrangler pages dev` (astro preview는 `_redirects` 미처리).
- 스타일: `styles/tokens.css`·`controls.css` 준용. 새 전역 CSS 파일을 만들지 않는다.
