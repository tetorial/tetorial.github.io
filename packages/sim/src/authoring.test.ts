// S-1 캡처 정합 · S-3 언두 매트릭스 (명세 §7) · M1b-3/M1b-4 노트 id 주입·입구 방어 (sim-m1b §3)
import { SimEngine } from "@tetorial/engine";
import { describe, expect, it } from "vitest";
import { InvalidNoteIdError, createAuthoringSession } from "./authoring.js";
import { TEST_NOTE_ID, makeReplayOrigin, makeSnapshot, testNoteId } from "./testing/fixtures.js";

/** 신규 경로 기본 init — 고정 noteId 주입 (M1b-3) */
function newInit(over: { snapshot?: ReturnType<typeof makeSnapshot> } = {}) {
  return {
    origin: makeReplayOrigin(),
    snapshot: over.snapshot ?? makeSnapshot(),
    noteId: TEST_NOTE_ID,
  };
}

describe("S-1 캡처 정합", () => {
  it("조작·그리기 혼합 후 addPage 산출 PageState가 독립 재현 엔진과 일치 (queueUsed 산술 포함)", () => {
    const snapshot = makeSnapshot({ queue: "IJLOSZT" }); // current T + 큐 7
    const s = createAuthoringSession(newInit({ snapshot }));

    s.controls.hardDrop(); // T 락, I 스폰 (queueUsed 1)
    s.controls.swapHold(); // 첫 홀드: hold=I, J 인출 (queueUsed 2)
    s.beginStroke({ kind: "cell", v: "G" });
    s.strokeTo({ x: 0, y: 0 });
    s.strokeTo({ x: 1, y: 0 });
    s.strokeTo({ x: 0, y: 0 }); // 중복 셀 — 무시
    s.endStroke();
    s.beginStroke({ kind: "highlight" });
    s.strokeTo({ x: 5, y: 0 });
    s.endStroke();

    const work = s.work;
    const page = s.addPage("코멘트");

    // queueUsed 산술: 소비량 = 전체 큐 - 남은 큐
    expect(page.state.queueUsed).toBe(snapshot.queue.length - work.next.length);
    expect(page.state.queueUsed).toBe(2);
    expect(page.state.current).toBe(work.current?.type ?? null);
    expect(page.state.current).toBe("J");
    expect(page.state.hold).toBe("I");
    expect(page.state.holdLocked).toBe(true);
    expect(page.state.counters).toEqual(work.counters);
    expect(page.state.overlays?.highlights).toEqual([...work.overlays.highlights]);
    expect(page.comment).toBe("코멘트");

    // 독립 오라클: 같은 보드 조작을 순수 엔진으로 재현 → 캡처가 오버레이 외 전부 일치
    const oracle = SimEngine.fromSnapshot(snapshot);
    oracle.hardDrop();
    oracle.swapHold();
    oracle.setCells([
      { x: 0, y: 0, v: "G" },
      { x: 1, y: 0, v: "G" },
    ]);
    const { overlays, ...pageNoOverlay } = page.state;
    void overlays;
    expect(pageNoOverlay).toEqual(oracle.capturePageState());
  });

  it("work 관측 뷰와 캡처된 페이지가 동일 상태를 가리킨다", () => {
    const s = createAuthoringSession(newInit());
    s.controls.hardDrop();
    const page = s.addPage();
    const work = s.work;
    expect(page.state.current).toBe(work.current?.type ?? null);
    expect(page.state.hold).toBe(work.hold.piece);
    expect(page.state.holdLocked).toBe(work.hold.locked);
  });
});

