import { describe, it, expect, vi } from "vitest";
import { DEFAULT_HANDLING } from "@tetorial/input";
import { resolveKeys } from "./settings.js";
import { createSimulator, restoreSimulator, uploadNotes } from "./simulator.js";
import { Storage, MemoryStorage } from "./storage.js";
import { WorkerClient, WorkerError } from "./worker-client.js";
import { makeSnapshot, jsonResponse } from "./testing.js";

const KEYS = resolveKeys(null);
const BRANCH = {
  origin: { type: "replay" as const, round: 0, player: 0, frame: 841 },
  snapshot: makeSnapshot(),
};

function sampleIndex(gistId = "g1") {
  return {
    gistId,
    files: [{ name: "notes-k3XmP9qLwR2v.json", size: 1, rawUrl: "raw://n", truncated: false }],
    fetchedAt: "2026-07-12T00:00:00.000Z",
  };
}

// AW-5 시뮬레이터 종단 / AW-6 드래프트 복구 / AW-7 편집 키.
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

describe("AW-5 업로드 조립·전송(PUT → 사이드바 index)", () => {
  it("AW-5 성공 시 index 반환 + editKey 최초 생성 고지", async () => {
    const sim = createSimulator({ handling: DEFAULT_HANDLING, keys: KEYS, init: BRANCH });
    sim.session.addPage("페이지");
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ gistId: "g1", file: "notes-k3XmP9qLwR2v.json", index: sampleIndex() }),
    );
    const worker = new WorkerClient({ baseUrl: "https://w.test", fetchImpl });
    const storage = new Storage(new MemoryStorage());
    const res = await uploadNotes({
      worker,
      storage,
      gistId: "g1",
      session: sim.session,
      currentFile: null,
      clientId: "k3XmP9qLwR2v",
      authorName: "corun",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.editKeyCreated).toBe(true); // 최초 → 1회 고지 트리거
      expect(res.index.gistId).toBe("g1");
    }
    sim.dispose();
  });

  it("AW-5 한도 초과(pages>100)는 업로드 전 사전 차단(limit-exceeded)", async () => {
    const sim = createSimulator({ handling: DEFAULT_HANDLING, keys: KEYS, init: BRANCH });
    for (let i = 0; i < 101; i++) sim.session.addPage(`p${i}`);
    const worker = new WorkerClient({ baseUrl: "https://w.test", fetchImpl: vi.fn() });
    const res = await uploadNotes({
      worker,
      storage: new Storage(new MemoryStorage()),
      gistId: "g1",
      session: sim.session,
      currentFile: null,
      clientId: "k3XmP9qLwR2v",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("limit-exceeded");
    sim.dispose();
  });
});

describe("AW-7 편집 키 수명주기(업로드 경로)", () => {
  it("AW-7 다른 브라우저(editKey 부재)에서 403 → WorkerError 전파", async () => {
    const sim = createSimulator({ handling: DEFAULT_HANDLING, keys: KEYS, init: BRANCH });
    sim.session.addPage("p");
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ code: "edit-key-mismatch", message: "불일치" }, { status: 403 }),
    );
    const worker = new WorkerClient({ baseUrl: "https://w.test", fetchImpl });
    const storage = new Storage(new MemoryStorage()); // 초기화된 다른 브라우저
    await expect(
      uploadNotes({
        worker,
        storage,
        gistId: "g1",
        session: sim.session,
        currentFile: null,
        clientId: "k3XmP9qLwR2v",
      }),
    ).rejects.toBeInstanceOf(WorkerError);
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

describe("AW-6 드래프트 왕복 복구", () => {
  it("AW-6 작업 상태(페이지·미저장 보드)를 직렬화→복원", () => {
    const sim = createSimulator({ handling: DEFAULT_HANDLING, keys: KEYS, init: BRANCH });
    sim.session.addPage("보존 페이지");
    // 페이지로 만들지 않은 진행 중 보드 변경
    sim.session.beginStroke({ kind: "cell", v: "G" });
    sim.session.strokeTo({ x: 3, y: 0 });
    sim.session.endStroke();
    const draft = sim.session.serialize();
    sim.dispose();

    // 스토리지 왕복
    const storage = new Storage(new MemoryStorage());
    storage.setDraft("g1", draft);
    const restoredDraft = storage.getDraft("g1");
    expect(restoredDraft).not.toBeNull();

    const restored = restoreSimulator(restoredDraft!, { handling: DEFAULT_HANDLING, keys: KEYS });
    expect(restored.session.pages.length).toBe(1);
    expect(restored.session.pages[0]?.comment).toBe("보존 페이지");
    expect(restored.session.dirty).toBe(true);
    // 미저장 보드(그리기 결과)가 work에 복원되어 있다
    const board = restored.session.work.board;
    expect(board[0]?.[3]).toBe("G");
    restored.dispose();
  });
});
