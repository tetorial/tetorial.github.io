# Tetorial 명세: 시뮬레이터 셀 팔레트·포인터 도구 (@tetorial/web)

> 상태: M5 W5-2b (#54 U-7의 web 축, 마지막) · 관련 모듈: **apps/web 단독**
> 역할: **셀 도구를 팔레트(G·D·미노 7종)로 개편하고, 호버 고스트·우클릭 지우기·휠클릭 스포이드를 배선한다.**
>
> 전제 (main 머지 완료, `2b91fe0`):
> - sim: `Tool = { kind:"cell"; v } | { kind:"erase" } | { kind:"highlight"; force?:"on"|"off" }` — 하이라이트는 토글(S-10), `force:"off"`가 우클릭 지우기용.
> - renderer: 하이라이트는 흰색 외곽선(RD-8·9). `DEFAULT_THEME.cell`에 G·D·7미노 색이 있다.
> - 현행: `SimulatorPanel.tsx`의 도구줄이 cell/erase/highlight 3버튼, cell은 `v:"G"` 하드코딩. `BoardCanvas.tsx`의 `onCellPointer(cell, phase)`는 버튼 구분이 없다.

## 1. 경계 / 책임

- 수정 범위는 **apps/web뿐이다.** `packages/*` 수정 금지 — 필요한 sim·renderer 표면은 전부 이미 main에 있다. 부족해 보이면 QUESTIONS.md.
- 대상: `SimulatorPanel`(도구줄·팔레트), `BoardCanvas`(포인터 확장), 신규 계산부 `lib/palette.ts`(가칭).
- 하지 않는 것: 비모달 전환(#55) · HUD 변경 · 페이지/노트/업로드 로직 · 모바일 저작 UI(#31).

## 2. 셀 팔레트 (AW-30)

- cell 도구 선택 시 팔레트 노출: **G · D · I · J · L · O · S · T · Z** 9종.
- 항목은 `DEFAULT_THEME.cell`(@tetorial/renderer 공개 export) 색의 스와치로 표시(미노를 PiecePreview 아이콘으로 하는 것은 재량). 선택 상태는 `aria-pressed` + `data-cell` 속성으로 관측 가능하게.
- 선택값이 스트로크의 `Tool { kind:"cell", v }`로 들어간다 — **`v:"G"` 하드코딩 제거.**
- 기본 선택은 `G`(현행 동작 보존). erase/highlight 도구 선택 시 팔레트는 숨김 또는 비활성(재량).

## 3. 고스트 프리뷰 (AW-31) — 규범(規範)

- cell 도구에서 보드 호버 시, 커서가 있는 셀 위치에 **선택 셀 색의 반투명 프리뷰**(알파 0.4~0.6)를 표시한다.
- 구현 규범: 캔버스 위 **DOM 오버레이**. 위치는 CSS px 스냅 — `left = floor(offsetX / cellSize) * cellSize`, `top` 동일 계산. 셀 유효성은 기존 `hitTest` 결과로 판정(null → 숨김). **renderer 내부 기하(버퍼 행·y 뒤집기)를 웹에 복제하지 마라** — 스냅은 격자 원점 정렬(히트테스트와 동일 가정)만 쓴다.
- 포인터가 캔버스를 벗어나면 숨긴다. erase/highlight 도구에서는 표시하지 않는다.
- 색은 `DEFAULT_THEME.cell[선택값]` 재사용. 고스트는 `pointer-events: none`.

## 4. 우클릭 지우기 (AW-32) — 규범(規範)

- 캔버스 우클릭(button 2) 누름~드래그 = **지우기 스트로크**:
  - cell·erase 도구 → `beginStroke({ kind: "erase" })`
  - highlight 도구 → `beginStroke({ kind: "highlight", force: "off" })`
- 캔버스 한정으로 `contextmenu` 기본 동작을 차단한다.
- 좌클릭 동작 불변: cell = 팔레트 선택값 그리기 / erase = 지우기 / highlight = 토글(S-10).
- 좌·우 버튼이 동시에 눌리는 경우 먼저 시작된 스트로크가 이긴다(나중 버튼 무시 — 재량 폭 없음).

## 5. 휠클릭 스포이드 (AW-33) — 규범(規範)

- 캔버스 휠클릭(button 1) = 스포이드: 커서 셀의 보드 값 `WorkView.board[y][x]`를 읽어
  - `"G"`·`"D"`·미노 7종이면 → 팔레트 선택을 그 값으로 바꾸고 **도구를 cell로 전환**한다.
  - `"_"`(빈 칸)이면 → 아무 일도 하지 않는다(선택·도구 유지).
- 스포이드는 스트로크·언두를 만들지 않는다.
- 캔버스 한정으로 중클릭 기본 동작(auxclick 자동 스크롤)을 차단한다.

## 6. BoardCanvas 확장

- `onCellPointer`에 버튼 정보를 전달하도록 확장한다(phase 확장 또는 button 인자 — 내부 계약, 재량). `pointerleave` 통지 추가(고스트 숨김용).
- 기존 좌클릭 그리기·dpr 히트테스트(w4 결함6 회귀 테스트 존재)를 깨지 마라.

## 수용 기준 (작업 세션 완료 조건)

- **AW-30 셀 팔레트**: G·D·미노 7종 노출, 선택 셀로 그리기 (`v:"G"` 하드코딩 제거) — 계산부: 팔레트 항목 목록·선택→Tool 매핑. e2e: 팔레트 선택 후 그리기 결과 관측
- **AW-31 고스트 프리뷰**: 보드 호버 시 선택 셀이 그려질 위치를 미리 표시 — 계산부: CSS px 스냅 계산. e2e: hover 시 고스트 표시·이탈 시 숨김
- **AW-32 우클릭 지우기**: 현재 도구 기준 지우기 + 브라우저 컨텍스트메뉴 차단 — 계산부: (도구, 버튼)→스트로크 Tool 매핑(highlight→force:"off" 포함). e2e: 우클릭 드래그로 셀 삭제·컨텍스트메뉴 미출현
- **AW-33 휠클릭 스포이드**: 커서 위치의 셀로 팔레트 선택 변경 — 계산부: 셀 값→선택/무시 판정("_" 무시·도구 전환 포함). e2e: 중클릭 후 팔레트 선택 상태 관측

## 참고자료

- #54 (U-7) — 이슈 본문 · D-21 (저작 UI 구현 확정)
- m3b·m5a 선례: 계산부(lib) vitest + data 속성 관측 + e2e 패턴
- `apps/web/e2e/w4-smoke.spec.ts` 결함6 (dpr 히트테스트 회귀 테스트)
