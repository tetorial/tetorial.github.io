# adapter-tetrio QUESTIONS — **전 항목 처리 완료 (2026-07-11, 총괄)**

> 작업 차단 항목 없음. 아래 잠정 채택안 2건 모두 승인되어 명세에 반영됐다 (adapter-tetrio.md §2·§8).

## 1. `TetrioRoundOptions`의 구체 형태

- 채택안: 소비 5필드(`kickset`·`spinbonuses`·`allow180`·`boardwidth`·`boardheight`)만 담은 최소 구조적 타입.
> **총괄: 승인.** §2에 타입 정의를 명문화했다. ttrm 옵션 전체의 규범 타입은 replay-tetrio
> 명세 소관으로 확정 — W2 replay-tetrio 세션에 전달된다.

## 2. `ok:false` 사유의 우선순위

- 채택안: 유니언 선언 순서(`unsupported-kickset` → `unsupported-board` → `topped-out`)로 먼저 걸리는 사유 보고.
> **총괄: 승인 (재론 가능).** 룰 차단이 상태 차단보다 근본적이라는 논거에 동의. §2에
> 명문화했고, UI 문구 설계(W3)는 이 우선순위를 전제한다.
