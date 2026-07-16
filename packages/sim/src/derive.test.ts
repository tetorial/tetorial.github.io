// S-2 불러오기 규범(3경로 교차 검증) · S-5 파생 진입(비정규화·큐 소진) (명세 §7)
import { SimEngine } from "@tetorial/engine";
import { describe, expect, it } from "vitest";
import { createAuthoringSession } from "./authoring.js";
import { deriveSnapshotFromPage } from "./derive.js";
import { OverlayBuffer } from "./overlays.js";
import {
  TEST_CLIENT_ID,
  makeReplayOrigin,
  makeSnapshot,
  respecSnapshotFromPage,
} from "./testing/fixtures.js";
import { buildWorkView } from "./work.js";

describe("S-2 불러오기 규범 (3경로 교차 검증)", () => {
  it("loadPageIntoWork == notes §4 재시뮬레이션 정의 == deriveSnapshotFromPage 결과", () => {
    const snapshot = makeSnapshot({ queue: "IJLOSZTIJLOSZT" });
    const s = createAuthoringSession({ origin: makeReplayOrigin(), snapshot });
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
    const d = deriveSnapshotFromPage(note, page.id, TEST_CLIENT_ID);
    expect("error" in d).toBe(false);
    if ("error" in d) return;
    const eng3 = SimEngine.fromSnapshot(d.snapshot);
    const view3 = buildWorkView(eng3, OverlayBuffer.empty());

    expect(view1).toEqual(view2);
    expect(view2).toEqual(view3);
  });

  it("파생 origin은 note 참조 provenance를 담는다", () => {
    const snapshot = makeSnapshot();
    const s = createAuthoringSession({ origin: makeReplayOrigin(), snapshot });
    s.controls.hardDrop();
    const page = s.addPage();
    const note = s.toNote();
    const d = deriveSnapshotFromPage(note, page.id, TEST_CLIENT_ID);
    if ("error" in d) throw new Error("예상치 못한 큐 소진");
    expect(d.origin).toEqual({
      type: "note",
      clientId: TEST_CLIENT_ID,
      noteId: note.id,
      pageId: page.id,
    });
  });
});

describe("S-5 파생 진입", () => {
  it("비정규화 — 파생 후 원본 노트를 변형·삭제해도 새 세션 무영향", () => {
    const snapshot = makeSnapshot({ queue: "IJLOSZTIJLOSZT" });
    const s = createAuthoringSession({ origin: makeReplayOrigin(), snapshot });
    s.controls.hardDrop();
    s.beginStroke({ kind: "cell", v: "G" });
    s.strokeTo({ x: 0, y: 0 });
    s.endStroke();
    const page = s.addPage();
    const note = s.toNote();

    const d = deriveSnapshotFromPage(note, page.id, TEST_CLIENT_ID);
    if ("error" in d) throw new Error("예상치 못한 큐 소진");
    const derived = createAuthoringSession({ origin: d.origin, snapshot: d.snapshot });
    const before = JSON.stringify(derived.work);

    // 원본 노트를 파괴적으로 변형·삭제
    note.snapshot.queue = "ZZZZ";
    if (note.pages[0]) note.pages[0].state.board.rows = ["ZZZZZZZZZZ"];
    note.pages.length = 0;

    expect(JSON.stringify(derived.work)).toBe(before);
  });

  it("큐 소진 페이지는 진입 불가 오류를 반환한다", () => {
    const snapshot = makeSnapshot({ queue: "" }); // current T, 다음 없음
    const s = createAuthoringSession({ origin: makeReplayOrigin(), snapshot });
    s.controls.hardDrop(); // T 락 → current null (큐 소진)
    const page = s.addPage();
    expect(page.state.current).toBeNull();
    const note = s.toNote();

    expect(deriveSnapshotFromPage(note, page.id, TEST_CLIENT_ID)).toEqual({
      error: "queue-exhausted",
    });
  });
});