describe("S-3 언두 매트릭스", () => {
  const emptyBoard = (s: ReturnType<typeof createAuthoringSession>) =>
    s.work.board.every((row) => row.every((c) => c === "_"));

  it("lock 단위 undo·redo", () => {
    const s = createAuthoringSession(newInit());
    expect(s.canUndo).toBe(false);
    s.controls.hardDrop();
    expect(s.canUndo).toBe(true);
    expect(emptyBoard(s)).toBe(false);
    const afterLock = JSON.stringify(s.work.board);

    s.undo();
    expect(emptyBoard(s)).toBe(true); // 락 이전(빈 보드)로 복귀
    expect(s.work.current?.type).toBe("T"); // 락 대상 미노가 다시 falling
    expect(s.canRedo).toBe(true);

    s.redo();
    expect(JSON.stringify(s.work.board)).toBe(afterLock);
  });

  it("스트로크 단위 undo·redo", () => {
    const s = createAuthoringSession(newInit());
    s.beginStroke({ kind: "cell", v: "G" });
    s.strokeTo({ x: 0, y: 0 });
    s.endStroke();
    expect(s.work.board[0]?.[0]).toBe("G");
    s.undo();
    expect(emptyBoard(s)).toBe(true);
    s.redo();
    expect(s.work.board[0]?.[0]).toBe("G");
  });

  it("불러오기 단위 undo", () => {
    const snapshot = makeSnapshot({ queue: "IJLOSZTIJLOS" });
    const s = createAuthoringSession(newInit({ snapshot }));
    s.controls.hardDrop(); // 보드 상태 A
    const pA = s.addPage();
    s.controls.hardDrop(); // 보드 상태 B (미노 2개)
    const bBoard = JSON.stringify(s.work.board);

    s.loadPageIntoWork(pA.id); // 작업 상태를 A로 (언두 1단위)
    const engA = SimEngine.fromPageState(snapshot, pA.state);
    expect(JSON.stringify(s.work.board)).toBe(JSON.stringify(engA.boardView));
    expect(JSON.stringify(s.work.board)).not.toBe(bBoard);
    s.undo(); // 불러오기 취소 → B 복귀
    expect(JSON.stringify(s.work.board)).toBe(bBoard);
  });

  it("깊이 상한 50 — 60회 커밋 후 언두는 50회까지만", () => {
    const s = createAuthoringSession(newInit());
    for (let i = 0; i < 60; i++) {
      s.beginStroke({ kind: "cell", v: "G" });
      s.strokeTo({ x: i % 10, y: Math.floor(i / 10) });
      s.endStroke();
    }
    let count = 0;
    while (s.canUndo) {
      s.undo();
      count++;
    }
    expect(count).toBe(50);
  });

  it("페이지 CRUD 이력 분리 — undo가 페이지 목록을 되돌리지 않는다", () => {
    const s = createAuthoringSession(newInit());
    s.controls.hardDrop(); // 언두 스택에 push
    s.addPage(); // 페이지 CRUD — 언두 스택과 분리
    expect(s.pages.length).toBe(1);

    s.undo(); // 락만 되돌린다
    expect(s.pages.length).toBe(1); // 페이지는 그대로
    expect(s.work.board.every((row) => row.every((c) => c === "_"))).toBe(true); // 보드는 복귀
  });
});

describe("M1b-3 노트 id 값 주입 (sim-m1b §3)", () => {
  it("M1b-3 신규 경로: 주입된 noteId가 그대로 note.id가 된다 (해시 파생 소멸)", () => {
    const s = createAuthoringSession({
      origin: makeReplayOrigin(),
      snapshot: makeSnapshot(),
      noteId: testNoteId(7),
    });
    s.addPage();
    expect(s.toNote().id).toBe(testNoteId(7));
  });

  it("M1b-3 재편집 경로: existing의 id·origin·snapshot을 그대로 쓴다", () => {
    const first = createAuthoringSession(newInit());
    first.controls.hardDrop();
    first.addPage();
    const note = first.toNote();

    const reedit = createAuthoringSession({ existing: note });
    expect(reedit.pages).toEqual(note.pages);
    reedit.addPage();
    const reNote = reedit.toNote();
    expect(reNote.id).toBe(note.id);
    expect(reNote.origin).toEqual(note.origin);
    expect(reNote.snapshot).toEqual(note.snapshot);
  });
});

describe("M1b-4 입구 방어 (sim-m1b §3)", () => {
  const base = () => ({ origin: makeReplayOrigin(), snapshot: makeSnapshot() });

  it("M1b-4 형식 불일치 시 InvalidNoteIdError(shape) — 세션 미생성", () => {
    for (const bad of ["short", "toolong-9", "invalid!", "가나다라마바사아", ""]) {
      let thrown: unknown;
      try {
        createAuthoringSession({ ...base(), noteId: bad });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(InvalidNoteIdError);
      if (thrown instanceof InvalidNoteIdError) expect(thrown.reason).toBe("shape");
    }
  });

  it("M1b-4 existingNoteIds 충돌 시 InvalidNoteIdError(collision) — 세션 미생성", () => {
    let thrown: unknown;
    try {
      createAuthoringSession({
        ...base(),
        noteId: TEST_NOTE_ID,
        existingNoteIds: [testNoteId(1), TEST_NOTE_ID],
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(InvalidNoteIdError);
    if (thrown instanceof InvalidNoteIdError) expect(thrown.reason).toBe("collision");
  });

  it("M1b-4 목록 비충돌이면 생성 성공 (충돌 대조는 전달된 목록만)", () => {
    const s = createAuthoringSession({
      ...base(),
      noteId: TEST_NOTE_ID,
      existingNoteIds: [testNoteId(1), testNoteId(2)],
    });
    expect(s.pages.length).toBe(0);
  });

  it("M1b-4 재편집(existing) 경로는 대조하지 않는다 — 자기 id가 목록에 있어도 성공", () => {
    const first = createAuthoringSession(newInit());
    first.addPage();
    const note = first.toNote();
    // existing 경로에는 목록 자체가 없다 — 형식·충돌 어떤 검증도 없이 성공해야 한다
    const reedit = createAuthoringSession({ existing: note });
    expect(reedit.pages.length).toBe(1);
    reedit.addPage();
    expect(reedit.toNote().id).toBe(note.id);
  });
});
