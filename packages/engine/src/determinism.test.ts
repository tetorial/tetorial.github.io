// E-1 결정론: 동일 Snapshot + 동일 조작 열 → 항상 동일 상태 (property, 1,000+ 케이스)
import { describe, expect, it } from "vitest";
import { SimEngine } from "./sim-engine.js";
import { lcg, makeSnapshot, randomOps, runOps, stateSignature } from "./testing/fixtures.js";

describe("E-1 결정론", () => {
  it("랜덤 조작 열 1,000케이스: 두 번 실행한 관측 궤적이 완전히 일치한다", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const ops = randomOps(lcg(seed), 24);
      const snapshot = makeSnapshot({
        // 케이스마다 프리셋·카운터를 달리해 룰셋 분기도 함께 순회
        ruleset: { preset: seed % 2 === 0 ? "srs+" : "srs" },
        counters: { b2b: (seed % 5) - 1, combo: (seed % 3) - 1 },
      });
      const first = runOps(SimEngine.fromSnapshot(snapshot), ops);
      const second = runOps(SimEngine.fromSnapshot(snapshot), ops);
      expect(second, `seed=${seed}`).toEqual(first);
    }
  });

  it("스냅샷 객체는 초기화 이후 변형돼도 엔진에 영향을 주지 않는다 (원본 큐 불변)", () => {
    const snapshot = makeSnapshot({ queue: "IJLOSZT" });
    const engine = SimEngine.fromSnapshot(snapshot);
    const before = stateSignature(engine);
    snapshot.queue = "ZZZZZZZ";
    snapshot.board.rows.push("GGGGGGGGGG");
    snapshot.counters.b2b = 99;
    expect(stateSignature(engine)).toBe(before);
    engine.hardDrop();
    expect(engine.currentPiece?.type).toBe("I"); // 변형된 큐가 아니라 원본 큐를 소비
  });

  it("관측 API는 내부 상태의 복사본을 반환한다 (외부 변형 격리)", () => {
    const engine = SimEngine.fromSnapshot(makeSnapshot());
    const view = engine.boardView;
    const row = view[0];
    if (!row) throw new Error("boardView 행 부재");
    row[0] = "G";
    expect(engine.boardView[0]?.[0]).toBe("_");
    const next = engine.nextView;
    next.length = 0;
    expect(engine.nextView.length).toBeGreaterThan(0);
  });
});
