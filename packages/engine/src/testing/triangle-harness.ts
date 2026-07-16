// triangle(@haelp/teto v4.2.7) 골든 대조 하네스 — 스파이크 보고서 §2·§3의 주입 방식
// conventions §4: 대조 테스트는 @haelp/teto devDependency 허용(테스트 전용).
// 루트 eslint의 D-2 금지 규칙은 테스트·testing/ 을 제외한다 (W1 QUESTIONS 1 해소)
import { Engine, kickData, tetrominoes } from "@haelp/teto/engine";
import type { EngineInitializeParams, LockRes, Mino, Tile } from "@haelp/teto/engine";
import type { Snapshot } from "@tetorial/types";
import type { Op } from "./fixtures.js";

export { kickData, tetrominoes };

/** 재생 하네스와 동일한 기본 옵션 (tools/spike/harness_lib.mjs 대응, 시각은 고정값) */
function initParams(snapshot: Snapshot): EngineInitializeParams {
  const kickTable = snapshot.ruleset.preset === "srs" ? "SRS" : "SRS+";
  const spinBonuses =
    snapshot.ruleset.spinBonuses ?? (kickTable === "SRS" ? "T-spins" : "all-mini+");
  return {
    board: { width: 10, height: 20, buffer: 20 },
    kickTable,
    options: {
      comboTable: "multiplier",
      garbageBlocking: "combo blocking",
      clutch: true,
      garbageTargetBonus: "none",
      spinBonuses: spinBonuses as EngineInitializeParams["options"]["spinBonuses"],
      stock: 0,
    },
    queue: { minLength: 10, seed: 1, type: "7-bag" },
    garbage: {
      bombs: false,
      cap: { absolute: 0, increase: 0, max: 40, value: 8, marginTime: 0 },
      boardWidth: 10,
      garbage: { speed: 20, holeSize: 1 },
      messiness: { change: 1, nosame: false, timeout: 0, within: 0, center: false },
      multiplier: { value: 1, increase: 0.008, marginTime: 10800 },
      specialBonus: false,
      openerPhase: 0,
      seed: 1,
      rounding: "down",
    },
    gravity: { value: 0, increase: 0, marginTime: 0 },
    handling: {
      arr: 0,
      das: 6,
      dcd: 0,
      sdf: 41,
      safelock: false,
      cancel: false,
      may20g: true,
      irs: "tap",
      ihs: "tap",
    },
    b2b: { chaining: true, charging: false },
    pc: { b2b: 0, garbage: 0 },
    misc: {
      allowed: {
        hardDrop: true,
        spin180: snapshot.ruleset.allow180 ?? kickTable === "SRS+",
        hold: true,
        retry: false,
        undo: false,
      },
      infiniteHold: false,
      movement: { infinite: false, lockResets: 15, lockTime: 30, may20G: true },
      username: "golden",
      stride: false,
      date: new Date("2026-01-01T00:00:00Z"), // 고정 시각 — 테스트 결정론
    },
  };
}

function toMino(ch: string): Mino {
  return ch.toLowerCase() as Mino;
}

function paintCell(ch: string): Tile {
  if (ch === "_") return null;
  return { mino: ch === "G" || ch === "D" ? ("gb" as Mino) : toMino(ch), connections: 0 };
}

/** 비교 가능한 관측 상태 (D는 G로 정규화 — triangle에는 D 개념이 없다) */
export type ComparableState = {
  cur: { type: string; x: number; y: number; rot: number } | null;
  rows: string[]; // 40행 전체, "_"/"G"/미노 대문자
  hold: string | null;
  holdLocked: boolean;
  b2b: number;
  combo: number;
};

export type ComparableLock = {
  lines: number;
  spin: "none" | "mini" | "normal";
  b2b: number;
  combo: number;
  toppedOut: boolean;
};

/** triangle 엔진을 우리 Snapshot으로 초기화하고 동일 조작 코드를 재생하는 래퍼 */
export class TriangleSim {
  readonly engine: Engine;

  constructor(snapshot: Snapshot) {
    this.engine = new Engine(initParams(snapshot));
    // 보드 주입 (rows[0] = 최하단 — triangle board.state와 방향 동일, 명세 §4)
    snapshot.board.rows.forEach((row, y) => {
      const target = this.engine.board.state[y];
      if (!target) throw new Error(`triangle 보드 행 부재: ${y}`);
      for (let x = 0; x < row.length; x++) target[x] = paintCell(row[x] ?? "_");
    });
    // 큐 주입: 시드 파생분을 비우고 시나리오 큐로 대체 (minLength 0 → 재보충 없음)
    this.engine.queue.minLength = 0;
    this.engine.queue.splice(0, this.engine.queue.length, ...snapshot.queue.split("").map(toMino));
    this.engine.initiatePiece(toMino(snapshot.current));
    this.engine.held = snapshot.hold === null ? null : toMino(snapshot.hold);
    this.engine.holdLocked = snapshot.holdLocked;
    this.engine.stats.b2b = snapshot.counters.b2b;
    this.engine.stats.combo = snapshot.counters.combo;
  }

  /** 조작 적용. 반환: 락은 ComparableLock, 원자 조작은 성공 여부, paint는 undefined */
  apply(op: Op): boolean | ComparableLock | undefined {
    if (typeof op !== "string") {
      for (const c of op.paint) {
        const row = this.engine.board.state[c.y];
        if (!row) throw new Error(`paint 좌표 범위 밖: (${c.x}, ${c.y})`);
        row[c.x] = paintCell(c.v);
      }
      return undefined;
    }
    switch (op) {
      case "L":
        return this.engine.press("moveLeft") === true;
      case "R":
        return this.engine.press("moveRight") === true;
      case "WL":
        return this.engine.press("dasLeft") === true;
      case "WR":
        return this.engine.press("dasRight") === true;
      case "F":
        return this.engine.press("softDrop") === true;
      case "CW":
        return Boolean(this.engine.press("rotateCW"));
      case "CCW":
        return Boolean(this.engine.press("rotateCCW"));
      case "180":
        return Boolean(this.engine.press("rotate180"));
      case "H":
        return this.engine.press("hold") === true;
      case "D": {
        const res = this.engine.press("hardDrop") as LockRes;
        return {
          lines: res.lines,
          spin: res.spin,
          b2b: res.stats.b2b,
          combo: res.stats.combo,
          toppedOut: res.topout,
        };
      }
      case "DN":
        throw new Error("DN(1칸 하강)은 triangle 대응 조작이 없다 — 골든 시나리오에서 미사용");
    }
  }

  state(): ComparableState {
    const f = this.engine.falling;
    return {
      cur: {
        type: f.symbol.toUpperCase(),
        x: f.location[0],
        y: Math.floor(f.location[1]),
        rot: f.rotation,
      },
      rows: this.engine.board.state.map((row) =>
        row
          .map((cell) => (cell === null ? "_" : cell.mino === "gb" ? "G" : cell.mino.toUpperCase()))
          .join(""),
      ),
      hold: this.engine.held === null ? null : this.engine.held.toUpperCase(),
      holdLocked: this.engine.holdLocked,
      b2b: this.engine.stats.b2b,
      combo: this.engine.stats.combo,
    };
  }
}
