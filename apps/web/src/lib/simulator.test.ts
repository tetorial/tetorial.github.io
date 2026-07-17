import { describe, it, expect } from "vitest";
import { DEFAULT_HANDLING } from "@tetorial/input";
import { resolveKeys } from "./settings.js";
import * as simulatorModule from "./simulator.js";
import { createSimulator } from "./simulator.js";
import { makeSnapshot } from "./testing.js";

const KEYS = resolveKeys(null);
const BRANCH = {
  origin: { type: "replay" as const, round: 0, player: 0, frame: 841 },
  snapshot: makeSnapshot(),
};

// AW-5 시뮬레이터 종단.
// 업로드 경로(AW-5 PUT·AW-7 편집 키)는 수집함 경유로 재설계돼 note-collection.test.ts로 옮겼다(m3b §2).
describe("AW-5 시뮬레이터 배선(키 조작 + 포커스 정지)", () => {
  it("AW-5 input 키 조작이 저작 세션 엔진을 움직인다", () => {
    const sim = createSimulator({ handling: DEFAULT_HANDLING, keys: KEYS, init: BRANCH });
    const x0 = sim.session.work.current?.x ?? 0;
    sim.input.press("ArrowLeft", 0); // keydown 즉시 move(-1) 1회
    const x1 = sim.session.work.current?.x ?? 0;
    expect(x1).toBe(x0 - 1);
    sim.input.release("ArrowLeft", 0);
    sim.dispose();
  });

  it("AW-5 주석 포커스 중(suspend) 게임 키는 무시된다", () => {
    const sim = createSimulator({ handling: DEFAULT_HANDLING, keys: KEYS, init: BRANCH });
    sim.setCommentFocus(true);
    expect(sim.suspended).toBe(true);
    const x0 = sim.session.work.current?.x ?? 0;
    sim.input.press("ArrowRight", 0); // suspend 중 → move 무호출
    expect(sim.session.work.current?.x ?? 0).toBe(x0);
    sim.setCommentFocus(false);
    expect(sim.suspended).toBe(false);
    sim.input.press("ArrowRight", 10); // resume 후 신규 입력만 유효
    expect(sim.session.work.current?.x ?? 0).toBe(x0 + 1);
    sim.dispose();
  });

  it("AW-5 하드드롭 락 + addPage로 페이지 2개 조립", () => {
    const sim = createSimulator({ handling: DEFAULT_HANDLING, keys: KEYS, init: BRANCH });
    sim.input.press("Space", 0); // hardDrop → 락(언두 1단위)
    sim.input.release("Space", 0);
    sim.session.addPage("첫 배치");
    // 셀 그리기(포인터 스트로크 1회)
    sim.session.beginStroke({ kind: "cell", v: "G" });
    sim.session.strokeTo({ x: 0, y: 0 });
    sim.session.endStroke();
    sim.session.addPage("쓰레기 추가");
    expect(sim.session.pages.length).toBe(2);
    const note = sim.session.toNote();
    expect(note.pages.length).toBe(2);
    expect(note.pages[0]?.comment).toBe("첫 배치");
    sim.dispose();
  });
});

describe("M1b-5 웹 최소 배선 — 노트 id 생성·주입 (sim-m1b §6)", () => {
  it("M1b-5 generateNoteId는 [A-Za-z0-9_-]{8} 규격을 만족한다", async () => {
    const { generateNoteId } = await import("./note-id.js");
    for (let i = 0; i < 100; i++) {
      expect(generateNoteId()).toMatch(/^[A-Za-z0-9_-]{8}$/);
    }
  });

  it("M1b-5 신규 경로: 생성된 id가 주입되어 toNote().id가 규격을 만족한다", () => {
    const sim = createSimulator({ handling: DEFAULT_HANDLING, keys: KEYS, init: BRANCH });
    sim.session.addPage("p");
    expect(sim.session.toNote().id).toMatch(/^[A-Za-z0-9_-]{8}$/);
    sim.dispose();
  });

  it("M1b-5 재편집 경로: { existing }만 전달 — id·페이지가 보존된다", () => {
    const first = createSimulator({ handling: DEFAULT_HANDLING, keys: KEYS, init: BRANCH });
    first.session.addPage("원본 페이지");
    const note = first.session.toNote();
    first.dispose();

    const reedit = createSimulator({
      handling: DEFAULT_HANDLING,
      keys: KEYS,
      init: { existing: note },
    });
    expect(reedit.session.pages.length).toBe(1);
    expect(reedit.session.toNote().id).toBe(note.id);
    reedit.dispose();
  });
});

// 드래프트 영속 사슬 제거(m4a §2, #42) 후 잔재 부재를 고정한다.
describe("AW-19 웹 드래프트 잔재 소멸 — simulator", () => {
  it("AW-19 simulator 모듈에 restoreSimulator export가 없다", () => {
    expect("restoreSimulator" in simulatorModule).toBe(false);
  });
});
