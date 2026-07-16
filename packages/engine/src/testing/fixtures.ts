// 테스트 전용 헬퍼 — 런타임 소스가 아니다 (E-7 정적 검사에서 제외되는 testing/ 하위).
// 결정론 유지를 위해 테스트도 Math.random 대신 시드 LCG를 쓴다.
import type { Snapshot } from "@tetorial/types";
import type { SimEngine } from "../sim-engine.js";
import type { Cell, LockInfo } from "../types.js";

/** 시나리오·property 테스트 공용 조작 코드 */
export type Op =
  | "L" // move(-1)
  | "R" // move(1)
  | "WL" // moveToWall(-1)
  | "WR" // moveToWall(1)
  | "DN" // moveDown() — triangle 대응 조작이 없어 골든 시나리오에서는 미사용
  | "F" // softDropToFloor()
  | "CW"
  | "CCW"
  | "180"
  | "H" // swapHold()
  | "D" // hardDrop()
  | { paint: { x: number; y: number; v: Cell }[] }; // setCells()

export function makeSnapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    ruleset: { preset: "srs+" },
    board: { width: 10, rows: [] },
    current: "T",
    hold: null,
    holdLocked: false,
    queue: "IJLOSZT".repeat(4),
    counters: { b2b: -1, combo: -1 },
    ...over,
  };
}

/** 조작 1개 적용. 반환: 원자 조작은 boolean, 락은 LockInfo, paint는 undefined */
export function applyOp(engine: SimEngine, op: Op): boolean | LockInfo | undefined {
  if (typeof op !== "string") {
    engine.setCells(op.paint);
    return undefined;
  }
  switch (op) {
    case "L":
      return engine.move(-1);
    case "R":
      return engine.move(1);
    case "WL":
      return engine.moveToWall(-1);
    case "WR":
      return engine.moveToWall(1);
    case "DN":
      return engine.moveDown();
    case "F":
      return engine.softDropToFloor();
    case "CW":
      return engine.rotate("cw");
    case "CCW":
      return engine.rotate("ccw");
    case "180":
      return engine.rotate("180");
    case "H":
      return engine.swapHold();
    case "D":
      return engine.hardDrop();
  }
}

/** 관측 가능한 전체 상태의 서명 (E-1 결정론 대조용) */
export function stateSignature(engine: SimEngine): string {
  return JSON.stringify({
    page: engine.capturePageState(),
    cur: engine.currentPiece,
    hold: engine.holdView,
    next: engine.nextView.join(""),
    ghost: engine.ghostCells(),
  });
}

/** 시드 LCG (0 ≤ r < 1). 테스트 결정론용 — Math.random 대체 */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const CELLS: readonly Cell[] = ["_", "G", "D", "I", "J", "L", "O", "S", "T", "Z"];

/**
 * 랜덤 조작 열 생성 (E-1·E-2). paint는 스폰 영역(y ≥ 20)을 피해 그린다 —
 * 스폰 점유 overlap 상태에서 lock()이 던지는 것은 E-6에서 별도 검증.
 */
export function randomOps(rand: () => number, count: number): Op[] {
  const ops: Op[] = [];
  const basic: Op[] = ["L", "R", "WL", "WR", "DN", "F", "CW", "CCW", "180", "H"];
  for (let i = 0; i < count; i++) {
    const r = rand();
    if (r < 0.55) {
      ops.push(basic[Math.floor(rand() * basic.length)] ?? "L");
    } else if (r < 0.8) {
      ops.push("D");
    } else {
      const cells = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({
        x: Math.floor(rand() * 10),
        y: Math.floor(rand() * 19),
        v: CELLS[Math.floor(rand() * CELLS.length)] ?? "_",
      }));
      ops.push({ paint: cells });
    }
  }
  return ops;
}

/**
 * 조작 열 적용 + 관측 궤적 수집. currentPiece가 없으면 락·조작을 건너뛴다
 * (건너뛰기 조건도 상태의 함수이므로 결정론이 유지된다)
 */
export function runOps(engine: SimEngine, ops: readonly Op[]): string[] {
  const trace: string[] = [];
  for (const op of ops) {
    if (typeof op === "string" && engine.currentPiece === null) {
      trace.push("skip");
      continue;
    }
    try {
      const res = applyOp(engine, op);
      trace.push(JSON.stringify(res ?? null) + "|" + stateSignature(engine));
    } catch (err) {
      // 탑아웃 스택이 스폰을 덮은 뒤의 락 거부(overlap) 등 — 거부 자체도 결정론적 관측값
      trace.push("throw:" + String(err) + "|" + stateSignature(engine));
    }
  }
  return trace;
}
