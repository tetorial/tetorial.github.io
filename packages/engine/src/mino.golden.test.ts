// E-5 미노 정의 대조: 전 미노 × 전 회전 상태의 셀 오프셋·스폰 위치가 triangle과 일치
import type { PieceType } from "@tetorial/types";
import { describe, expect, it } from "vitest";
import triangleData from "./data/triangle-data.json";
import { SimEngine } from "./sim-engine.js";
import { makeSnapshot } from "./testing/fixtures.js";
import { TriangleSim, tetrominoes } from "./testing/triangle-harness.js";

const PIECES: readonly PieceType[] = ["I", "J", "L", "O", "S", "T", "Z"];

describe("E-5 미노 정의 대조", () => {
  it("동봉 형상 데이터(w·회전별 블록)가 @haelp/teto tetrominoes와 deep equal", () => {
    for (const piece of PIECES) {
      const sym = piece.toLowerCase() as keyof typeof triangleData.tetrominoes;
      const ours = triangleData.tetrominoes[sym];
      const theirs = tetrominoes[sym as keyof typeof tetrominoes];
      expect(theirs, `${sym} 형상이 teto에 존재`).toBeDefined();
      expect(ours.matrix, `${sym}.matrix`).toEqual(theirs?.matrix);
    }
  });

  it.each(PIECES)("%s 스폰 위치·회전·절대 셀이 triangle 스폰과 일치", (piece) => {
    const snapshot = makeSnapshot({ current: piece, queue: "IJLO" });
    const mine = SimEngine.fromSnapshot(snapshot).currentPiece;
    const triangle = new TriangleSim(snapshot);
    const falling = triangle.engine.falling;
    expect(mine).not.toBeNull();
    expect(mine?.type).toBe(falling.symbol.toUpperCase());
    expect(mine?.x).toBe(falling.location[0]);
    expect(mine?.y).toBe(Math.floor(falling.location[1])); // 원문 +2.04의 floor = 우리 정수 y
    expect(mine?.rot).toBe(falling.rotation);
    const theirCells = falling.absoluteBlocks.map(([x, y]) => ({ x, y }));
    expect(mine?.cells).toEqual(theirCells);
  });

  it.each(PIECES)("%s 전 회전 상태의 절대 셀이 triangle absoluteAt과 일치", (piece) => {
    const snapshot = makeSnapshot({ current: piece, queue: "IJLO" });
    const mine = SimEngine.fromSnapshot(snapshot);
    const triangle = new TriangleSim(snapshot);
    // 스폰 위치(공중)에서 제자리 4회전 순회 — 빈 보드라 킥 없이 회전 상태만 바뀐다
    for (const step of [0, 1, 2, 3]) {
      const cur = mine.currentPiece;
      const falling = triangle.engine.falling;
      expect(cur?.rot, `${piece} step ${step}`).toBe(falling.rotation);
      expect(cur?.cells).toEqual(falling.absoluteBlocks.map(([x, y]) => ({ x, y })));
      mine.rotate("cw");
      triangle.engine.press("rotateCW");
    }
  });
});
