// S-2 불러오기 규범(3경로 교차 검증) · S-5 파생 진입(비정규화·큐 소진) (명세 §7)
// M1b-1·M1b-2 파생 origin 복사 (sim-m1b §2·§4)
import { SimEngine } from "@tetorial/engine";
import { describe, expect, it } from "vitest";
import { createAuthoringSession } from "./authoring.js";
import { deriveSnapshotFromPage } from "./derive.js";
import { OverlayBuffer } from "./overlays.js";
import {
  TEST_NOTE_ID,
  makeReplayOrigin,
  makeSnapshot,
  respecSnapshotFromPage,
  testNoteId,
} from "./testing/fixtures.js";
import { buildWorkView } from "./work.js";

describe("S-2 불러오기 규범 (3경로 교차 검증)", () => {
  it("loadPageIntoWork == notes §4 재시뮬레이션 정의 == deriveSnapshotFromPage 결과", () => {
    const snapshot = makeSnapshot({ queue: "IJLOSZTIJLOSZT" });
    const s = createAuthoringSession({
      origin: makeReplayOrigin(),
      snapshot,
      noteId: TEST_NOTE_ID,
    });
    s.controls.hardDrop();
    s.controls.hardDrop();
    s.beginStroke({ kind: "cell", v: "G" });
    s.strokeTo({ x: 0, y: 0 });
    s.endStroke();
    const page = s.addPage();
    const note = s.toNote();

    // 경로 1: 세션 API로 불러오기
    s.loadPageIntoWork(page.id);
    const view1 = s.work;

    // 경로 2: notes §4 재시뮬레이션 규범을 문자 그대로 조립한 독립 오라클
    const eng2 = SimEngine.fromSnapshot(respecSnapshotFromPage(note, page.id));
    const view2 = buildWorkView(eng2, OverlayBuffer.empty());

    // 경로 3: 파생 스냅샷 → fromSnapshot
    const d = deriveSnapshotFromPage(note, page.id);
    expect("error" in d).toBe(false);
    if ("error" in d) return;
    const eng3 = SimEngine.fromSnapshot(d.snapshot);
    const view3 = buildWorkView(eng3, OverlayBuffer.empty());

    expect(view1).toEqual(view2);
    expect(view2).toEqual(view3);
  });

  it("M1b-1 파생 origin은 원본 노트 origin의 깊은 복사 (note 참조 origin 소멸 — D-8)", () => {
    const snapshot = makeSnapshot();
    const origin = makeReplayOrigin({ round: 2, player: 1, frame: 841 });
    const s = createAuthoringSession({ origin, snapshot, noteId: TEST_NOTE_ID });
    s.controls.hardDrop();
    const page = s.addPage();
    const note = s.toNote();
    const d = deriveSnapshotFromPage(note, page.id);
    if ("error" in d) throw new Error("예상치 못한 큐 소진");
    // 값은 원본 origin과 동일하되, 참조는 분리되어야 한다
    expect(d.origin).toEqual({ type: "replay", round: 2, player: 1, frame: 841 });
    expect(d.origin).not.toBe(note.origin);
  });
});

describe("S-5 파생 진입", () => {
  it("비정규화 — 파생 후 원본 노트를 변형·삭제해도 새 세션 무영향", () => {
    const snapshot = makeSnapshot({ queue: "IJLOSZTIJLOSZT" });
    const s = createAuthoringSession({
      origin: makeReplayOrigin(),
      snapshot,
      noteId: TEST_NOTE_ID,
    });
    s.controls.hardDrop();
    s.beginStroke({ kind: "cell", v: "G" });
    s.strokeTo({ x: 0, y: 0 });
    s.endStroke();
    const page = s.addPage();
    const note = s.toNote();

    const d = deriveSnapshotFromPage(note, page.id);
    if ("error" in d) throw new Error("예상치 못한 큐 소진");
    const derived = createAuthoringSession({
      origin: d.origin,
      snapshot: d.snapshot,
      noteId: testNoteId(2),
    });
    const before = JSON.stringify(derived.work);

    // 원본 노트를 파괴적으로 변형·삭제
    note.snapshot.queue = "ZZZZ";
    if (note.pages[0]) note.pages[0].state.board.rows = ["ZZZZZZZZZZ"];
    note.pages.length = 0;

    expect(JSON.stringify(derived.work)).toBe(before);
  });

  it("M1b-2 가짜 복사 검출 — 원본 노트(origin 포함) 깊은 변형·삭제에도 파생 결과 무영향", () => {
    const snapshot = makeSnapshot({ queue: "IJLOSZTIJLOSZT" });
    const s = createAuthoringSession({
      origin: makeReplayOrigin({ round: 1, frame: 100 }),
      snapshot,
      noteId: TEST_NOTE_ID,
    });
    s.controls.hardDrop();
    const page = s.addPage();
    const note = s.toNote();

    const d = deriveSnapshotFromPage(note, page.id);
    if ("error" in d) throw new Error("예상치 못한 큐 소진");
    const originBefore = JSON.stringify(d.origin);
    const snapshotBefore = JSON.stringify(d.snapshot);

    // origin 필드까지 깊이 변형 — 참조를 그대로 돌려주면 여기서 파생 결과가 오염된다
    if (note.origin.type === "replay") {
      note.origin.round = 99;
      note.origin.frame = 99999;
    }
    note.snapshot.queue = "ZZZZ";
    note.snapshot.ruleset = { preset: "srs" };
    if (note.pages[0]) {
      note.pages[0].state.board.rows = ["ZZZZZZZZZZ"];
      note.pages[0].state.counters.b2b = 42;
    }
    note.pages.length = 0; // 삭제

    expect(JSON.stringify(d.origin)).toBe(originBefore);
    expect(JSON.stringify(d.snapshot)).toBe(snapshotBefore);
  });

  it("큐 소진 페이지는 진입 불가 오류를 반환한다", () => {
    const snapshot = makeSnapshot({ queue: "" }); // current T, 다음 없음
    const s = createAuthoringSession({
      origin: makeReplayOrigin(),
      snapshot,
      noteId: TEST_NOTE_ID,
    });
    s.controls.hardDrop(); // T 락 → current null (큐 소진)
    const page = s.addPage();
    expect(page.state.current).toBeNull();
    const note = s.toNote();

    expect(deriveSnapshotFromPage(note, page.id)).toEqual({
      error: "queue-exhausted",
    });
  });
});
