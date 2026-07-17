// 수용 기준 I-1 ~ I-6 — 엔진 mock의 호출 기록으로 검증 (구명세 input §5).
import { describe, expect, it } from "vitest";
import { createInput } from "./core.js";
import type { EngineControls, MetaAction } from "./types.js";

/** 호출을 순서대로 기록하는 엔진 mock. currentPiece는 큐 상태 시뮬레이션용 필드 */
class RecordingEngine implements EngineControls {
  calls: string[] = [];
  currentPiece: object | null = {};

  move(dir: -1 | 1): boolean {
    this.calls.push(`move(${dir})`);
    return true;
  }
  moveToWall(dir: -1 | 1): boolean {
    this.calls.push(`moveToWall(${dir})`);
    return true;
  }
  moveDown(): boolean {
    this.calls.push("moveDown");
    return true;
  }
  softDropToFloor(): boolean {
    this.calls.push("softDropToFloor");
    return true;
  }
  rotate(dir: "cw" | "ccw" | "180"): boolean {
    this.calls.push(`rotate(${dir})`);
    return true;
  }
  swapHold(): boolean {
    this.calls.push("swapHold");
    return true;
  }
  hardDrop(): void {
    this.calls.push("hardDrop");
  }
}

const count = (calls: readonly string[], name: string): number =>
  calls.filter((c) => c === name).length;

describe("I-1 DAS/ARR 타이밍", () => {
  it("keydown 즉시 1회 → das 경계 전후로 반복 시작", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 10 });
    input.press("ArrowLeft", 0);
    expect(eng.calls).toEqual(["move(-1)"]); // 즉시 1회

    input.tick(99); // das 미충전 → 반복 없음
    expect(count(eng.calls, "move(-1)")).toBe(1);

    input.tick(100); // 충전 순간이 첫 반복
    expect(count(eng.calls, "move(-1)")).toBe(2);
  });

  it("arr 간격으로 호출 수가 누적된다 (큰 틱 간격에도 결정적)", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 10 });
    input.press("ArrowRight", 0); // 즉시 1
    input.tick(130); // 충전(100) 이후 100,110,120,130 → 반복 4
    expect(count(eng.calls, "move(1)")).toBe(5);
    expect(eng.calls).not.toContain("moveToWall(1)");
  });

  it("arr === 0 → das 경과 시점에 moveToWall 1회뿐", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 0 });
    input.press("ArrowLeft", 0);
    input.tick(99);
    expect(eng.calls).toEqual(["move(-1)"]); // 아직 벽 이동 없음
    input.tick(100);
    input.tick(200); // 반복되지 않음
    expect(eng.calls).toEqual(["move(-1)", "moveToWall(-1)"]);
  });
});

describe("I-2 해제·전환", () => {
  it("keyup 즉시 반복 중단", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 10 });
    input.press("ArrowLeft", 0);
    input.tick(120); // 반복 진행 중
    const before = count(eng.calls, "move(-1)");
    input.release("ArrowLeft", 120);
    input.tick(500); // 뗀 뒤 추가 반복 없음
    expect(count(eng.calls, "move(-1)")).toBe(before);
  });

  it("반대키 last-input 우선 + 복귀 시 DAS 재충전", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 10 });
    input.press("ArrowLeft", 0); // move(-1) 즉시
    input.press("ArrowRight", 50); // last-input 우선 → move(1) 즉시, DAS 재충전
    expect(eng.calls).toEqual(["move(-1)", "move(1)"]);

    input.tick(140); // 오른쪽 DAS는 50부터 → 150에 충전, 아직 반복 없음
    expect(count(eng.calls, "move(1)")).toBe(1);

    input.release("ArrowRight", 160); // 남은 왼쪽으로 복귀 + DAS 재충전(160부터) → move(-1) 즉시
    expect(eng.calls[eng.calls.length - 1]).toBe("move(-1)");
    input.tick(259); // 왼쪽 충전은 260 → 아직 반복 없음
    const leftBefore = count(eng.calls, "move(-1)");
    input.tick(260);
    expect(count(eng.calls, "move(-1)")).toBe(leftBefore + 1); // 재충전 확인
  });

  it("event.repeat(중복 press) 무시", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng);
    input.press("KeyX", 0); // rotateCW
    input.press("KeyX", 5); // OS 반복 → 무시
    input.press("KeyX", 10);
    expect(count(eng.calls, "rotate(cw)")).toBe(1);
  });
});

