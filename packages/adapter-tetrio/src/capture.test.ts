// captureSnapshot 단위 테스트 — 수용 기준 A-2·A-3·A-4·A-5·A-6·A-7 (구명세 adapter-tetrio §6)
// 골든(실물 리플레이) 검증은 golden.test.ts.
import { describe, expect, it, vi } from "vitest";
import type { Engine, IncomingGarbage, Mino } from "@haelp/teto/engine";
import { NOTES_LIMITS, snapshotSchema } from "@tetorial/types";
import { captureSnapshot } from "./capture.js";
import { expectOk, makeEngine } from "./testing/harness.js";

/** 보드 셀 주입 (rows[0] = 최하단 — triangle board.state와 방향 동일) */
function setTile(engine: Engine, x: number, y: number, symbol: string | null): void {
  const row = engine.board.state[y];
  if (!row) throw new Error(`triangle 보드 행 부재: ${y}`);
  row[x] = symbol === null ? null : { mino: symbol as Mino, connections: 0 };
}

function setRow(engine: Engine, y: number, symbols: readonly (string | null)[]): void {
  symbols.forEach((symbol, x) => setTile(engine, x, y, symbol));
}

describe("A-2 셀 매핑 전수", () => {
  it("8종 셀(빈/gb/7미노)이 명세 §4 문자로 변환된다", () => {
    const engine = makeEngine();
    setRow(engine, 0, [null, "gb", "i", "j", "l", "o", "s", "t"]);
    setRow(engine, 1, ["z", null, null, null, null, null, null, null]);
    const { snapshot } = expectOk(captureSnapshot(engine, {}));
    expect(snapshot.board.rows[0]).toBe("_GIJLOST__");
    expect(snapshot.board.rows[1]).toBe("Z_________");
  });

  it("미지의 mino 값은 G로 강등하고 콘솔 경고를 낸다 (전방 호환, 심볼당 1회)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const engine = makeEngine();
      setTile(engine, 0, 0, "bomb");
      setTile(engine, 5, 0, "bomb"); // 같은 심볼 2회 → 경고는 1회
      const { snapshot } = expectOk(captureSnapshot(engine, {}));
      expect(snapshot.board.rows[0]).toBe("G____G____");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain("bomb");
    } finally {
      warn.mockRestore();
    }
  });

  it("상단 전부-빈 행은 트림된다 (빈 보드 → rows [])", () => {
    const empty = expectOk(captureSnapshot(makeEngine(), {}));
    expect(empty.snapshot.board.rows).toEqual([]);

    const engine = makeEngine();
    setTile(engine, 3, 2, "gb"); // 최고점 y=2 → rows 3행, 그 위는 생략
    const { snapshot } = expectOk(captureSnapshot(engine, {}));
    expect(snapshot.board.rows).toEqual(["__________", "__________", "___G______"]);
  });
});

describe("A-3 카운터 규약 (D-9: 원값 그대로, -1 = 없음)", () => {
  it("b2b/combo가 -1인 시점 캡처 → 원값 보존", () => {
    const engine = makeEngine();
    engine.stats.b2b = -1;
    engine.stats.combo = -1;
    const { snapshot } = expectOk(captureSnapshot(engine, {}));
    expect(snapshot.counters).toEqual({ b2b: -1, combo: -1 });
  });

  it("유효 카운터(0 이상)도 정규화 없이 그대로 기록한다", () => {
    const engine = makeEngine();
    engine.stats.b2b = 5;
    engine.stats.combo = 0;
    const { snapshot } = expectOk(captureSnapshot(engine, {}));
    expect(snapshot.counters).toEqual({ b2b: 5, combo: 0 });
  });
});

