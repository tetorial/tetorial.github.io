import { describe, it, expect } from "vitest";
import { createNoteViewer, canEditNote } from "./note-viewer.js";
import { workFrame } from "./view-frame.js";
import { makeNote, makeSnapshot } from "./testing.js";
import type { Note } from "@tetorial/types";

/** 페이지 3개짜리 노트 — 각 페이지 보드가 서로 다르다(뷰가 페이지를 따라가는지 확인용). */
function multiPageNote(): Note {
  const base = makeNote("aaaaaaaa", 1, "1번 페이지");
  const page = base.pages[0]!;
  return {
    ...base,
    snapshot: makeSnapshot(),
    pages: [
      page,
      { ...page, id: "pg000002", state: { ...page.state, board: { width: 10, rows: ["GG________"] } }, comment: "2번 페이지" },
      { ...page, id: "pg000003", state: { ...page.state, board: { width: 10, rows: ["GGG_______"] } }, comment: "3번 페이지" },
    ],
  };
}

describe("AW-12 노트 보드 뷰어(createViewerSession 배선)", () => {
  it("AW-12 페이지마다 보드 렌더 프레임이 나온다(메타 전용 아님)", () => {
    const viewer = createNoteViewer(multiPageNote());
    const view = viewer.view;
    expect(view).not.toBeNull();

    const frame = workFrame(view!);
    expect(frame.board.width).toBe(10);
    expect(frame.board.rows[0]).toContain("G"); // 페이지 보드가 실제로 실려 있다
    expect(frame.falling).not.toBeNull(); // 스폰된 current까지 세워진 뷰
  });

  it("AW-12 next/prev로 페이지를 넘기면 보드·주석이 함께 바뀐다", () => {
    const viewer = createNoteViewer(multiPageNote());
    expect(viewer.index).toBe(0);
    expect(viewer.current?.comment).toBe("1번 페이지");
    expect(workFrame(viewer.view!).board.rows[0]).toBe("G_________");

    viewer.next();
    expect(viewer.index).toBe(1);
    expect(viewer.current?.comment).toBe("2번 페이지");
    expect(workFrame(viewer.view!).board.rows[0]).toBe("GG________");

    viewer.prev();
    expect(viewer.index).toBe(0);
    expect(viewer.current?.comment).toBe("1번 페이지");
  });

  it("AW-12 끝에서 넘겨도 범위를 벗어나지 않는다", () => {
    const viewer = createNoteViewer(multiPageNote());
    viewer.prev();
    expect(viewer.index).toBe(0);
    viewer.next();
    viewer.next();
    viewer.next();
    expect(viewer.index).toBe(2);
  });

  it("AW-12 딥링크 서수(#p<n>)로 시작 페이지를 정한다 — 범위 밖·부재는 첫 페이지(D-20)", () => {
    expect(createNoteViewer(multiPageNote(), 3).index).toBe(2);
    expect(createNoteViewer(multiPageNote(), 1).index).toBe(0);
    expect(createNoteViewer(multiPageNote(), null).index).toBe(0);
    expect(createNoteViewer(multiPageNote(), 99).index).toBe(0); // best-effort 폴백
    expect(createNoteViewer(multiPageNote(), 0).index).toBe(0);
  });

  it("AW-12 뷰어는 원본 노트와 자립한다(열람은 수정하지 않는다 — D-3)", () => {
    const note = multiPageNote();
    const viewer = createNoteViewer(note);
    viewer.next();
    expect(note.pages.length).toBe(3);
    expect(viewer.note).not.toBe(note);
  });
});

describe("AW-13 편집 진입 조건", () => {
  it("AW-13 내 노트만 편집 진입, 타인 노트는 열람 전용(fork UI 없음 — D-8)", () => {
    expect(canEditNote({ isMine: true }, true)).toBe(true);
    expect(canEditNote({ isMine: false }, true)).toBe(false);
  });

  it("AW-13 gist 없는 로컬 리플레이는 올릴 곳이 없어 편집 진입도 없다", () => {
    expect(canEditNote({ isMine: true }, false)).toBe(false);
  });
});
