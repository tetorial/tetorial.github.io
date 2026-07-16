// E-6 경계 동작 단위 테스트 (엔진 명세 §9)
import { describe, expect, it } from "vitest";
import { SimEngine } from "./sim-engine.js";
import { makeSnapshot } from "./testing/fixtures.js";

describe("E-6 경계 동작", () => {
  describe("큐 소진 (queueExhausted)", () => {
    it("빈 큐에서 락하면 queueExhausted=true, current=null", () => {
      const engine = SimEngine.fromSnapshot(makeSnapshot({ queue: "" }));
      const info = engine.hardDrop();
      expect(info.queueExhausted).toBe(true);
      expect(engine.currentPiece).toBeNull();
      expect(engine.nextView).toEqual([]);
    });

    it("current가 null이면 원자 조작은 전부 false, ghostCells는 null", () => {
      const engine = SimEngine.fromSnapshot(makeSnapshot({ queue: "" }));
      engine.hardDrop();
      expect(engine.move(-1)).toBe(false);
      expect(engine.moveToWall(1)).toBe(false);
      expect(engine.moveDown()).toBe(false);
      expect(engine.softDropToFloor()).toBe(false);
      expect(engine.rotate("cw")).toBe(false);
      expect(engine.swapHold()).toBe(false);
      expect(engine.ghostCells()).toBeNull();
    });

    it("current가 null이면 lock·hardDrop은 던진다", () => {
      const engine = SimEngine.fromSnapshot(makeSnapshot({ queue: "" }));
      engine.hardDrop();
      expect(() => engine.lock()).toThrow(/큐 소진/);
      expect(() => engine.hardDrop()).toThrow(/큐 소진/);
    });

    it("마지막 미노 락 직전에는 queueExhausted=false", () => {
      const engine = SimEngine.fromSnapshot(makeSnapshot({ queue: "I" }));
      expect(engine.hardDrop().queueExhausted).toBe(false);
      expect(engine.hardDrop().queueExhausted).toBe(true);
    });
  });

  describe("queueUsed 산술", () => {
    it("락마다 1 소비", () => {
      const engine = SimEngine.fromSnapshot(makeSnapshot({ queue: "IJLOS" }));
      expect(engine.capturePageState().queueUsed).toBe(0);
      engine.hardDrop();
      expect(engine.capturePageState().queueUsed).toBe(1);
      engine.hardDrop();
      expect(engine.capturePageState().queueUsed).toBe(2);
    });

    it("홀드 첫 사용은 큐에서 1 소비, 재교환은 소비 없음", () => {
      const engine = SimEngine.fromSnapshot(
        makeSnapshot({ current: "T", queue: "IJLOS", hold: null }),
      );
      expect(engine.swapHold()).toBe(true); // T 보관, I 인출 (소비 1)
      expect(engine.capturePageState().queueUsed).toBe(1);
      expect(engine.holdView).toEqual({ piece: "T", locked: true });
      expect(engine.currentPiece?.type).toBe("I");

      expect(engine.swapHold()).toBe(false); // holdLocked
      engine.hardDrop(); // I 락, J 인출 → holdLocked 해제
      expect(engine.holdView.locked).toBe(false);
      expect(engine.capturePageState().queueUsed).toBe(2);

      expect(engine.swapHold()).toBe(true); // J ↔ T 교환 (소비 없음)
      expect(engine.currentPiece?.type).toBe("T");
      expect(engine.holdView.piece).toBe("J");
      expect(engine.capturePageState().queueUsed).toBe(2);
    });

    it("홀드 첫 사용 시 큐가 비어 있으면 current=null (큐 소진과 동일 상태)", () => {
      const engine = SimEngine.fromSnapshot(makeSnapshot({ current: "T", queue: "", hold: null }));
      expect(engine.swapHold()).toBe(true);
      expect(engine.currentPiece).toBeNull();
      expect(engine.holdView).toEqual({ piece: "T", locked: true });
    });

    it("fromPageState의 queueUsed가 큐 길이를 넘으면 던진다", () => {
      const snapshot = makeSnapshot({ queue: "IJ" });
      const engine = SimEngine.fromSnapshot(snapshot);
      const page = engine.capturePageState();
      expect(() => SimEngine.fromPageState(snapshot, { ...page, queueUsed: 3 })).toThrow(
        /queueUsed/,
      );
    });
  });

  describe("탑아웃", () => {
    it("다음 미노의 스폰 셀이 점유돼 있으면 락 결과 toppedOut=true", () => {
      // T 스폰 셀 (4,22)·(3,21)·(4,21)·(5,21) 중 하나를 점유시킨 뒤 락
      const engine = SimEngine.fromSnapshot(makeSnapshot({ current: "I", queue: "T" }));
      engine.setCells([{ x: 4, y: 22, v: "G" }]);
      engine.moveToWall(-1); // I를 비켜 세운다
      const info = engine.hardDrop();
      expect(info.toppedOut).toBe(true);
      expect(engine.currentPiece?.type).toBe("T"); // 겹친 채 유지 (§7)
      expect(() => engine.lock()).toThrow(/overlap/);
    });

    it("스폰 셀이 비어 있으면 toppedOut=false", () => {
      const engine = SimEngine.fromSnapshot(makeSnapshot({ current: "I", queue: "T" }));
      expect(engine.hardDrop().toppedOut).toBe(false);
    });
  });

  describe("setCells의 미노 스폰 리셋·스폰 점유 시 락 거부 (§7)", () => {
    it("조작 중 미노와 겹치는 셀을 그리면 스폰 위치로 조용히 리셋", () => {
      const engine = SimEngine.fromSnapshot(makeSnapshot({ current: "T" }));
      const spawn = engine.currentPiece;
      engine.move(1);
      engine.move(1);
      engine.softDropToFloor();
      const moved = engine.currentPiece;
      expect(moved).not.toEqual(spawn);
      const target = moved?.cells[0];
      if (!target) throw new Error("조작 중 미노 없음");
      engine.setCells([{ x: target.x, y: target.y, v: "G" }]);
      expect(engine.currentPiece).toEqual(spawn); // 타입 그대로, 위치·회전 스폰 리셋
    });

    it("스폰 위치마저 점유면 겹친 채 유지하고 lock()·hardDrop()은 overlap으로 거부", () => {
      const engine = SimEngine.fromSnapshot(makeSnapshot({ current: "T" }));
      engine.softDropToFloor();
      // 스폰 셀 4개 + 현재 위치 셀 1개를 동시에 점유
      const spawnCells = [
        { x: 4, y: 22, v: "G" as const },
        { x: 3, y: 21, v: "G" as const },
        { x: 4, y: 21, v: "G" as const },
        { x: 5, y: 21, v: "G" as const },
      ];
      const cur = engine.currentPiece?.cells[0];
      if (!cur) throw new Error("조작 중 미노 없음");
      engine.setCells([...spawnCells, { x: cur.x, y: cur.y, v: "G" }]);
      expect(() => engine.lock()).toThrow(/overlap/);
      expect(() => engine.hardDrop()).toThrow(/overlap/);
      // 지우개로 해소하면 다시 락 가능 (사용자 해소 경로)
      engine.setCells(spawnCells.map((c) => ({ ...c, v: "_" as const })));
      expect(engine.lock().queueExhausted).toBe(false);
    });

    it("좌표 범위 밖 setCells는 던진다", () => {
      const engine = SimEngine.fromSnapshot(makeSnapshot());
      expect(() => engine.setCells([{ x: 10, y: 0, v: "G" }])).toThrow(RangeError);
      expect(() => engine.setCells([{ x: 0, y: 40, v: "G" }])).toThrow(RangeError);
      expect(() => engine.setCells([{ x: -1, y: 0, v: "G" }])).toThrow(RangeError);
    });

    it("setCells는 라인 클리어를 유발하지 않고 큐·홀드·카운터를 바꾸지 않는다", () => {
      const engine = SimEngine.fromSnapshot(makeSnapshot({ counters: { b2b: 3, combo: 2 } }));
      const before = engine.capturePageState();
      engine.setCells(
        Array.from({ length: 10 }, (_, x) => ({ x, y: 0, v: "G" as const })), // 가득 찬 행
      );
      const after = engine.capturePageState();
      expect(after.board.rows[0]).toBe("GGGGGGGGGG"); // 클리어 안 됨
      expect(after.counters).toEqual(before.counters);
      expect(after.queueUsed).toBe(before.queueUsed);
      expect(after.hold).toBe(before.hold);
    });
  });

  describe("룰셋 경계", () => {
    it("allow180=false(srs 프리셋)면 rotate('180')은 항상 false", () => {
      const engine = SimEngine.fromSnapshot(makeSnapshot({ ruleset: { preset: "srs" } }));
      expect(engine.rotate("180")).toBe(false);
      const srsPlus = SimEngine.fromSnapshot(makeSnapshot({ ruleset: { preset: "srs+" } }));
      expect(srsPlus.rotate("180")).toBe(true);
    });

    it("srs 프리셋에 allow180 재정의를 주면 180이 켜진다", () => {
      const engine = SimEngine.fromSnapshot(
        makeSnapshot({ ruleset: { preset: "srs", allow180: true } }),
      );
      expect(engine.rotate("180")).toBe(true);
    });

    it("v1 미지원 spinBonuses는 명시적으로 거부한다 (D-10 차단)", () => {
      expect(() =>
        SimEngine.fromSnapshot(makeSnapshot({ ruleset: { preset: "srs+", spinBonuses: "all" } })),
      ).toThrow(/미지원 spinBonuses/);
    });
  });

  describe("카운터 원값 규약 (D-9)", () => {
    it("스냅샷의 -1 카운터가 그대로 유지되고, 클리어 없는 락은 combo만 -1로 만든다", () => {
      const engine = SimEngine.fromSnapshot(makeSnapshot({ counters: { b2b: 5, combo: 3 } }));
      const info = engine.hardDrop(); // 빈 보드 → 클리어 없음
      expect(info.counters).toEqual({ b2b: 5, combo: -1 });
    });

    it("일반 싱글 클리어는 combo 증가 + b2b 리셋(-1)", () => {
      const engine = SimEngine.fromSnapshot(
        makeSnapshot({
          current: "O",
          board: { width: 10, rows: ["GGGGGGGG__"] },
          counters: { b2b: 2, combo: -1 },
        }),
      );
      engine.moveToWall(1); // O를 우측 벽으로 → (8,9)열 채움
      const info = engine.hardDrop();
      expect(info.linesCleared).toBe(1);
      expect(info.counters).toEqual({ b2b: -1, combo: 0 });
    });
  });
});
