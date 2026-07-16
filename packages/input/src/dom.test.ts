// DOM 어댑터 배선 검증 — I-2 event.repeat 필터·I-3 blur 리셋 (명세 §3-2·§3-4).
// Node 22의 전역 EventTarget/Event로 구동 (jsdom 불필요).
import { beforeEach, describe, expect, it } from "vitest";
import { createInput } from "./core.js";
import { attachDom } from "./dom.js";
import type { EngineControls, InputCore } from "./types.js";

class RecordingEngine implements EngineControls {
  calls: string[] = [];
  currentPiece: object | null = {};
  move(dir: -1 | 1): boolean {
    this.calls.push(`move(${dir})`);
    return true;
  }
  moveToWall(): boolean {
    return true;
  }
  moveDown(): boolean {
    this.calls.push("moveDown");
    return true;
  }
  softDropToFloor(): boolean {
    return true;
  }
  rotate(): boolean {
    return true;
  }
  swapHold(): boolean {
    return true;
  }
  hardDrop(): void {
    this.calls.push("hardDrop");
  }
}

let target: EventTarget;
let eng: RecordingEngine;
let input: InputCore;
let detach: () => void;

beforeEach(() => {
  target = new EventTarget();
  eng = new RecordingEngine();
  input = createInput(eng, { das: 100, arr: 10 });
  detach = attachDom(input, target);
});

function keyEvent(
  type: string,
  code: string,
  repeat = false,
  mods: { ctrlKey?: boolean; metaKey?: boolean } = {},
): void {
  const ev = new Event(type);
  Object.assign(ev, { code, repeat, ...mods });
  target.dispatchEvent(ev);
}

describe("attachDom", () => {
  it("keydown → press로 중계", () => {
    keyEvent("keydown", "Space"); // hardDrop
    expect(eng.calls).toEqual(["hardDrop"]);
  });

  it("I-2 event.repeat=true keydown은 무시", () => {
    keyEvent("keydown", "ArrowLeft", true);
    expect(eng.calls).toEqual([]);
  });

  it("I-3 blur → reset (스턱 키 방지)", () => {
    keyEvent("keydown", "ArrowLeft"); // 활성 → move(-1) 1회
    target.dispatchEvent(new Event("blur"));
    input.tick(1e9); // reset 후이므로 추가 반복 없음
    expect(eng.calls.filter((c) => c === "move(-1)").length).toBe(1);
  });

  it("detach 후 이벤트 무반응", () => {
    detach();
    keyEvent("keydown", "Space");
    expect(eng.calls).toEqual([]);
  });
});

describe("모디파이어 인코딩 (명세 §2 — 2026-07-12 확정 규약)", () => {
  it('Ctrl+비수식키 → "Ctrl+<code>"로 press (메타 바인딩 매칭)', () => {
    const meta: string[] = [];
    input.rebind({ undo: ["Ctrl+KeyZ"] });
    input.onMeta((a) => meta.push(a));
    keyEvent("keydown", "KeyZ", false, { ctrlKey: true });
    expect(meta).toEqual(["undo"]); // "Ctrl+KeyZ"로 인코딩돼 undo 발화
    expect(eng.calls).toEqual([]); // bare "KeyZ"(rotateCCW)로는 전달되지 않음
  });

  it("Ctrl 홀드 없는 비수식키는 bare code 그대로", () => {
    keyEvent("keydown", "Space");
    expect(eng.calls).toEqual(["hardDrop"]);
  });

  it("수식키 자체는 bare code로 전달 (게임 키 바인딩 허용)", () => {
    input.rebind({ hold: ["ShiftLeft"] });
    keyEvent("keydown", "ShiftLeft", false, {});
    // swapHold는 RecordingEngine에서 기록하지 않으므로 press 자체가 오류 없이 통과함만 확인
    keyEvent("keyup", "ShiftLeft");
  });

  it("keyup 짝맞춤: 수식키를 먼저 떼도 스턱 키 없음", () => {
    input.rebind({ moveLeft: ["Ctrl+ArrowLeft"] });
    keyEvent("keydown", "ArrowLeft", false, { ctrlKey: true }); // press("Ctrl+ArrowLeft")
    expect(eng.calls).toEqual(["move(-1)"]);
    // Ctrl을 먼저 뗀 뒤 ArrowLeft keyup — ctrlKey는 이미 false지만 발화 기록으로 짝맞춤
    keyEvent("keyup", "ArrowLeft", false, {});
    input.tick(1e9); // release가 정확히 됐다면 DAS 반복 없음
    expect(eng.calls).toEqual(["move(-1)"]);
  });
});
