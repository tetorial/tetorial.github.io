# apps/web — QUESTIONS — **전 항목 처리 완료 (2026-07-12, 총괄)**

> 반영: notes-schema §9·결정 로그 8 / conventions §2 / 루트 eslint ignores / handover §3 갱신.

## Q1. 딥링크 noteId 정규화 형식 `note=<clientId>.<noteId>` 채택 여부

- 구현: 기본형 수용 + 충돌 후보 목록 + 정규형 관용 파싱, 링크 생성은 정규형.
> **총괄: 정규형을 v1 규범으로 승격 (재론 가능).** 구현이 채택한 형태 그대로 notes §9를
> 개정했다 — 생성 링크는 항상 `note=<clientId>.<noteId>`, 수신은 비한정형도 관용 수용 +
> 충돌 시 후보 목록. 미결 항목(handover §3-2, decisions 미결)도 해소. W3 착수 전 확정
> 예정이었으나 총괄이 놓친 항목을 구현이 전방 호환으로 잘 흡수했다.

## Q2. apps/web의 zod 런타임 의존성

- 처리: specs > conventions 우선순위에 따라 zod 추가.
> **총괄: 승인.** 우선순위 규약 적용이 정확하다. conventions §2 승인 목록에
> "zod(apps/web — 응답 검증)"를 추가해 문서 정합을 맞췄다.

## Q3. 루트 eslint ignores (빌드 산출물)

> **총괄: 수행 완료.** 루트 eslint.config.js ignores에 `apps/web/dist/`·`.astro/`·
> `playwright-report/`·`test-results/` 추가.

## Q4. pnpm-lock.yaml 갱신

> **총괄: 이미 해소.** lock은 W3 커밋(f01388b)에 포함돼 있었다(루트 .gitignore는 lock을
> 제외하지 않는다). 버전 고정 근거(Node 22.11 → astro 5.18.2)는 dev-env.md와 정합 — 승인.

## 참고 메모 (EngineControls 어댑터, Playwright 브라우저 설치)

> **총괄: 확인.** `currentPiece` 어댑터 구성은 패키지 무변경 조립로 적절. Playwright 설치
> 선행 요건은 dev-env 성격 — 배포 스모크 후 아카이브 시점에 dev-env.md에 1줄 반영 예정.
