# replay-tetrio QUESTIONS — **처리 완료 (2026-07-12, 총괄)**

## Q1. `view.board`/`view.falling.cells`의 타입 출처 (§5)

- 채택안: `view.board = BoardRows`(@tetorial/types), `CellPos`는 replay-tetrio 로컬 정의·export.
> **총괄: 채택안 승인.** `ReadonlyBoardView`는 명세 초안의 비공식 명칭이었다 — 명세 §5를
> `BoardRows`로 정정하고 CellPos 로컬 정의를 명시했다 (2026-07-12).
> `CellPos`의 types 승격(현재 renderer·engine·replay-tetrio 3중 동형 정의 통합)은 **백로그** —
> 구조적 타이핑으로 무해하므로 v1에서는 손대지 않고, types 스키마 개정이 생길 때 함께 검토.
