# Tetorial 명세: M4-C ReplayIsland 분해 축 (@tetorial/web)

> 상태: M4 W4-2 · 관련 모듈: `apps/web`
> 역할: **ReplayIsland.tsx(1,050줄)를 하위 컴포넌트 파일로 분해하고, 5중 복제된 공통 CSS를 전역 시트로 승격하며, 라운드 번호 손계산을 헬퍼로 단일화한다** (#46, #47, #48)
> 근거: 마일스톤 경계 감사(2026-07-18), 소유자 채택. 줄 번호는 W4-1 머지 후 main(`1939430`) 기준.

## 1. 경계 / 책임

- `apps/web` 한정. `packages/`·`workers/`·`docs/` 수정 금지.
- **동작 불변 리팩터링이다.** 사용자 가시 동작·문구·마크업 의미(testid 포함)를 바꾸지 않는다. 유일한 의도된 가시 변화는 §3의 버튼 padding 통일뿐이다.
- 기존 테스트·E2E는 수정 없이 통과해야 한다(테스트가 깨지면 리팩터링이 동작을 바꾼 것이다). 예외: import 경로 수정만 허용.

## 2. AW-23 — 파일 분해 (#46)

현행 `ReplayIsland.tsx`의 하위 컴포넌트 11개(:485 EmptyState · :532 ErrorState · :545 RoundPlayerSelect · :593 SupportBadge · :607 PlaybackControls · :675 PlaybackStats · :709 BranchBar · :751 Sidebar · :781 CollectedNotesBar · :827 ShareBanner · :850 UploadPanel, + :823 formatKB)를 `apps/web/src/components/replay/` 하위 파일로 이동한다.

- 파일 묶음 단위는 세션 재량(응집 기준 예: UploadPanel+ShareBanner+formatKB / PlaybackControls+PlaybackStats / RoundPlayerSelect+SupportBadge / Sidebar+CollectedNotesBar / EmptyState+ErrorState / BranchBar). **UploadPanel 분리는 필수**(#46 명시 1순위).
- 분해 후 `ReplayIsland.tsx`에는 오케스트레이션(상태·핸들러·조립 JSX)만 남긴다. **목표 상한 400줄.**
- props 시그니처는 이동 과정에서 필요한 최소 변경(export 추가)만 한다. 새 props·새 동작 금지.

## 3. AW-24 — 공통 CSS 전역 승격 (#48)

현행: `.btn` 정의가 5개 컴포넌트(ReplayIsland·SimulatorPanel·NoteViewer·OpenIsland·SettingsPanel)의 인라인 STYLES에 복제되어 있고 padding이 갈라졌다(space-3: ReplayIsland·SimulatorPanel·NoteViewer / space-4: OpenIsland·SettingsPanel).

- `apps/web/src/styles/controls.css`를 신설해 공통 조각(`.btn`, 공용 입력·폼 행, 공용 hint 등 — 5곳 중 2곳 이상 중복된 것)을 승격하고, `Layout.astro`의 `tokens.css` 임포트(:6) 옆에 임포트를 추가한다.
- 규범(規範): **padding은 space-3으로 통일한다**(다수파 3곳 기준). OpenIsland·SettingsPanel 버튼이 약간 작아지는 가시 변화는 의도된 것이다 — 게이트 11항에서 실화면 확인.
- 각 컴포넌트 STYLES에서 승격된 조각을 제거한다. 컴포넌트 고유 레이아웃 스타일은 해당 컴포넌트에 잔류한다(전부 옮기는 것이 목적이 아니다 — 중복 제거가 목적).
- 분해된 하위 컴포넌트(§2)의 고유 스타일은 ReplayIsland의 STYLES에 남겨도 되고 각 파일로 동반 이동해도 된다. 단 동반 이동 시 조건부 렌더 컴포넌트의 `<style>` 누락으로 스타일이 사라지는 함정에 주의 — 이동했으면 게이트 11항에서 각 화면을 실확인한다.

## 4. AW-25 — originalRound 헬퍼 단일화 (#47)

현행: `open-replay.ts:100` `originalRound(loaded, docRoundIndex)` 헬퍼가 있는데 `ReplayIsland.tsx:293`, `:570`(RoundPlayerSelect), `:923`(UploadPanel)이 각자 `roundMap[i] ?? i`를 손계산한다.

- 표시 라운드 번호 계산을 헬퍼 경유로 단일화한다. 하위 컴포넌트가 `LoadedReplay` 전체를 받지 않도록 시그니처를 `roundMap` 기반으로 조정(오버로드 또는 교체)하는 것은 허용 — 단 기존 호출(`open-replay.ts:111`) 포함 전 호출처가 한 경로를 쓴다.
- 완료 후 `apps/web/src`에서 `roundMap[` 직접 인덱싱은 헬퍼 내부 1곳만 남는다.

## 수용 기준 (작업 세션 완료 조건)

- **AW-23 파일 분해** [문서]: 하위 컴포넌트가 `components/replay/`로 분리되고 `ReplayIsland.tsx` ≤ 400줄, 기존 테스트·E2E 무수정 통과 — 게이트에서 줄 수·diff 검사 + 11항 실조작.
- **AW-24 공통 CSS 승격** [문서]: `controls.css` 신설·임포트, 컴포넌트 STYLES 내 `.btn` 정의 0(grep), padding space-3 통일 — 게이트 11항 실화면 확인.
- **AW-25 originalRound 단일화**: 헬퍼가 roundMap 부재·희소 인덱스에서 fallback(`?? i`) 동등 동작함을 테스트로 고정하고, `roundMap[` 직접 인덱싱이 헬퍼 내부 외 0곳(grep — 게이트 병행 검사).

## 참고자료

- #46 · #47 · #48 (감사 산출 2026-07-18, 소유자 채택)
- W4-1(머지 `865015c`·`68000da`)이 이 파일들을 수정했다 — 감사 문서의 구 줄 번호와 다르니 본 명세의 줄 번호를 따를 것.
- E2E는 `pnpm --filter @tetorial/web e2e` (wrangler pages dev 서빙 — dev-env.md 참조, 워크트리에서 `pnpm install` 선행 필요).
