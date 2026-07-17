# QUESTIONS — M4-C ReplayIsland 분해 (m4/c-replayisland-split)

작업 중 발견한 명세 간 긴장·현행 기이점의 기록이다(conventions §5.3). 구현은 명세의 규범
(AW-24 grep 기준 등)이 강제하는 방향으로 진행했고, 보류가 아닌 항목은 게이트 판단용 보고다.

## Q1. AW-23 줄 수 목표(≤400) 미달 — 473줄 [판단 요청]

하위 컴포넌트 11개 + formatKB를 전부 `components/replay/`로 이동하고 STYLES·임포트를
정리한 뒤에도 `ReplayIsland.tsx`는 **473줄**이다. 남은 것은 명세 §2가 잔류를 명시한
오케스트레이션뿐이다(상태 선언 ~40 · 핸들러 ~160 · 조립 JSX ~210 · 아일랜드 자신의
스타일 ~35 · 임포트 ~45 — 주석 포함).

400줄 달성 경로는 핸들러·상태를 별도 훅 파일로 빼는 것뿐인데, 이는 §2 "오케스트레이션
(상태·핸들러·조립 JSX)만 남긴다"와 충돌하고 "새 props 금지" 하에서 컴포넌트 재편으로도
불가하다. **임의로 훅 분리를 하지 않고 473줄에서 멈췄다** — 400 상한을 고수할지, 분해
완료(하위 컴포넌트 0개 잔류)로 갈음할지 게이트 판단을 요청한다.

## Q2. 전역 승격의 파생 가시 변화 — empty/error 화면·disabled 버튼 [보고]

현행 기이점: ReplayIsland의 `<style>{STYLES}</style>`는 **loaded 분기에만** 렌더되어,
empty/error/loading 화면은 지금도 `.empty`·`.error-state`·`.btn` 등 규칙이 전혀 적용되지
않은 채(토큰 기본값만) 표시된다. AW-24가 요구하는 전역 승격(controls.css)은 head에서
로드되므로 다음 파생 가시 변화가 **불가피하게** 생긴다(패딩 통일 외):

- `/replay` empty/error 화면의 버튼(`.btn`)·gist 입력(`.gist-row input`)이 스타일을 얻는다
  (기존: 브라우저 기본 모양).
- `.btn:disabled { opacity: 0.5 }`(SimulatorPanel·NoteViewer 2곳 복제 → grep 기준상 승격
  필수)가 전역화되어, 리플레이 화면의 분기 버튼 등 disabled 버튼이 **모달이 안 열려 있어도**
  반투명해진다(기존: 모달이 열린 동안에만 전역 누수로 적용되던 비일관 동작의 통일).

반대로 `.empty` 등 레이아웃 규칙은 **동반 이동하지 않고** ReplayIsland STYLES에 사문(死文)
그대로 잔류시켜 empty/error 화면의 무스타일 현행을 보존했다. 이 화면들을 제대로 입히는
것은 별도 결정 사안으로 남긴다.

## Q3. AW-25 grep 기준과 기존 테스트 [보고]

`apps/web/src` 내 `roundMap[` 직접 인덱싱은 헬퍼 내부 1곳 외에
`open-replay.test.ts:158-159`(기존 AW-4 테스트의 기대값 비교)가 남는다. 기존 테스트는
수정 금지(명세 §1)라 그대로 두었다 — 표시 라운드 **계산 경로**는 전부 헬퍼 단일화 완료.

## Q4. 입력·폼 행 승격 범위 [보고]

"공용 입력·폼 행"은 선언 블록이 동일한 복제(ReplayIsland `select, .gist-row input` ↔
UploadPanel `.um-field input`)만 통합 승격했다. OpenIsland `.gist-row input`(padding·flex
상이)·SettingsPanel `input[type="number"]`(width 상이)·SimulatorPanel `textarea`는 선언이
갈라져 있어 승격 시 마크업 변경 또는 미승인 가시 변화 없이는 통합 불가 — 각 컴포넌트에
잔류시켰다(명세 §3 "중복 제거가 목적" 기준).
