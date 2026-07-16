// E-4 스핀 판정 골든 테스트: 대표 시나리오를 우리 엔진과 triangle(@haelp/teto)에
// 동일 조작열로 재생해 매 조작 후 상태와 락 결과(LockRes.spin 등)를 대조한다.
// 부록 §7 요구 분기: 코너 3/4·front 2 여부·TST/fin 승격·제자리 회전 비승격·
// immobility 각 미노·이동에 의한 lastSpin 초기화 — 각 1케이스 이상.
import type { PieceType, Snapshot } from "@tetorial/types";
import { describe, expect, it } from "vitest";
import { SimEngine } from "./sim-engine.js";
import { applyOp, makeSnapshot } from "./testing/fixtures.js";
import type { Op } from "./testing/fixtures.js";
import { TriangleSim } from "./testing/triangle-harness.js";
import type { ComparableLock, ComparableState } from "./testing/triangle-harness.js";
import type { LockInfo } from "./types.js";

type Scenario = {
  name: string;
  mode?: "T-spins" | "all-mini+"; // 기본: 프리셋 기본값
  preset?: "srs" | "srs+"; // 기본 srs+
  rows?: string[]; // 진입 보드 (rows[0]=최하단)
  queue: string; // 첫 글자 = current, 나머지 = 남은 큐
  hold?: PieceType;
  holdLocked?: boolean;
  counters?: { b2b: number; combo: number };
  ops: Op[];
  /** 마지막 락의 기대값 (분기 도달 증명) */
  expect: { spin: "none" | "mini" | "normal"; lines: number };
};

function toSnapshot(scn: Scenario): Snapshot {
  const current = scn.queue[0];
  if (current === undefined) throw new Error("queue는 최소 1미노");
  return makeSnapshot({
    ruleset: { preset: scn.preset ?? "srs+", spinBonuses: scn.mode },
    board: { width: 10, rows: scn.rows ?? [] },
    current: current as PieceType,
    queue: scn.queue.slice(1),
    hold: scn.hold ?? null,
    holdLocked: scn.holdLocked ?? false,
    counters: scn.counters ?? { b2b: -1, combo: -1 },
  });
}

/** SimEngine 관측 상태 → triangle 대조 형식 (D는 G로 정규화) */
function myState(engine: SimEngine): ComparableState {
  const page = engine.capturePageState();
  const cur = engine.currentPiece;
  const rows: string[] = [];
  for (const row of engine.boardView) {
    rows.push(row.map((c) => (c === "D" ? "G" : c)).join(""));
  }
  return {
    cur: cur === null ? null : { type: cur.type, x: cur.x, y: cur.y, rot: cur.rot },
    rows,
    hold: page.hold,
    holdLocked: page.holdLocked,
    b2b: page.counters.b2b,
    combo: page.counters.combo,
  };
}

function toComparable(info: LockInfo): ComparableLock {
  return {
    lines: info.linesCleared,
    spin: info.spin,
    b2b: info.counters.b2b,
    combo: info.counters.combo,
    toppedOut: info.toppedOut,
  };
}

/** 시나리오를 양쪽 엔진에 재생, 매 조작 후 상태·반환값 대조. 마지막 락 반환 */
function runGolden(scn: Scenario): ComparableLock {
  const snapshot = toSnapshot(scn);
  const mine = SimEngine.fromSnapshot(snapshot);
  const triangle = new TriangleSim(snapshot);
  let lastLock: ComparableLock | null = null;
  scn.ops.forEach((op, i) => {
    const label = `${scn.name} op[${i}]=${JSON.stringify(op)}`;
    const myRes = applyOp(mine, op);
    const tRes = triangle.apply(op);
    if (op === "D") {
      expect(toComparable(myRes as LockInfo), label).toEqual(tRes as ComparableLock);
      lastLock = tRes as ComparableLock;
    } else if (typeof op === "string") {
      expect(myRes, label).toBe(tRes);
    }
    expect(myState(mine), label).toEqual(triangle.state());
  });
  if (lastLock === null) throw new Error(`${scn.name}: 락 없는 시나리오`);
  return lastLock;
}