describe("A-4 정책 분기", () => {
  it("unsupported-kickset: SRS/SRS+ 외 킥셋은 차단한다", () => {
    expect(captureSnapshot(makeEngine(), { kickset: "SRS-X" })).toEqual({
      ok: false,
      reason: "unsupported-kickset",
    });
  });

  it("kickset 매핑: 생략 → srs+, SRS → srs (§3)", () => {
    expect(expectOk(captureSnapshot(makeEngine(), {})).snapshot.ruleset.preset).toBe("srs+");
    expect(
      expectOk(captureSnapshot(makeEngine(), { kickset: "SRS" })).snapshot.ruleset.preset,
    ).toBe("srs");
  });

  it("unsupported-board: boardwidth/boardheight가 존재하며 10/20이 아니면 차단한다 (§5-5)", () => {
    const engine = makeEngine();
    expect(captureSnapshot(engine, { boardwidth: 20 })).toEqual({
      ok: false,
      reason: "unsupported-board",
    });
    expect(captureSnapshot(engine, { boardheight: 40 })).toEqual({
      ok: false,
      reason: "unsupported-board",
    });
    // 명시돼 있어도 표준 크기(10×20)면 통과
    expect(captureSnapshot(engine, { boardwidth: 10, boardheight: 20 }).ok).toBe(true);
  });

  it("topped-out: 탑아웃 상태에서는 분기 불가 (§5-4)", () => {
    const engine = makeEngine();
    for (let y = 0; y < 40; y++)
      setRow(
        engine,
        y,
        Array.from({ length: 10 }, () => "gb"),
      );
    expect(engine.toppedOut).toBe(true);
    expect(captureSnapshot(engine, {})).toEqual({ ok: false, reason: "topped-out" });
  });

  it("스핀 모드 대체: 미지원 값은 all-mini+ 기록 + 경고, 차단하지 않는다 (§5-2)", () => {
    for (const from of ["all", "stupid", "none"]) {
      const result = expectOk(captureSnapshot(makeEngine(), { spinbonuses: from }));
      expect(result.snapshot.ruleset.spinBonuses).toBe("all-mini+");
      expect(result.warnings).toContainEqual({
        type: "spin-mode-substituted",
        from,
        to: "all-mini+",
      });
    }
  });

  it("지원 스핀 모드(T-spins·all-mini+)와 생략(→ all-mini+)은 경고 없이 그대로 기록한다", () => {
    for (const [options, expected] of [
      [{ spinbonuses: "T-spins" }, "T-spins"],
      [{ spinbonuses: "all-mini+" }, "all-mini+"],
      [{}, "all-mini+"],
    ] as const) {
      const result = expectOk(captureSnapshot(makeEngine(), options));
      expect(result.snapshot.ruleset.spinBonuses).toBe(expected);
      expect(result.warnings).toEqual([]);
    }
  });

  it("allow180: 프리셋 기본과 같으면 생략, 다르면 기록한다 (§3)", () => {
    // srs+ 기본 true / srs 기본 false (엔진 명세 §2 PRESETS). 리플레이 옵션 생략 시 true
    expect(expectOk(captureSnapshot(makeEngine(), {})).snapshot.ruleset).not.toHaveProperty(
      "allow180",
    );
    expect(
      expectOk(captureSnapshot(makeEngine(), { allow180: false })).snapshot.ruleset.allow180,
    ).toBe(false);
    expect(
      expectOk(captureSnapshot(makeEngine(), { kickset: "SRS" })).snapshot.ruleset.allow180,
    ).toBe(true);
    expect(
      expectOk(captureSnapshot(makeEngine(), { kickset: "SRS", allow180: false })).snapshot.ruleset,
    ).not.toHaveProperty("allow180");
  });
});

describe("A-5 대기 쓰레기 (§5-3: 보드 미반영 + pendingGarbage 보고)", () => {
  it("수신 직후(적용 전) 캡처 → 보드 그대로, 줄 수 집계 + 경고 동반", () => {
    const engine = makeEngine();
    setRow(engine, 0, ["gb", "gb", "gb", "gb", null, "gb", "gb", "gb", "gb", "gb"]);
    const before = expectOk(captureSnapshot(engine, {}));
    expect(before.pendingGarbage).toBe(0);
    expect(before.warnings).toEqual([]);

    const incoming: IncomingGarbage = {
      frame: engine.frame,
      amount: 4,
      size: 1,
      cid: 1,
      gameid: 999,
      confirmed: true,
    };
    engine.garbageQueue.receive(incoming);

    const after = expectOk(captureSnapshot(engine, {}));
    expect(after.snapshot.board).toEqual(before.snapshot.board); // 대기분은 보드에 반영하지 않는다
    expect(after.pendingGarbage).toBe(4);
    expect(after.warnings).toContainEqual({ type: "pending-garbage-dropped", lines: 4 });
  });
});

describe("A-6 결정론", () => {
  it("같은 시드로 만든 두 엔진의 캡처 결과가 deep equal", () => {
    const first = captureSnapshot(makeEngine({ seed: 7 }), {});
    const second = captureSnapshot(makeEngine({ seed: 7 }), {});
    expect(second).toEqual(first);
  });

  it("같은 엔진을 2회 캡처해도 동일하다 (minLength 상향의 멱등성)", () => {
    const engine = makeEngine({ seed: 11 });
    const first = captureSnapshot(engine, {});
    const second = captureSnapshot(engine, {});
    expect(second).toEqual(first);
  });
});

describe("A-7 산출물 검증 (types snapshotSchema)", () => {
  it("캡처된 Snapshot이 notes 스키마 한도를 통과한다", () => {
    const engine = makeEngine();
    setRow(engine, 0, ["gb", "t", null, "i", "j", "l", "o", "s", "z", "gb"]);
    engine.press("hold"); // hold·holdLocked 경로 포함
    const { snapshot } = expectOk(captureSnapshot(engine, {}));
    expect(() => snapshotSchema.parse(snapshot)).not.toThrow();
    expect(snapshot.hold).not.toBeNull();
    expect(snapshot.holdLocked).toBe(true);
  });

  it("queue는 200개 사전 파생 — current 미포함, 한도(≤ 1000) 이내 (§3, D-8)", () => {
    const engine = makeEngine();
    const nextInQueue = String(engine.queue[0]).toUpperCase();
    const { snapshot } = expectOk(captureSnapshot(engine, {}));
    expect(snapshot.queue).toHaveLength(200);
    expect(snapshot.queue.length).toBeLessThanOrEqual(NOTES_LIMITS.maxQueueLength);
    expect(snapshot.queue[0]).toBe(nextInQueue); // 큐 선두 = 다음 스폰 (current는 이미 빠져 있음)
    expect(snapshot.current).toBe(String(engine.falling.symbol).toUpperCase());
  });
});
