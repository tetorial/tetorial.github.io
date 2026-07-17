// S-9 드래프트 API 소멸 — 드래프트 영속 사슬 제거 후 공개 표면 고정 (m4a §2, #42 #49)
import { describe, expect, it } from "vitest";
import * as sim from "./index.js";
import { TEST_NOTE_ID, makeReplayOrigin, makeSnapshot } from "./testing/fixtures.js";

describe("S-9 드래프트 API 소멸", () => {
  it("S-9 index 공개 표면에 restoreAuthoringSession·serialize가 없다", () => {
    expect("restoreAuthoringSession" in sim).toBe(false);
    expect("serialize" in sim).toBe(false);
  });

  it('S-9 createAuthoringSession 인스턴스에 "serialize" 멤버가 없다', () => {
    const session = sim.createAuthoringSession({
      origin: makeReplayOrigin(),
      snapshot: makeSnapshot(),
      noteId: TEST_NOTE_ID,
    });
    expect("serialize" in session).toBe(false);
  });
});