describe("I-3 suspend·리셋", () => {
  it("정지 중 게임 조작 무호출", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 10 });
    input.suspend();
    input.press("ArrowLeft", 0);
    input.tick(500);
    input.press("KeyX", 500);
    expect(eng.calls).toEqual([]);
  });

  it("resume 후 신규 입력만 유효 (정지 전 홀드 키 비복원)", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 10 });
    input.press("ArrowLeft", 0); // 정지 전 홀드
    input.suspend();
    input.resume();
    input.tick(500); // 홀드 복원 안 됨 → 반복 없음
    expect(eng.calls).toEqual(["move(-1)"]); // 정지 전 즉시 1회만
    input.press("ArrowRight", 500); // 신규 입력은 유효
    expect(eng.calls[eng.calls.length - 1]).toBe("move(1)");
  });

  it("reset(blur)으로 반복 상태 해제", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 10 });
    input.press("ArrowLeft", 0);
    input.reset();
    input.tick(500);
    expect(eng.calls).toEqual(["move(-1)"]);
  });

  it("정지 중에도 addPage 메타는 유지, undo는 정지 (§3-4)", () => {
    const eng = new RecordingEngine();
    const metas: MetaAction[] = [];
    const input = createInput(eng, undefined, { addPage: ["Enter"], undo: ["Backspace"] });
    input.onMeta((a) => metas.push(a));
    input.suspend();
    input.press("Enter", 0); // addPage → 유지
    input.press("Backspace", 0); // undo → 정지
    expect(metas).toEqual(["addPage"]);
  });
});

describe("I-4 SDF", () => {
  it("Infinity → softDropToFloor 1회 + 락 이후 새 미노 재적용", () => {
    const eng = new RecordingEngine();
    const input = createInput(
      eng,
      { sdf: Infinity },
      { softDrop: ["ArrowDown"], hardDrop: ["Space"] },
    );
    input.press("ArrowDown", 0);
    expect(count(eng.calls, "softDropToFloor")).toBe(1);
    input.tick(1000); // ∞는 틱 반복 없음
    expect(count(eng.calls, "softDropToFloor")).toBe(1);

    input.press("Space", 1000); // 하드드롭(락) — 소프트 홀드 중
    expect(eng.calls.slice(-2)).toEqual(["hardDrop", "softDropToFloor"]); // 새 미노 재적용
  });

  it("유한값 → sdfMs 간격으로 moveDown 반복 (기준 500ms/칸)", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { sdf: 5 }); // sdfMs = 500/5 = 100
    input.press("ArrowDown", 0); // 즉시 1
    input.tick(100); // +1
    input.tick(250); // +1 (200 경계)
    expect(count(eng.calls, "moveDown")).toBe(3);
  });
});

describe("I-5 리바인딩", () => {
  it("복수 키 바인딩·런타임 rebind·미바인딩 키 무시", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng);
    input.rebind({ moveLeft: ["KeyA", "KeyH"] });

    input.press("KeyA", 0);
    input.release("KeyA", 1);
    input.press("KeyH", 2); // 같은 액션의 두 번째 키
    expect(count(eng.calls, "move(-1)")).toBe(2);

    input.press("ArrowLeft", 3); // rebind로 교체되어 이제 미바인딩
    input.press("KeyQ", 4); // 원래 미바인딩
    expect(count(eng.calls, "move(-1)")).toBe(2); // 변화 없음
  });
});

describe("I-6 결정론", () => {
  it("동일 (press/release/tick, t) 열 → 동일 엔진 호출 열", () => {
    const run = (): string[] => {
      const eng = new RecordingEngine();
      const input = createInput(eng, { das: 80, arr: 12, sdf: 4 });
      const seq: Array<["p" | "r" | "t", string, number]> = [
        ["p", "ArrowLeft", 0],
        ["t", "", 90],
        ["p", "ArrowRight", 95],
        ["p", "KeyX", 100],
        ["p", "ArrowDown", 110],
        ["t", "", 400],
        ["r", "ArrowRight", 410],
        ["t", "", 700],
        ["p", "Space", 720],
        ["r", "ArrowDown", 730],
      ];
      for (const [kind, code, t] of seq) {
        if (kind === "p") input.press(code, t);
        else if (kind === "r") input.release(code, t);
        else input.tick(t);
      }
      return eng.calls;
    };
    expect(run()).toEqual(run());
  });
});
