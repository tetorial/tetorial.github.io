# Tetorial 명세: M4-A 드래프트 영속 사슬 제거 (@tetorial/sim + @tetorial/web)

> 상태: M4 W4-1 · 관련 모듈: `packages/sim`, `apps/web`
> 역할: **프로덕션 호출자 0인 드래프트 직렬화·영속 사슬 전체를 제거한다** (#42, #49)
> 근거: 마일스톤 경계 감사(2026-07-18), 소유자 채택 — 판정 "버린다". sim 공개 API 축소는 이 명세(=#42 채택)가 승인 근거다(conventions §2).

## 1. 경계 / 책임

- 이 웨이브는 **예외적으로 두 영역을 횡단한다**: `packages/sim` + `apps/web/src/lib` (+ 각 대응 테스트·README). 총괄 승인됨.
- **하지 않는 것**: 새 기능·새 공개 API 없음 — 제거 전용 웨이브다. 수집함은 메모리 전용(소유자 결정 2026-07-17)을 유지하며, 어떤 형태의 영속화도 재도입하지 않는다. `docs/`·`packages/types` 수정 금지 — D-20 근거문 갱신은 총괄이 증류 단계에서 수행한다.

## 2. 제거 대상 (전량 열거 — 이 목록 밖은 §3)

### packages/sim

- `src/authoring.ts` — `SerializedDraft` 인터페이스(:31) · `AuthoringSession.serialize()` 메서드 선언(:71) · 구현(:346) · `restoreAuthoringSession()`(:422) · 그 직전의 사멸 주석(:421, 존재하지 않는 "QUESTIONS.md Q3" 인용 — #49는 이 삭제로 함께 해소된다)
- `src/index.ts` — 위 심볼들의 export(:6, :13)
- `src/draft.test.ts` — 파일 전체 (검증 대상이 소멸)
- `src/overlays.test.ts:33` 부근 — `restoreAuthoringSession(s.serialize())` 왕복 케이스. 직렬화 왕복 자체가 검증 대상이면 삭제, overlays 동작 검증이 목적이면 직렬화 없이 재작성.
- `README.md` — `restoreAuthoringSession` 표 행(:13) · localStorage 드래프트 예시(:80-82)

### apps/web

- `src/lib/simulator.ts` — `restoreSimulator()`(:76~) + `SerializedDraft` 임포트
- `src/lib/simulator.test.ts:99-108` — 드래프트 복원 케이스
- `src/lib/storage.ts` — `K.draft` 키(:20) · `getDraft`/`setDraft`/`clearDraft`(:147-155)
- `src/lib/storage.test.ts` — draft 케이스(:51-67 부근) + 헤더 주석(:4)의 "draft 수명주기" 서술 갱신
- `README.md:88` — `restoreSimulator` 언급 문장 갱신

## 3. 규범(規範) — 동명이인 함정

- `packages/sim/src/overlays.ts:52`의 `serialize(): string[]`(하이라이트 오버레이 직렬화)와 `work.ts:36,46`의 `overlay.serialize()` 호출은 **드래프트 사슬과 무관하다. 유지한다.**
- 제거는 §2 목록 한정. grep에 걸리는 그 밖의 `draft`·`serialize` 문자열은 임의 판단하지 말고 `QUESTIONS.md`에 기록 후 보류.
- 기존 테스트에서 도려내는 것은 드래프트 관련 케이스뿐이다. 같은 파일의 다른 수용 기준 ID(AW-6/7/8 등) 테스트 오삭제 금지.

## 수용 기준 (작업 세션 완료 조건)

- **S-9 드래프트 API 소멸**: `@tetorial/sim` 공개 표면에 `serialize`·`restoreAuthoringSession`·`SerializedDraft`가 없음을 테스트로 고정 — index export 부재 + `createAuthoringSession()` 인스턴스에 대해 `"serialize" in session === false`.
- **AW-19 웹 드래프트 잔재 소멸**: storage 공개 표면에서 `getDraft`/`setDraft`/`clearDraft` 부재, simulator 모듈에서 `restoreSimulator` export 부재를 테스트로 고정.

## 참고자료

- #42 · #49 (감사 산출 2026-07-18, 소유자 채택)
- D-20 — "id는 값으로 주입" 결론은 불변. 이 제거로 그 근거문("드래프트 직렬화와 양립 불가")만 전제가 소멸하며, 서술 갱신은 총괄 담당.
- conventions §2 — sim 공개 API 축소의 승인 절차 근거.
