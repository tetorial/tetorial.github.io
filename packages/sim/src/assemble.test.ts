// S-6 조립·병합 — 3경로 + 한도 사전 검증 + 서버 우선 필드 비설정 (명세 §4·§7)
import type { Note } from "@tetorial/types";
import { describe, expect, it } from "vitest";
import { assembleNotesFile, SERVER_FIELD_SENTINELS } from "./assemble.js";
import { createAuthoringSession } from "./authoring.js";
import { deepClone } from "./work.js";
import { TEST_CLIENT_ID, makeReplayOrigin, makeSnapshot, testNoteId } from "./testing/fixtures.js";

function makeNote(frame: number, comment = "c"): Note {
  const s = createAuthoringSession({
    origin: makeReplayOrigin({ frame }),
    snapshot: makeSnapshot(),
    noteId: testNoteId(frame), // frame별 구분 id — 신규 경로는 값 주입 (M1b-3)
  });
  s.controls.hardDrop();
  s.addPage(comment);
  return s.toNote();
}

describe("S-6 조립·병합", () => {
  it("기존 파일 null → 노트 1개 파일 생성", () => {
    const noteA = makeNote(1);
    const r = assembleNotesFile({ current: null, clientId: TEST_CLIENT_ID, upsert: noteA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.clientId).toBe(TEST_CLIENT_ID);
    expect(r.file.notes.map((n) => n.id)).toEqual([noteA.id]);
  });

  it("다른 id 노트는 추가된다", () => {
    const noteA = makeNote(1);
    const noteB = makeNote(2);
    expect(noteA.id).not.toBe(noteB.id);
    const r1 = assembleNotesFile({ current: null, clientId: TEST_CLIENT_ID, upsert: noteA });
    if (!r1.ok) throw new Error("r1");
    const r2 = assembleNotesFile({ current: r1.file, clientId: TEST_CLIENT_ID, upsert: noteB });
    if (!r2.ok) throw new Error("r2");
    expect(r2.file.notes.map((n) => n.id)).toEqual([noteA.id, noteB.id]);
  });

  it("동일 id 노트는 교체된다 (추가 아님)", () => {
    const noteA = makeNote(1, "원본");
    const r1 = assembleNotesFile({ current: null, clientId: TEST_CLIENT_ID, upsert: noteA });
    if (!r1.ok) throw new Error("r1");

    const noteA2 = deepClone(noteA);
    if (noteA2.pages[0]) noteA2.pages[0].comment = "변경됨";
    const r2 = assembleNotesFile({ current: r1.file, clientId: TEST_CLIENT_ID, upsert: noteA2 });
    if (!r2.ok) throw new Error("r2");
    expect(r2.file.notes.length).toBe(1);
    expect(r2.file.notes[0]?.pages[0]?.comment).toBe("변경됨");
  });

  it("한도 초과는 업로드 전에 차단하고 초과 항목을 보고한다", () => {
    const noteA = makeNote(1);
    const big = deepClone(noteA);
    const templatePage = big.pages[0]!;
    big.pages = Array.from({ length: 101 }, (_, i) => ({
      ...deepClone(templatePage),
      id: "page" + String(i).padStart(4, "0"),
    }));
    const r = assembleNotesFile({ current: null, clientId: TEST_CLIENT_ID, upsert: big });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("limit-exceeded");
    expect(r.violations.some((v) => v.path.includes("pages"))).toBe(true);
  });

  it("서버 우선 필드는 sentinel만 채운다 (실제 값 미설정)", () => {
    const noteA = makeNote(1);
    const r = assembleNotesFile({
      current: null,
      clientId: TEST_CLIENT_ID,
      author: { name: "corun" },
      upsert: noteA,
    });
    if (!r.ok) throw new Error("r");
    expect(r.file.editKeyHash).toBe(SERVER_FIELD_SENTINELS.editKeyHash);
    expect(r.file.createdAt).toBe(SERVER_FIELD_SENTINELS.timestamp);
    expect(r.file.updatedAt).toBe(SERVER_FIELD_SENTINELS.timestamp);
    expect(r.file.notes[0]?.createdAt).toBe(SERVER_FIELD_SENTINELS.timestamp);
    expect(r.file.notes[0]?.updatedAt).toBe(SERVER_FIELD_SENTINELS.timestamp);
    expect(r.file.author).toEqual({ name: "corun" });
  });
});
