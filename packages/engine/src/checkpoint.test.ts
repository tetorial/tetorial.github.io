// E-2 체크포인트 왕복: capturePageState → fromPageState 복원 시 이후 동작 동등
import { describe, expect, it } from "vitest";
import { SimEngine } from "./sim-engine.js";
import { lcg, makeSnapshot, randomOps, runOps, stateSignature } from "./testing/fixtures.js";

describe("E-2 체크포인트 왕복", () => {
  it("임의 조작 후 캡처→복원한 페이지 상태가 재캡처와 deep equal (100케이스)", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const snapshot = makeSnapshot();
      const engine = SimEngine.fromSnapshot(snapshot);
      runOps(engine, randomOps(lcg(seed), 16));
      const page = engine.capturePageState();
      const restored = SimEngine.fromPageState(snapshot, page);
      expect(restored.capturePageState(), `seed=${seed}`).toEqual(page);
    }
  });

  it("락 직후 캡처→복원한 엔진은 동일 후속 조작에 동일 궤적을 낸다 (100케이스)", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rand = lcg(seed * 7919);
      const snapshot = makeSnapshot();
      const original = SimEngine.fromSnapshot(snapshot);
      runOps(original, [...randomOps(rand, 12), "D"]); // 락으로 마무리 → 양쪽 다 스폰 직후
      if (original.currentPiece === null) continue; // 큐 소진 케이스는 재개 불가 (명세 §4)

      const page = original.capturePageState();
      const restored = SimEngine.fromPageState(snapshot, page);
      expect(stateSignature(restored)).toBe(stateSignature(original));

      const suffix = randomOps(rand, 16);
      const traceOriginal = runOps(original, suffix);
      const traceRestored = runOps(restored, suffix);
      expect(traceRestored, `seed=${seed}`).toEqual(traceOriginal);
    }
  });

  it("조작 중 미노의 위치는 체크포인트에 포함되지 않는다 (명세 §6)", () => {
    const engine = SimEngine.fromSnapshot(makeSnapshot());
    const before = engine.capturePageState();
    engine.move(1);
    engine.softDropToFloor();
    expect(engine.capturePageState()).toEqual(before); // 위치만 바뀐 상태 → 캡처 동일
  });

  it("복원 시 남은 큐 = snapshot.queue.slice(queueUsed) (notes 스키마 §4)", () => {
    const snapshot = makeSnapshot({ queue: "IJLOS" });
    const engine = SimEngine.fromSnapshot(snapshot);
    engine.hardDrop(); // I 인출 (queueUsed 1)
    engine.hardDrop(); // J 인출 (queueUsed 2)
    const page = engine.capturePageState();
    expect(page.queueUsed).toBe(2);
    const restored = SimEngine.fromPageState(snapshot, page);
    expect(restored.currentPiece?.type).toBe("J");
    expect(restored.nextView.join("")).toBe("LOS");
  });

  it("current=null인 페이지도 복원되며 큐 소진 상태를 유지한다", () => {
    const snapshot = makeSnapshot({ queue: "" });
    const engine = SimEngine.fromSnapshot(snapshot);
    engine.hardDrop();
    const page = engine.capturePageState();
    expect(page.current).toBeNull();
    const restored = SimEngine.fromPageState(snapshot, page);
    expect(restored.currentPiece).toBeNull();
    expect(restored.capturePageState()).toEqual(page);
  });
});