// ---------------------------------------------------------------------------
// T 코너 판정 시나리오 공통 지형 (부록 §5-2)
// T를 rot1로 (3,3)에 안착시킨 뒤 제자리 CW로 rot2 진입 — 중심 (4,2),
// 코너 = TL(3,3)·TR(5,3)·BL(3,1)·BR(5,1), rot2의 front = BL·BR.
// 지지대 (4,0)이 rot1 하강(4·5열 채널)을 y=3에서 멈춘다.
// ---------------------------------------------------------------------------
const G = "G" as const;
const SUP = "____G_____"; // y0: (4,0)

const cornerScenarios: Scenario[] = [
  {
    name: "S1 TSS형 normal — 코너 3, front 2, 제자리 회전(비승격 경로)",
    mode: "T-spins",
    rows: [SUP, "___G_G____"], // BL(3,1)·BR(5,1)
    queue: "TI",
    ops: ["CW", "F", { paint: [{ x: 3, y: 3, v: G }] }, "CW", "D"],
    expect: { spin: "normal", lines: 0 },
  },
  {
    name: "S2 mini — 코너 3, front 1, 제자리 회전 비승격",
    mode: "T-spins",
    rows: [SUP, "___G______"], // BL만
    queue: "TI",
    ops: [
      "CW",
      "F",
      {
        paint: [
          { x: 3, y: 3, v: G },
          { x: 5, y: 3, v: G },
        ],
      }, // TL·TR
      "CW",
      "D",
    ],
    expect: { spin: "mini", lines: 0 },
  },
  {
    name: "S3 코너 4 → normal",
    mode: "T-spins",
    rows: [SUP, "___G______"],
    queue: "TI",
    ops: [
      "CW",
      "F",
      {
        paint: [
          { x: 3, y: 3, v: G },
          { x: 5, y: 3, v: G },
          { x: 5, y: 1, v: G },
        ],
      },
      "CW",
      "D",
    ],
    expect: { spin: "normal", lines: 0 },
  },
  {
    name: "S4 코너 2 → none",
    mode: "T-spins",
    rows: [SUP],
    queue: "TI",
    ops: [
      "CW",
      "F",
      {
        paint: [
          { x: 3, y: 3, v: G },
          { x: 5, y: 3, v: G },
        ],
      },
      "CW",
      "D",
    ],
    expect: { spin: "none", lines: 0 },
  },
  {
    name: "S5 접지 아닌 공중 회전 → none (하드드롭 하강이 스핀을 소멸)",
    mode: "T-spins",
    queue: "TI",
    ops: ["CW", "D"],
    expect: { spin: "none", lines: 0 },
  },
  {
    name: "S6 회전 후 성공한 이동은 스핀 소멸",
    mode: "T-spins",
    rows: [SUP, "___G______"],
    queue: "TI",
    ops: [
      "CW",
      "F",
      {
        paint: [
          { x: 3, y: 3, v: G },
          { x: 5, y: 3, v: G },
        ],
      },
      "CW", // mini 획득
      "R", // 성공 이동 → 소멸
      "D",
    ],
    expect: { spin: "none", lines: 0 },
  },
  {
    name: "S7 실패한 이동은 스핀 유지 (부록 §4)",
    mode: "T-spins",
    rows: [SUP, "___G_G____"],
    queue: "TI",
    ops: [
      "CW",
      "F",
      { paint: [{ x: 3, y: 3, v: G }] },
      "CW", // normal 획득
      "L", // (3,1)에 막혀 실패 → 유지
      "D",
    ],
    expect: { spin: "normal", lines: 0 },
  },
  {
    name: "S8 홀드는 lastSpin을 초기화하지 않는다 (triangle 준거 quirk)",
    mode: "T-spins",
    rows: [SUP, "___G_G____"],
    queue: "TIO",
    ops: [
      "CW",
      "F",
      { paint: [{ x: 3, y: 3, v: G }] },
      "CW", // T로 normal 획득
      // 다음 미노(I)가 스폰 즉시 접지하도록 받침을 그린다 (스폰 열 3~6, y=20)
      {
        paint: [
          { x: 3, y: 20, v: G },
          { x: 4, y: 20, v: G },
          { x: 5, y: 20, v: G },
          { x: 6, y: 20, v: G },
        ],
      },
      "H", // T 보관, I 인출 — lastSpin 유지
      "D", // 하강 0칸 → 잔존 스핀이 락에 반영 (triangle과 동일해야 함)
    ],
    expect: { spin: "normal", lines: 0 },
  },
  {
    name: "S9 TST 킥 승격 — id 03, kick [1,-2] → mini가 normal로",
    mode: "T-spins",
    rows: [undefined, undefined, "___G______"].map((r) => r ?? "_".repeat(10)), // (3,2) 받침
    queue: "TI",
    ops: [
      "F", // rot0 (3,4) 안착
      {
        paint: [
          { x: 4, y: 2, v: G }, // 제자리·cand3 차단
          { x: 5, y: 4, v: G }, // cand1·cand2 차단
          { x: 6, y: 0, v: G }, // BR 코너
          { x: 6, y: 2, v: G }, // TR 코너
        ],
      },
      "CCW", // cand4 [1,2] 채택 → rot3 (4,2), 코너3·front1 → 승격 normal
      "D",
    ],
    expect: { spin: "normal", lines: 0 },
  },
  {
    name: "S10 fin 킥 승격 — id 01, kick [-1,-2]",
    mode: "T-spins",
    rows: [undefined, undefined, "_____G____"].map((r) => r ?? "_".repeat(10)), // (5,2) 받침
    queue: "TI",
    ops: [
      "F", // rot0 (3,4) 안착
      {
        paint: [
          { x: 4, y: 2, v: G }, // 제자리·cand3 차단
          { x: 3, y: 4, v: G }, // cand1·cand2 차단
          { x: 2, y: 2, v: G }, // TL 코너
          { x: 2, y: 0, v: G }, // BL 코너
        ],
      },
      "CW", // cand4 [-1,2] 채택 → rot1 (2,2), 코너3·front1 → 승격 normal
      "D",
    ],
    expect: { spin: "normal", lines: 0 },
  },
];

