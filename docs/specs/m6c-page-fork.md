# Tetorial 명세: 노트 페이지에서 시뮬레이터 fork 진입 (M6-C, @tetorial/web)

> 상태: 작업 중 · 관련 모듈: apps/web (단독) — `@tetorial/sim`의 기존 API를 소비만 한다
> 역할: **노트 페이지에서 "이 페이지에서 시뮬레이션"으로 진입한다 — 스냅샷 복사 진입(D-8), 원본 노트 무수정.**
> 근거: #58 (M5 경계 감사에서 소비자 없는 선행 구현으로 확인 → 배선 승격). D-8(fork는 참조가 아니라 복사)의 이행.

## 1. 경계 / 책임

- 수정 범위는 **apps/web뿐**이다. `@tetorial/sim`의 `deriveSnapshotFromPage`를 **현 형상 그대로 소비**한다 — sim 수정이 필요하다고 판단되면 수정하지 말고 QUESTIONS.md에 근거를 적고 보류하라(형상 개정은 총괄 소관, #58).
- 원본 노트는 절대 수정되지 않는다(D-3·D-8). fork는 항상 **새 노트**의 시작이다.
- 스키마·딥링크 무관 — `origin`은 derive가 돌려주는 값(원본 리플레이 좌표의 복사)을 그대로 쓴다.

## 2. 현행 구조 (출발점)

- `deriveSnapshotFromPage(note, pageId)` → `{ snapshot, origin } | { error: "queue-exhausted" }` (`@tetorial/sim` 공개 API, 테스트 완비, 소비자 없음).
- `NoteViewer`는 페이지를 prev/next로 넘기며 열람하고, **내 노트일 때만** `onEdit`("이어서 편집" — 같은 id upsert)을 노출한다.
- 시뮬레이터 진입은 `SimEntry`(`branch` | `existing`)로 `ReplayIsland`가 관장하며, M6-A의 인플레이스 전환·노트 생성 한도 차단(`note-limit`)·수집함 흐름이 이미 있다.

## 3. 목표 동작

- `NoteViewer`의 각 페이지 화면에 **"이 페이지에서 시뮬레이션"** 진입을 추가한다. **내 노트·타인 노트 모두** 가능하다 — 타인 노트에서 시작하는 것이 fork의 본질이다(D-8). "이어서 편집"(내 노트 한정, 같은 id)과는 별개 동작으로 공존한다.
- 진입 시 `deriveSnapshotFromPage` 결과로 **새 노트** 저작 세션을 연다: 신규 노트 id(웹이 CSPRNG로 생성해 주입 — D-20), origin은 derive 반환값. `SimEntry` 확장 방식은 구현 재량.
- 규범(規範) — **한도·수집 흐름 동일**: 새 노트 생성이므로 노트 생성 한도 차단(`note-limit`)이 분기 진입과 동일하게 적용된다. 완성된 노트는 같은 수집함 → 묶음 업로드 경로를 탄다(M3-B 흐름 무변경).
- `{ error: "queue-exhausted" }`면 **인라인 안내**로 소화한다(alert·모달 금지 — AW-22 관행). 안내 후 뷰어는 정상 유지.
- 편집 모드 전환·종료는 M6-A 인플레이스 규칙을 따른다. fork 진입은 분기 진입이 아니므로 종료 시 "분기 프레임 복귀" 의무는 없다 — 종료 후 화면 상태는 진입 전 재생 상태로 돌아가면 된다(구현 재량, 모호하면 QUESTIONS).

## 수용 기준 (작업 세션 완료 조건)

- **AW-41 페이지 fork 진입**: 노트 페이지(내·타인 모두)에서 "이 페이지에서 시뮬레이션"으로 새 노트 저작 세션이 열린다 — 스냅샷·origin은 복사(원본 노트 무수정, D-8), queue-exhausted면 인라인 안내, 노트 생성 한도 차단 적용.

※ 소유자가 승인한 것만. 여기 없는 기능은 만들지 않는다.
※ 유닛(진입 매핑·한도·오류 분기) + `e2e/m6c-fork.spec.ts`(실브라우저 진입·안내) — 테스트 이름에 ID 명시(`tools/check-acceptance.mjs` 대조).

## 참고자료

- #58 본문 · D-3·D-8(복사 의미론) · D-20(노트 id는 웹이 CSPRNG 값 주입 — sim은 CSPRNG 불가침).
- `packages/sim/src/derive.ts`(대상 API) · `lib/note-limit.ts`(한도) · `lib/simulator.ts`(`createSimulator` 진입 파라미터).
