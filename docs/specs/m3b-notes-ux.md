# Tetorial 명세: 노트 UX 정상화 (@tetorial/web) — M3-B

> 상태: M3-B 웨이브 · 관련 모듈: `apps/web` 단독
> 역할: **노트의 수집→묶음 업로드 흐름 재설계 + 열람·재편집 배선 + Next·Hold 그래픽** (#36 #37 #38 #39)
> 실증 근거: 2026-07-17 소유자 스모크 실측(#36 #37) · 소유자 원 의도 전달(#38 본문) · 코드 실태는 각 이슈에 파일:줄로 기록됨

## 1. 경계 / 책임

- 수정 범위: `apps/web`만. `packages/*`·`workers/*` 무수정 — 필요한 API는 전부 이미 존재한다:
  - 열람: `createViewerSession` (`@tetorial/sim`) — 웹 import 0건, 배선만 하면 됨
  - 재편집: `createSimulator({ init: { existing } })` 경로 (`apps/web/src/lib/simulator.ts`) — 호출 UI 0곳
  - 프리뷰: `renderThumbnail`·`renderPiecePreview` (`@tetorial/renderer`, RD-4 테스트 존재)
  - 한도: `note-limit.ts`·`NoteLimitError`·`assembleNotesFile` violations
  - 패키지 API가 부족하면 임의 확장 금지 — `QUESTIONS.md`에 기록하고 보류.
- 와이어 포맷·Worker 계약 무변경: 업로드는 지금처럼 클라이언트 파일(NotesFile) 재조립 후 `PUT /g/:id/notes` 1회.
- 기존 수용 기준 테스트(AW-1~10) green 유지. localStorage는 storage 유틸 경유, 링크·에셋은 base path 헬퍼 경유(기존 규칙).

## 2. 업로드 흐름 재설계 (#38 — AW-15·16·17)

- **시뮬레이터 안(SimulatorPanel)**: 노트 단위 업로드 버튼 제거. "노트 완성" 액션은 `session.toNote()`로 노트를 확정해 **메모리 수집함**에 추가한다. 노트 단위 한도 위반(`NoteLimitError`)은 이 시점에 표시.
- **수집함**: 리플레이(gistId) 단위, 메모리 전용. 재편집 노트(§4)도 같은 수집함 경유 — 업로드 경로는 하나다.
- **시뮬레이터 밖(ReplayIsland 영역)**: 수집된 노트 목록(최소: 개수·식별 가능한 표시)과 업로드 액션. 수집 노트 전부를 자기 클라이언트 파일 하나로 조립(순차 upsert)해 **단일 PUT**. 조립·상태 로직은 lib 함수로 추출해 테스트한다.
- **한도 사전 검사(AW-17)**: 합산 한도(리플레이 총량 등 — M2E에서 Worker가 교차 검사하는 것과 동일 기준) 위반은 PUT 전에 차단하고 위반 내용을 표시한다.
- **이탈 보호**: 미업로드 수집 노트가 있는 상태의 페이지 이탈 시 **경고만** (beforeunload). 수집함의 localStorage 영속화는 하지 않는다 — 소유자 결정(2026-07-17). 기존 드래프트 핸드오프(`handoff.ts`·`restoreSimulator`)와의 접점은 현행 동작 유지가 원칙, 충돌 발견 시 QUESTIONS.md.

## 3. 업로드 후 반영 (#36 — AW-11)

- `putNotes` 성공 응답(`index`·`file`)을 열람 상태(`loaded.notesFiles`)에 반영해 **재로드 없이** 사이드바 갱신.
- 성공 문구는 실제 일어난 일만 서술한다 — 현행 "사이드바가 갱신되었습니다" 거짓 표기(`SimulatorPanel.tsx:133`) 제거.

## 4. 노트 열람·재편집 (#37 — AW-12·13·14)

- **열람(AW-12)**: 사이드바에서 노트 선택 → `createViewerSession` 기반 **보드 렌더 포함 뷰어**(BoardCanvas 재사용)로 페이지를 prev/next 이동하며 열람. 기존 메타 전용 모달(`ViewerModal`)을 대체한다. 주석 텍스트는 페이지와 함께 표시.
- **재편집(AW-13)**: isMine 노트에 "이어서 편집" 진입 → `createSimulator({ existing })`. 편집 결과는 §2 수집함 경유로 업로드. 타인 노트는 편집 진입 UI 없음(열람 전용). fork UI는 범위 밖(소유자 확인, 2026-07-17).
- **권한 실패(AW-14)**: editKey 불일치(403) 시 `errors.toDisplayError` 매핑으로 명확한 오류 표기. 스모크 "시크릿 403" 항목이 검증 가능해져야 한다.

## 5. Next·Hold 그래픽 (#39 — AW-18)

- 텍스트 표기 2곳(`SimulatorPanel` PieceBar · `ReplayIsland` PlaybackStats)을 renderer 프리뷰 API 배선으로 교체.
- 표시 계산부(넥스트 슬라이스·프리뷰 입력 매핑)는 lib 함수로 추출해 테스트. 시각 확인은 게이트 11.

## 6. 테스트 전략

- 상태 머신·조립·매핑 로직은 `apps/web/src/lib`에 두고 unit test — 기존 AW 패턴 그대로. 아일랜드 컴포넌트는 얇게 유지.
- UI 시각·실조작 검증은 게이트 11(총괄 `astro preview` 실조작)이 담당한다.

## 수용 기준 (작업 세션 완료 조건)

- **AW-11 업로드 즉시 반영**: 노트 업로드 성공 시 페이지 재로드 없이 사이드바에 반영되고, 성공 문구는 실제 일어난 일만 표기
- **AW-12 노트 보드 뷰어**: 사이드바에서 노트 선택 시 보드 렌더 포함 뷰어로 페이지를 넘기며 열람 (기존 메타 모달 대체, `createViewerSession` 배선)
- **AW-13 내 노트 이어서 편집**: 내 노트(isMine)에서 편집 진입 → 기존 페이지 로드·수정·재업로드 (`existing` 경로 배선). 타인 노트는 열람 전용
- **AW-14 권한 실패 정직 표기**: 시크릿 불일치(403) 시 명확한 오류 문구
- **AW-15 노트는 메모리 수집**: 시뮬레이터 안에서는 노트 완성 시 메모리에 저장만 하고 업로드하지 않음 (기존 노트 단위 업로드 버튼 제거). 미업로드 수집 노트가 있는 이탈 시 경고만 — 영속화 없음
- **AW-16 묶음 업로드**: 시뮬레이터 밖에서 수집된 노트들을 한 번에 업로드 (수집 노트 전부를 파일 하나로 조립해 단일 PUT — 스키마·Worker 무변경)
- **AW-17 한도 사전 검사**: maxNotesPerReplay 등 한도 초과분은 업로드 전에 경고·차단 (M2E Worker 교차 검사와 정합)
- **AW-18 Next·Hold 그래픽 렌더**: 시뮬레이터·재생 화면 2곳의 텍스트 표기를 renderer 프리뷰 API(RD-4) 배선으로 교체 — 계산부 lib 테스트

## 참고자료

- 이슈: #36(A-7) #37(A-8) #38(A-9) #39(U-4) — 코드 실태 파일:줄 인용 포함
- `docs/DECISIONS.md`: D-3(오답노트 — 원본 불변, 노트만 편집) · D-8(fork는 복사 — 이번 범위 밖) · D-20(딥링크 — 링크 형식 변경 금지)
- 한도의 유일 출처: `@tetorial/types` (WORKFLOW §4 — 숫자를 명세에 복사하지 않는다)
