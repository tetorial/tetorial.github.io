// 수용 기준 I-1 ~ I-6 — 엔진 mock의 호출 기록으로 검증 (구명세 input §5).
import { describe, expect, it } from "vitest";
import { createInput } from "./core.js";
import type { EngineControls, MetaAction } from "./types.js";

/**
 * 호출을 순서대로 기록하는 엔진 mock. currentPiece는 큐 상태 시뮬레이션용 필드.
 * moveToWall·softDropToFloor는 "이미 벽/바닥에 닿아 있으면 false" 를 흉내 내도록
 * #wallDir·#onFloor로 최소한의 위치 상태를 추적한다 (I-7~I-9의 재적용 고정점이
 * 실제로 수렴함을 검증하려면 이 mock도 "움직이지 않으면 false"를 반환해야 한다).
 * rotate·swapHold·hardDrop은 벽/바닥에서 미노를 이탈시킬 수 있는 디스패치이므로
 * 두 플래그를 초기화한다.
 */
class RecordingEngine implements EngineControls {
  calls: string[] = [];
  currentPiece: object | null = {};
  #wallDir: -1 | 1 | null = null;
  #onFloor = false;

  move(dir: -1 | 1): boolean {
    this.calls.push(`move(${dir})`);
    this.#wallDir = null;
    return true;
  }
  moveToWall(dir: -1 | 1): boolean {
    this.calls.push(`moveToWall(${dir})`);
    const moved = this.#wallDir !== dir;
    this.#wallDir = dir;
    return moved;
  }
  moveDown(): boolean {
    this.calls.push("moveDown");
    return true;
  }
  softDropToFloor(): boolean {
    this.calls.push("softDropToFloor");
    const moved = !this.#onFloor;
    this.#onFloor = true;
    return moved;
  }
  rotate(dir: "cw" | "ccw" | "180"): boolean {
    this.calls.push(`rotate(${dir})`);
    this.#wallDir = null;
    this.#onFloor = false;
    return true;
  }
  swapHold(): boolean {
    this.calls.push("swapHold");
    this.#wallDir = null;
    this.#onFloor = false;
    return true;
  }
  hardDrop(): void {
    this.calls.push("hardDrop");
    this.#wallDir = null;
    this.#onFloor = false;
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

  it("arr === 0 → das 경과 시점에 moveToWall (다른 디스패치 없으면 재호출 없음)", () => {
    // 구 "1회뿐" 의미론은 M3-A(#41)에서 "유지 중 밀착 불변식"으로 개정됨 (I-7~I-9 참조):
    // 이 테스트는 디스패치가 없는 유휴 tick 구간에서 재호출이 없음을 확인할 뿐,
    // moveToWall이 세션 내 정확히 1회만 호출된다는 보장은 더 이상 아니다.
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 0 });
    input.press("ArrowLeft", 0);
    input.tick(99);
    expect(eng.calls).toEqual(["move(-1)"]); // 아직 벽 이동 없음
    input.tick(100);
    input.tick(200); // 유휴 tick — 추가 디스패치 없으므로 재호출 없음
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

describe("I-7 수평 재밀착 불변식", () => {
  it("ARR 0·DAS 충전 유지 중 회전(킥 포함)으로 벽에서 이탈하면 그 즉시 재밀착 (#41)", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 0 });
    input.press("ArrowLeft", 0); // move(-1)
    input.tick(100); // DAS 충전 → moveToWall(-1)
    expect(eng.calls).toEqual(["move(-1)", "moveToWall(-1)"]);

    input.press("KeyX", 150); // 회전(킥) → 벽 이탈 시뮬레이션
    expect(eng.calls.slice(-2)).toEqual(["rotate(cw)", "moveToWall(-1)"]);
  });

  it("ARR 0·DAS 충전 유지 중 홀드로 벽에서 이탈하면 그 즉시 재밀착", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 0 });
    input.press("ArrowRight", 0); // move(1)
    input.tick(100); // DAS 충전 → moveToWall(1)
    expect(eng.calls).toEqual(["move(1)", "moveToWall(1)"]);

    input.press("KeyC", 150); // swapHold(새 미노) → 벽 이탈 시뮬레이션
    expect(eng.calls.slice(-2)).toEqual(["swapHold", "moveToWall(1)"]);
  });

  it("DAS 미충전 중에는 회전해도 재적용 없음 (재적용 가드)", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 0 });
    input.press("ArrowLeft", 0); // move(-1)
    input.press("KeyX", 50); // DAS(100) 미충전 시점의 회전
    expect(eng.calls).toEqual(["move(-1)", "rotate(cw)"]); // moveToWall 없음
  });
});

describe("I-8 락 후 재밀착", () => {
  it("ARR 0·방향 홀드 중 하드드롭 → 새 미노 스폰 직후 즉시 벽으로 이동", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 0 });
    input.press("ArrowLeft", 0); // move(-1)
    input.tick(100); // DAS 충전 → moveToWall(-1)
    expect(eng.calls).toEqual(["move(-1)", "moveToWall(-1)"]);

    input.press("Space", 150); // 하드드롭(락) → 새 미노 스폰
    expect(eng.calls.slice(-2)).toEqual(["hardDrop", "moveToWall(-1)"]);
  });
});

describe("I-9 수직 재밀착 불변식", () => {
  it("SDF ∞ 홀드 중 회전으로 부양하면 직후 즉시 바닥 재밀착", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { sdf: Infinity });
    input.press("ArrowDown", 0); // softDropToFloor
    expect(eng.calls).toEqual(["softDropToFloor"]);

    input.press("KeyX", 10); // 회전(킥) → 바닥 부양 시뮬레이션
    expect(eng.calls.slice(-2)).toEqual(["rotate(cw)", "softDropToFloor"]);
  });

  it("소프트드롭 미보유 중에는 회전해도 바닥 재적용 없음", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { sdf: Infinity });
    input.press("KeyX", 0); // 소프트드롭 홀드 없음
    expect(eng.calls).toEqual(["rotate(cw)"]); // softDropToFloor 없음
  });
});

describe("I-10 기존 경로 무변화", () => {
  it("ARR > 0 경로는 회전 후 즉시가 아니라 다음 ARR 틱에 이동한다", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { das: 100, arr: 10 });
    input.press("ArrowLeft", 0); // move(-1) 즉시
    input.tick(100); // DAS 충전 → 첫 ARR 반복
    const movesBeforeRotate = count(eng.calls, "move(-1)");
    expect(eng.calls).not.toContain("moveToWall(-1)");

    input.press("KeyX", 105); // 회전 — arr > 0 이므로 즉시 재적용 없음
    expect(eng.calls[eng.calls.length - 1]).toBe("rotate(cw)");
    expect(eng.calls).not.toContain("moveToWall(-1)");

    input.tick(110); // 다음 ARR 틱에 정상 이동 (동작 불변)
    expect(count(eng.calls, "move(-1)")).toBeGreaterThan(movesBeforeRotate);
  });

  it("SDF 유한 반복 경로는 회전 후에도 즉시 재적용 없이 기존 sdfMs 간격 유지", () => {
    const eng = new RecordingEngine();
    const input = createInput(eng, { sdf: 5 }); // sdfMs = 500/5 = 100
    input.press("ArrowDown", 0); // moveDown 즉시 1
    input.press("KeyX", 10); // 회전 — floor mode 아니므로 즉시 재적용 없음
    expect(eng.calls).toEqual(["moveDown", "rotate(cw)"]);

    input.tick(100); // 기존 sdfMs 간격대로 정상 진행 (동작 불변)
    expect(count(eng.calls, "moveDown")).toBe(2);
  });
});
