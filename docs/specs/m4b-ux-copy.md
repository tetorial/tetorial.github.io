# Tetorial 명세: M4-B 문구·입력 UX 축 (@tetorial/web)

> 상태: M4 W4-1 · 관련 모듈: `apps/web`
> 역할: **리플레이 페이지의 gist 입력·읽기 실패 문구·분기 불가 안내를 홈과 일관된 정직한 단일 경로로 만든다** (#43, #44, #45)
> 근거: 마일스톤 경계 감사(2026-07-18), 소유자 채택.

## 1. 경계 / 책임

- `apps/web` 한정. `packages/`·`workers/`·`docs/` 수정 금지.
- ReplayIsland의 구조 분해(C-10, #46)는 **이 웨이브가 아니다** — 다음 웨이브(W4-2)가 수행한다. 여기서는 최소 수정만 한다.

## 2. AW-20 — EmptyState gist 입력 정규화 (#43)

현행: `ReplayIsland.tsx:497-507`이 입력 원문을 그대로 `loadGist`에 전달한다 — 공유 링크 붙여넣기가 실패하고, URL이 갱신되지 않아 새로고침 시 유실된다.

- 홈 `OpenIsland.tsx:35-42`와 동일 의미론으로 통일: `extractGistId`(`handoff.ts:71`) 해석 → 실패 시 인라인 오류 문구(홈과 동일: "공유 링크 또는 gist ID 형식이 올바르지 않습니다.") → 성공 시 `buildDeepLink({ gistId })` 경로형 정규형 URL로 이동(M1d-1 발신 규약).
- 해석→분기 로직을 공용 헬퍼로 `src/lib`에 추출해 OpenIsland·EmptyState 양쪽이 공유한다(중복 제거 + 테스트 지점 확보). 헬퍼 시그니처는 자유이되 "이동 URL 반환 / 오류 문구 반환"의 두 결과가 구분되어야 한다.
- placeholder `"gist ID"` → `"공유 링크 또는 gist ID"` (홈 `OpenIsland.tsx:83`과 통일).

## 3. AW-21 — 읽기 실패 문구 분리 (#44)

현행: `ReplayIsland.tsx:118-122` — `getWorkerClient()` 실패(워커 미설정)를 writes-disabled 503 가짜 입력으로 위장해 "저장 기능이 일시 중지되었습니다"(`errors.ts:39`)가 표기된다. 읽기 경로의 실패인데 저장 문구가 나온다.

- `errors.ts`의 `ErrorInput`에 읽기 경로 전용 변형 `{ source: "worker-unconfigured" }`를 신설하고, 전용 문구 **"리플레이 조회 서비스가 설정되지 않았습니다"**(action: `{ kind: "none" }`)를 `TXT`에 추가한다. §6 표 관습 유지(파일 헤더 주석 참조).
- `ReplayIsland.tsx`의 해당 catch에서 위장 입력 대신 신설 입력을 사용한다.
- `errors.test.ts`(AW-9 표 검증)에 신설 행의 케이스를 추가한다.

## 4. AW-22 — 분기 불가 안내 단일화 (#45)

현행: `ReplayIsland.tsx:339-344`의 `alert()`가 사전 차단하므로 `SimulatorPanel.tsx:106-113`의 sim-blocked 화면은 도달 불가(사어)다.

- `alert()` 제거. `captureBranch` 실패 시 화면 내 인라인 안내(BranchBar 인근, 기존 스타일 재사용)로 사유를 표기한다. 다른 조작(재생 이동 등) 시 안내는 사라지거나 갱신되면 된다 — 모달 금지.
- `SimEntry`(`SimulatorPanel.tsx:25-26`)의 `branch` 필드 타입을 성공 변형으로 좁혀, 실패가 SimulatorPanel에 도달할 수 없음을 타입으로 고정한다.
- sim-blocked 분기(:106-113) 삭제. `data-testid="sim-blocked"`는 E2E에서 참조되지 않음이 확인됐다(2026-07-18).

## 수용 기준 (작업 세션 완료 조건)

- **AW-20 gist 입력 정규화**: 공용 해석 헬퍼가 경로형 공유 링크·gist URL·순수 id → 정규형 이동 URL, 형식 오류 → 홈과 동일한 오류 문구를 반환함을 테스트. EmptyState·OpenIsland 양쪽이 이 헬퍼를 사용한다(배선은 게이트 11항 실조작으로 확인).
- **AW-21 읽기 실패 문구 분리**: `worker-unconfigured` 입력이 writes-disabled와 구분되는 전용 문구·action을 반환함을 `errors.test.ts` 표 검증에 추가.
- **AW-22 분기 안내 단일화** [문서]: `alert(` 저장소 내 참조 0 · sim-blocked 분기 삭제 · `SimEntry.branch` 성공 변형 좁힘 — 타입체크·grep으로 게이트 검사, 인라인 안내 동작은 게이트 11항 실조작으로 확인.

## 참고자료

- #43 · #44 · #45 (감사 산출 2026-07-18, 소유자 채택)
- #43은 링크 공유 개시(D-20 따름정리 — 소유자의 첫 공유 행위)와 직결된다. 홈과 문구·의미론이 어긋나면 안 된다.
- M1d-1 — 경로형 정규형 발신 규약. 구형 `?gist=` 해석은 제거됨(`handoff.ts:70` 주석).
- `errors.ts` 헤더 주석 — apps-web §6 표 관습(AW-9가 전 행 분기 검증).
