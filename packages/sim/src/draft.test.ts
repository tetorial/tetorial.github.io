// S-4 드래프트 왕복 — 직렬화 → 복원 → 관측 뷰·후속 동작 동등(작업 상태 포함) (명세 §6·§7)
import { describe, expect, it } from "vitest";
import { createAuthoringSession, restoreAuthoringSession } from "./authoring.js";
import { TEST_NOTE_ID, makeReplayOrigin, makeSnapshot } from "./testing/fixtures.js";

/** 락으로 마무리 → 조작 중 미노가 스폰 위치에 있어 복원 시 완전 동등이 성립 */
function buildSession() {
  const snapshot = makeSnapshot({ queue: "IJLOSZTIJLOSZT" });
  const s = createAuthoringSession({
    origin: makeReplayOrigin({ frame: 100 }),
    snapshot,
    noteId: TEST_NOTE_ID,
  });
  s.controls.move(1);
  s.controls.rotate("cw");
  s.controls.hardDrop();
  s.beginStroke({ kind: "cell", v: "G" });
  s.strokeTo({ x: 0, y: 0 });
  s.endStroke();
  s.beginStroke({ kind: "highlight" });
  s.strokeTo({ x: 3, y: 0 });
  s.endStroke();
  s.addPage("A");
  s.controls.hardDrop(); // 마지막 조작 = 락 → 스폰 위치의 미노
  return s;
}

describe("S-4 드래프트 왕복", () => {
  it("복원 세션의 관측 뷰·페이지·언두 가용성이 원본과 동등", () => {
    const s = buildSession();
    const draft = s.serialize();
    const r = restoreAuthoringSession(draft);

    expect(r.work).toEqual(s.work);
    expect(r.pages).toEqual(s.pages);
    expect(r.selectedPageId).toBe(s.selectedPageId);
    expect(r.dirty).toBe(s.dirty);
    expect(r.canUndo).toBe(s.canUndo);
    expect(r.canRedo).toBe(s.canRedo);
  });

  it("직렬화는 무손실(멱등) — 복원 후 재직렬화가 원본 드래프트와 동일", () => {
    const s = buildSession();
    const draft = s.serialize();
    const r = restoreAuthoringSession(draft);
    expect(r.serialize()).toEqual(draft);
  });

  it("복원 후 동일 후속 조작이 동일 결과를 낸다 (락·언두)", () => {
    const s = buildSession();
    const r = restoreAuthoringSession(s.serialize());

    const i1 = s.controls.hardDrop();
    const i2 = r.controls.hardDrop();
    expect(i2).toEqual(i1);
    expect(r.work).toEqual(s.work);

    s.undo();
    r.undo();
    expect(r.work).toEqual(s.work);
  });

  it("페이지로 만들지 않은 작업 중 보드도 드래프트에서 살아남는다", () => {
    const s = createAuthoringSession({
      origin: makeReplayOrigin(),
      snapshot: makeSnapshot(),
      noteId: TEST_NOTE_ID,
    });
    s.beginStroke({ kind: "cell", v: "D" });
    s.strokeTo({ x: 2, y: 0 });
    s.endStroke();
    // addPage 하지 않음
    const r = restoreAuthoringSession(s.serialize());
    expect(r.pages.length).toBe(0);
    expect(r.work.board).toEqual(s.work.board);
    expect(r.work.board[0]?.[2]).toBe("D");
  });
});
