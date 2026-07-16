# @tetorial/engine

시뮬레이터·가이드·봇용 **자체 테트리스 엔진**. 게임 시간(중력·락딜레이) 없는 결정론적
상태 전이 머신이다 — 미노는 저절로 떨어지지 않고, 조작감(DAS/ARR/SDF)은 상위 입력
레이어(`@tetorial/input`)가 원자 조작을 반복 호출해 제공한다.

- 룰 규범: [appendix-engine-rules.md](../../docs/appendix-engine-rules.md)
- 규범 데이터: `src/data/triangle-data.json` — @haelp/teto v4.2.7 원본 무수정 복제
  (킥테이블·형상·코너테이블·스핀 규칙). **손 전사 금지, 그대로 임포트.**
- 런타임 의존성 **0** (`@tetorial/types`는 타입 전용). 브라우저/Node/Worker 동일 동작.
- triangle(@haelp/teto)은 골든 대조 테스트 전용 devDependency다 — 런타임 임포트 금지(D-2).

## 공개 API

| export                                                            | 종류   | 설명                                   |
| ----------------------------------------------------------------- | ------ | -------------------------------------- |
| `SimEngine`                                                       | 클래스 | 엔진 본체 (명세 §7 자구 그대로)        |
| `PRESETS`                                                         | 상수   | `"srs"`·`"srs+"` 룰셋 프리셋 (명세 §5) |
| `RulesetConfig` `SpinBonusMode` `LockInfo` `Cell` `CellPos` `Rot` | 타입   | API 시그니처 구성 타입                 |

## 사용 예시

### 노트 진입 → 조작 → 페이지 캡처 (sim의 기본 흐름)

```ts
import { SimEngine } from "@tetorial/engine";
import type { Snapshot } from "@tetorial/types";

const engine = SimEngine.fromSnapshot(snapshot satisfies Snapshot);

// 원자 조작 — 입력 레이어(DAS/ARR/SDF)가 호출. 반환: 상태가 변했으면 true
engine.move(-1); //          좌로 1칸
engine.moveToWall(1); //     우측 벽까지 (ARR 0)
engine.softDropToFloor(); // 바닥까지 (SDF ∞) — 락 아님, 이후에도 조작 가능
engine.rotate("cw"); //      킥테이블 적용. allow180=false면 rotate("180")은 항상 false
engine.swapHold(); //        holdLocked면 false. 첫 사용은 큐에서 1개 소비

const info = engine.hardDrop(); // 바닥까지 내리고 즉시 락
// info: { linesCleared, spin, counters, toppedOut, queueExhausted }
// 전부 라이브 표시 전용 — 저장되지 않는다. counters는 tetr.io 원값 규약(-1 = 없음, D-9)

const page = engine.capturePageState(); // "페이지 추가" — 조작 중 미노 위치는 미포함
```

### 페이지에서 재개 (notes 스키마 §4 규범 정의)

```ts
const engine = SimEngine.fromPageState(note.snapshot, page.state);
// board·hold·counters는 페이지 값, 남은 큐 = snapshot.queue.slice(queueUsed)
// page.state.current가 null(큐 소진)이면 조작은 전부 false — UI가 "큐 소진" 안내
```

### 셀 그리기 (자유 편집)

```ts
engine.setCells([
  { x: 0, y: 0, v: "G" }, // 쓰레기
  { x: 1, y: 0, v: "D" }, // 더미 — 물리는 G와 동일
  { x: 2, y: 0, v: "_" }, // 지우개
]);
// 큐·홀드·카운터 불변, 라인 클리어 유발 없음.
// 조작 중 미노와 겹치게 그리면 미노는 스폰 위치로 조용히 리셋된다.
// 스폰 위치마저 점유된 경우 겹친 채 유지되며 lock()/hardDrop()은 overlap 사유로 throw —
// 사용자가 조작·지우개로 해소한다 (명세 §7, QUESTIONS #2)
```

### 렌더링 관측

```ts
engine.boardView; //    Cell[][] ([y][x], y=0 최하단, 전체 높이 40) — 매 호출 복사본
engine.currentPiece; // { type, x, y, rot, cells } | null
engine.holdView; //     { piece, locked }
engine.nextView; //     남은 큐 전체 — 표시 개수는 slice(0, n) (QUESTIONS #3)
engine.ghostCells(); // 하드드롭 착지 미리보기 | null
```

## 규칙 구현 노트

- **좌표계**: x 0(왼쪽)→9, y 0(최하단)→위. 내부 높이 40(가시 20 + 버퍼 20). 명세 §4.
- **스핀 판정**: 회전 성공 직후 판정해 기록, 위치를 바꾸는 조작이 성공하면 소멸(실패한
  조작은 유지). 락 시점의 기록이 그 배치의 스핀이다. 부록 §4~5의 triangle 전사이며
  TST/fin 킥 승격·immobility까지 E-4 골든 테스트(44 시나리오)로 triangle과 대조된다.
- **카운터**: 클리어 시 combo++, 스핀/쿼드면 b2b++ 아니면 b2b=-1, 무클리어 락은 combo=-1.
  초기값 -1 (부록 §6, D-9).
- **홀드는 lastSpin을 유지한다** — triangle 실동작 준거 (QUESTIONS 참고 항목).
- **미지원 spinBonuses**(v1 범위 밖)는 `fromSnapshot`에서 명시적으로 throw (QUESTIONS #4).

## 테스트

```sh
pnpm vitest run --project '*engine*'   # 루트에서
```

수용 기준 대응: E-1 `determinism.test.ts` · E-2 `checkpoint.test.ts` ·
E-3 `kick-data.golden.test.ts` · E-4 `spin.golden.test.ts` · E-5 `mino.golden.test.ts` ·
E-6 `boundaries.test.ts` · E-7 `environment.test.ts`.
골든 테스트의 triangle 주입 방식은 `src/testing/triangle-harness.ts` 참조
(스파이크 보고서 §2의 스냅샷 검증 결과에 기반).
