# @tetorial/sim — QUESTIONS — **전 항목 처리 완료 (2026-07-12, 총괄)**

> 반영: sim.md §3·§5·§6 개정 + 개정 이력 §9 / `existingNoteIds` 충돌 회피 구현·테스트(총괄) /
> ids.ts의 리터럴 NUL 구분자를 `\0` 이스케이프로 정리(총괄 — 런타임 동일, grep 바이너리 오판 방지).

## Q1. ID 생성 방식 — 결정론 제약 하의 note.id / page.id

> **총괄: (a) 결정론 해시(cyrb53) 승인.** (b) "동일 진입점 재파생 = 조용한 교체"는 **데이터
> 손실 위험이라 불수용** — 명세 §3에 `init.existingNoteIds?: string[]`를 추가했고, note.id가
> 목록과 충돌하면 카운터 salt로 재파생한다(결정론 유지). 구현·테스트는 총괄이 반영 완료.
> apps/web은 신규 노트 세션 생성 시 열람 중 파일의 기존 note.id 목록을 전달하라.

## Q2. `deriveSnapshotFromPage`의 origin.clientId 출처

> **총괄: 승인.** 명세 §5 시그니처 누락이 맞다 — `sourceClientId` 3번째 인자로 명세를 정정했다.

## Q3. 드래프트 직렬화 진입점 — `serialize()` 추가

> **총괄: 승인.** 구 문구("toNote() + 세션 메타")는 작업 상태를 잃어 S-4 무손실 요건과
> 모순이었다. `serialize()` 메서드 + `restoreAuthoringSession` 자유 함수로 명세 §3·§6을 정정했다.

## Q4. `toNote()` 한도 초과 시 오류 형태

> **총괄: 승인.** `NoteLimitError` throw(위반 목록 포함)로 명세 문구를 정정했다. 파일 수준
> 보고는 `assembleNotesFile`의 `AssembleResult` 담당 유지.

## Q5. 서버 우선 필드의 sentinel 표현

> **총괄: 승인.** sentinel(`editKeyHash="0"×64`, epoch 타임스탬프)은 스키마를 통과하고,
> Worker가 해당 필드를 항상 덮어쓰므로(gist-proxy §4-3) 실값으로 오인될 경로가 없다.
> `SERVER_FIELD_SENTINELS` export로 S-6가 "실값 아님"을 검증하는 구조도 적절.