// ---------------------------------------------------------------------------
// Immobility (all-mini+, 부록 §5-4) — 전 미노 × cw/ccw/180.
// 바닥(전부 G) 안착 → 회전 결과 위치의 사방을 차단 셀로 봉쇄 → 마지막 회전 → mini.
// 차단 셀은 회전 킥 경로·조작 중 미노와 겹치지 않게 산출된 값 (바닥행은 락 시 클리어 → lines 1)
// ---------------------------------------------------------------------------
const FLOOR = "G".repeat(10);

const immobilityTable: {
  piece: PieceType;
  rot: "CW" | "CCW" | "180";
  blockers: [number, number][];
}[] = [
  {
    piece: "Z",
    rot: "CW",
    blockers: [
      [3, 3],
      [5, 3],
      [4, 4],
    ],
  },
  {
    piece: "Z",
    rot: "CCW",
    blockers: [
      [3, 1],
      [6, 2],
      [4, 3],
    ],
  },
  {
    piece: "Z",
    rot: "180",
    blockers: [
      [3, 1],
      [6, 1],
      [5, 2],
    ],
  },
  {
    piece: "L",
    rot: "CW",
    blockers: [
      [2, 3],
      [4, 3],
      [4, 2],
    ],
  },
  {
    piece: "L",
    rot: "CCW",
    blockers: [
      [3, 3],
      [6, 1],
      [4, 4],
    ],
  },
  {
    piece: "L",
    rot: "180",
    blockers: [
      [2, 1],
      [6, 2],
      [5, 3],
    ],
  },
  {
    piece: "J",
    rot: "CW",
    blockers: [
      [2, 3],
      [5, 3],
      [4, 4],
    ],
  },
  {
    piece: "J",
    rot: "CCW",
    blockers: [
      [4, 2],
      [6, 1],
    ],
  },
  {
    piece: "J",
    rot: "180",
    blockers: [
      [2, 2],
      [6, 1],
      [5, 3],
    ],
  },
  {
    piece: "I",
    rot: "CW",
    blockers: [
      [5, 4],
      [7, 4],
      [6, 5],
    ],
  },
  {
    piece: "I",
    rot: "CCW",
    blockers: [
      [2, 1],
      [4, 2],
      [3, 5],
    ],
  },
  {
    piece: "I",
    rot: "180",
    blockers: [
      [2, 1],
      [7, 1],
      [6, 2],
    ],
  },
  {
    piece: "S",
    rot: "CW",
    blockers: [
      [2, 3],
      [5, 1],
      [4, 3],
    ],
  },
  {
    piece: "S",
    rot: "CCW",
    blockers: [
      [3, 2],
      [5, 3],
      [4, 4],
    ],
  },
  {
    piece: "S",
    rot: "180",
    blockers: [
      [2, 1],
      [5, 1],
      [3, 2],
    ],
  },
  {
    piece: "O",
    rot: "CW",
    blockers: [
      [3, 2],
      [6, 2],
      [5, 3],
    ],
  },
  {
    piece: "O",
    rot: "CCW",
    blockers: [
      [3, 1],
      [6, 1],
      [4, 3],
    ],
  },
  {
    piece: "O",
    rot: "180",
    blockers: [
      [3, 1],
      [6, 1],
      [5, 3],
    ],
  },
  {
    piece: "T",
    rot: "CW",
    blockers: [
      [2, 3],
      [5, 2],
      [4, 3],
    ],
  },
  {
    piece: "T",
    rot: "CCW",
    blockers: [
      [3, 2],
      [6, 1],
      [4, 3],
    ],
  },
  {
    piece: "T",
    rot: "180",
    blockers: [
      [2, 2],
      [6, 2],
      [5, 3],
    ],
  },
];

