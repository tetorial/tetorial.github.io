// S-7 A/B 시나리오 통합 — 종단 시나리오가 유효한 NotesFile(zod 통과)을 산출 (명세 §7)
import { notesFileSchema } from "@tetorial/types";
import { describe, expect, it } from "vitest";
import { assembleNotesFile } from "./assemble.js";
import { createAuthoringSession } from "./authoring.js";
import {
  TEST_CLIENT_ID,
  TEST_NOTE_ID,
  makeReplayOrigin,
  makeSnapshot,
} from "./testing/fixtures.js";

describe("S-7 A/B 시나리오 통합", () => {
  it("페이지 3개 → 1번 불러오기 → 변형 → 페이지 추가 → 순서 변경 → 조립 = zod 통과", () => {
    const snapshot = makeSnapshot({ queue: "IJLOSZTIJLOSZTIJLOSZT" });
    const s = createAuthoringSession({
      origin: makeReplayOrigin({ frame: 841 }),
      snapshot,
      noteId: TEST_NOTE_ID,
    });

    // 페이지 3개 추가
    s.controls.hardDrop();
    const p1 = s.addPage("첫 배치");
    s.controls.hardDrop();
    const p2 = s.addPage("둘째");
    s.controls.hardDrop();
    const p3 = s.addPage("셋째");

    // 1번 페이지를 작업 상태로 불러오기
    s.loadPageIntoWork(p1.id);

    // 변형 (셀 그리기 + 배치) — 같은 상황의 B안
    s.beginStroke({ kind: "cell", v: "G" });
    s.strokeTo({ x: 0, y: 0 });
    s.strokeTo({ x: 1, y: 0 });
    s.endStroke();
    s.controls.hardDrop();

    // 페이지 추가 (A/B 공존)
    const p4 = s.addPage("p1의 B안");

    // 순서 변경 — 저자의 프레젠테이션 순서
    s.reorderPages([p4.id, p1.id, p2.id, p3.id]);

    // 조립
    const note = s.toNote();
    const r = assembleNotesFile({ current: null, clientId: TEST_CLIENT_ID, upsert: note });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const parsed = notesFileSchema.safeParse(r.file);
    expect(parsed.success).toBe(true);

    expect(r.file.notes[0]?.pages.map((p) => p.id)).toEqual([p4.id, p1.id, p2.id, p3.id]);
    expect(r.file.notes[0]?.pages.length).toBe(4);
  });
});