const immobilityScenarios: Scenario[] = immobilityTable.map(({ piece, rot, blockers }) => ({
  name: `IM ${piece} ${rot} immobility → mini (all-mini+)`,
  mode: "all-mini+",
  rows: [FLOOR],
  queue: `${piece}I`,
  ops: ["F", { paint: blockers.map(([x, y]) => ({ x, y, v: G })) }, rot, "D"],
  expect: { spin: "mini", lines: 1 },
}));

// ---------------------------------------------------------------------------
// 모드 분기·카운터·킥·홀드 시나리오
// ---------------------------------------------------------------------------
const otherScenarios: Scenario[] = [
  {
    name: "M1 T-spins 모드에서 Z immobility는 none (모드 분기 — 코너 판정은 T 한정)",
    mode: "T-spins",
    rows: [FLOOR],
    queue: "ZI",
    ops: [
      "F",
      {
        paint: [
          { x: 3, y: 3, v: G },
          { x: 5, y: 3, v: G },
          { x: 4, y: 4, v: G },
        ],
      },
      "CW",
      "D",
    ],
    expect: { spin: "none", lines: 1 },
  },
  {
    name: "M2 all-mini+에서 T 코너 normal이 immobility mini를 이긴다 (maxSpin)",
    mode: "all-mini+",
    rows: [SUP, "___G_G____"],
    queue: "TI",
    ops: ["CW", "F", { paint: [{ x: 3, y: 3, v: G }] }, "CW", "D"],
    expect: { spin: "normal", lines: 0 },
  },
  {
    name: "M3 all-mini+에서 T 코너<3 + immobile → mini",
    mode: "all-mini+",
    rows: [FLOOR],
    queue: "TI",
    ops: [
      "F",
      {
        paint: [
          { x: 2, y: 3, v: G },
          { x: 5, y: 2, v: G },
          { x: 4, y: 3, v: G },
        ],
      },
      "CW",
      "D",
    ],
    expect: { spin: "mini", lines: 1 },
  },
  {
    name: "C1 쿼드 → b2b 시동, 이어지는 무클리어 락은 combo만 끊는다",
    rows: ["GGGGGGGGG_", "GGGGGGGGG_", "GGGGGGGGG_", "GGGGGGGGG_"],
    queue: "IIO",
    ops: ["CW", "WR", "D", "D"],
    expect: { spin: "none", lines: 0 }, // 두 번째 락 (첫 락은 쿼드 — 러너가 매 락 대조)
  },
  {
    name: "C2 연속 쿼드 → b2b·combo 연쇄 증가",
    rows: Array.from({ length: 8 }, () => "GGGGGGGGG_"),
    queue: "IIO",
    ops: ["CW", "WR", "D", "CW", "WR", "D"],
    expect: { spin: "none", lines: 4 },
  },
  {
    name: "C3 시드 카운터에서 일반 싱글 → combo 증가·b2b 파괴 (D-9 원값)",
    counters: { b2b: 2, combo: 1 },
    rows: ["GGGGGGGG__"],
    queue: "OI",
    ops: ["WR", "D"],
    expect: { spin: "none", lines: 1 },
  },
  {
    name: "C4 T스핀 싱글 클리어 → b2b 증가 (스핀 클리어 b2b 규칙)",
    mode: "T-spins",
    rows: [SUP, "GGGG_GGGGG"],
    queue: "TI",
    ops: ["CW", "F", { paint: [{ x: 3, y: 3, v: G }] }, "CW", "D"],
    expect: { spin: "normal", lines: 1 },
  },
  {
    name: "K1 I 벽킥 — SRS+ i_kicks 순서로 착지 (제자리 실패 → 킥)",
    preset: "srs+",
    rows: [undefined, "_____G____"].map((r) => r ?? "_".repeat(10)), // (5,1)
    queue: "II",
    ops: ["F", "CW", "D"],
    expect: { spin: "none", lines: 0 },
  },
  {
    name: "K2 I 벽킥 — SRS i_kicks는 후보 순서가 달라 다른 곳에 착지",
    preset: "srs",
    rows: [undefined, "_____G____"].map((r) => r ?? "_".repeat(10)),
    queue: "II",
    ops: ["F", "CW", "D"],
    expect: { spin: "none", lines: 0 },
  },
  {
    name: "K3 T 바닥 180 킥 (SRS+ 02 킥셋) — 위로 킥 후 착지",
    preset: "srs+",
    rows: [FLOOR],
    queue: "TI",
    ops: ["F", "180", "D"],
    expect: { spin: "none", lines: 1 }, // 만재 바닥행이 락 시 클리어
  },
  {
    name: "H1 홀드 왕복 — 첫 사용 인출, holdLocked 중 재시도 실패",
    queue: "TIO",
    ops: ["H", "H", "D"],
    expect: { spin: "none", lines: 0 },
  },
  {
    name: "H2 스냅샷 hold 승계 후 교환 (큐 소비 없음)",
    hold: "S",
    queue: "TI",
    ops: ["H", "D"],
    expect: { spin: "none", lines: 0 },
  },
  {
    name: "H3 스냅샷 holdLocked 승계 — 교환 거부 후 락으로 해제",
    hold: "S",
    holdLocked: true,
    queue: "TIO",
    ops: ["H", "D", "H", "D"],
    expect: { spin: "none", lines: 0 },
  },
  {
    name: "W1 벽까지 이동·좌우 이동·소프트드롭 혼합 경로 동등성",
    rows: [FLOOR, "GG______GG"],
    queue: "LJS",
    ops: ["WL", "F", "R", "R", "CW", "D", "WR", "F", "CCW", "D"],
    expect: { spin: "none", lines: 0 },
  },
];

const scenarios = [...cornerScenarios, ...immobilityScenarios, ...otherScenarios];

describe("E-4 스핀 판정 골든 테스트 (triangle 대조)", () => {
  it("대표 시나리오가 30개 이상이다 (수용 기준)", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(30);
  });

  it.each(scenarios)("$name", (scn) => {
    const lastLock = runGolden(scn);
    expect(lastLock.spin, "기대 스핀 (분기 도달 증명)").toBe(scn.expect.spin);
    expect(lastLock.lines, "기대 클리어 라인").toBe(scn.expect.lines);
  });
});
