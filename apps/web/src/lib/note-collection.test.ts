import { describe, it, expect, vi } from "vitest";
import { DEFAULT_HANDLING } from "@tetorial/input";
import { NOTES_LIMITS } from "@tetorial/types";
import type { Note } from "@tetorial/types";
import { resolveKeys } from "./settings.js";
import { createSimulator } from "./simulator.js";
import {
  assembleCollectedFile,
  collectNote,
  finishNote,
  hasUnuploaded,
  removeCollected,
  uploadCollectedNotes,
} from "./note-collection.js";
import { toDisplayError } from "./errors.js";
import { Storage, MemoryStorage } from "./storage.js";
import { WorkerClient, WorkerError } from "./worker-client.js";
import type { LoadedNotesFile } from "./notes-loading.js";
import { makeNote, makeNotesFile, makeSnapshot, jsonResponse } from "./testing.js";

const KEYS = resolveKeys(null);
const CLIENT = "k3XmP9qLwR2v";
const BRANCH = {
  origin: { type: "replay" as const, round: 0, player: 0, frame: 841 },
  snapshot: makeSnapshot(),
};

function sampleIndex(gistId = "g1") {
  return {
    gistId,
    files: [{ name: `notes-${CLIENT}.json`, size: 1, rawUrl: "raw://n", truncated: false }],
    fetchedAt: "2026-07-12T00:00:00.000Z",
  };
}

/** PUT 성공 응답을 주는 fetch mock (요청 본문 검사용으로 호출 기록을 남긴다). */
function okFetch() {
  return vi.fn(async () => jsonResponse({ gistId: "g1", file: `notes-${CLIENT}.json`, index: sampleIndex() }));
}

function loadedFile(clientId: string, notes: Note[], authorName?: string): LoadedNotesFile {
  const file = makeNotesFile(clientId, notes, authorName);
  return {
    clientId,
    ...(authorName ? { authorName } : {}),
    notes,
    file,
  };
}

/** 노트 n개짜리 타인 파일 — 합산 한도 검사용. */
function othersFile(clientId: string, count: number): LoadedNotesFile {
  return loadedFile(
    clientId,
    Array.from({ length: count }, (_, i) => makeNote(`ot${i}`.padEnd(8, "x"), i)),
  );
}

describe("AW-15 노트는 메모리 수집(업로드 없음)", () => {
  it("AW-15 노트 완성은 세션을 노트로 확정할 뿐 전송하지 않는다", () => {
    const fetchImpl = okFetch();
    const sim = createSimulator({ handling: DEFAULT_HANDLING, keys: KEYS, init: BRANCH });
    sim.session.addPage("첫 페이지");

    const res = finishNote(sim.session);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.note.pages.length).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled(); // 완성 시점에 네트워크 없음
    sim.dispose();
  });

  it("AW-15 노트 단위 한도 위반(pages>maxPages)은 완성 시점에 보고된다", () => {
    const sim = createSimulator({ handling: DEFAULT_HANDLING, keys: KEYS, init: BRANCH });
    for (let i = 0; i <= NOTES_LIMITS.maxPages; i++) sim.session.addPage(`p${i}`);
    const res = finishNote(sim.session);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("limit-exceeded");
      expect(res.violations.some((v) => v.path.includes("pages"))).toBe(true);
    }
    sim.dispose();
  });

  it("AW-15 수집함은 같은 id를 교체하고 순서를 유지한다", () => {
    const a = makeNote("aaaaaaaa", 1, "A");
    const b = makeNote("bbbbbbbb", 2, "B");
    const a2 = makeNote("aaaaaaaa", 1, "A 수정");

    let collected = collectNote(collectNote([], a), b);
    expect(collected.map((n) => n.id)).toEqual(["aaaaaaaa", "bbbbbbbb"]);

    collected = collectNote(collected, a2);
    expect(collected.length).toBe(2); // 추가가 아니라 교체
    expect(collected[0]?.pages[0]?.comment).toBe("A 수정");
    expect(collected.map((n) => n.id)).toEqual(["aaaaaaaa", "bbbbbbbb"]);

    expect(removeCollected(collected, "aaaaaaaa").map((n) => n.id)).toEqual(["bbbbbbbb"]);
  });

  it("AW-15 미업로드 수집 노트가 있으면 이탈 경고 조건이 참(영속화는 하지 않는다)", () => {
    expect(hasUnuploaded([])).toBe(false);
    expect(hasUnuploaded([makeNote("aaaaaaaa", 1)])).toBe(true);
  });
});

describe("AW-16 묶음 업로드(수집 노트 → 파일 하나 → 단일 PUT)", () => {
  it("AW-16 수집 노트 전부가 파일 하나로 순차 조립된다", () => {
    const res = assembleCollectedFile({
      current: null,
      clientId: CLIENT,
      authorName: "corun",
      notes: [makeNote("aaaaaaaa", 1), makeNote("bbbbbbbb", 2), makeNote("cccccccc", 3)],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.file.notes.map((n) => n.id)).toEqual(["aaaaaaaa", "bbbbbbbb", "cccccccc"]);
      expect(res.file.clientId).toBe(CLIENT);
      expect(res.file.author?.name).toBe("corun");
    }
  });

  it("AW-16 기존 파일이 있으면 그 위에 누적된다(추가는 append, 같은 id는 교체)", () => {
    const existing = makeNotesFile(CLIENT, [makeNote("aaaaaaaa", 1, "원본")]);
    const res = assembleCollectedFile({
      current: existing,
      clientId: CLIENT,
      notes: [makeNote("aaaaaaaa", 1, "수정본"), makeNote("bbbbbbbb", 2)],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.file.notes.map((n) => n.id)).toEqual(["aaaaaaaa", "bbbbbbbb"]);
      expect(res.file.notes[0]?.pages[0]?.comment).toBe("수정본");
    }
  });

  it("AW-16 수집 노트 3개 → PUT 1회, 본문은 노트 3개를 담은 파일 하나", async () => {
    const fetchImpl = okFetch();
    const worker = new WorkerClient({ baseUrl: "https://w.test", fetchImpl });
    const res = await uploadCollectedNotes({
      worker,
      storage: new Storage(new MemoryStorage()),
      gistId: "g1",
      clientId: CLIENT,
      notes: [makeNote("aaaaaaaa", 1), makeNote("bbbbbbbb", 2), makeNote("cccccccc", 3)],
      files: [],
      authorName: "corun",
    });

    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 단일 PUT
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://w.test/g/g1/notes");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(String(init.body)) as { file: { notes: unknown[] } };
    expect(body.file.notes.length).toBe(3);
  });

  it("AW-16 수집 노트가 없으면 전송하지 않는다(empty)", async () => {
    const fetchImpl = okFetch();
    const res = await uploadCollectedNotes({
      worker: new WorkerClient({ baseUrl: "https://w.test", fetchImpl }),
      storage: new Storage(new MemoryStorage()),
      gistId: "g1",
      clientId: CLIENT,
      notes: [],
      files: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("empty");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // 재설계 전 노트 단위 업로드가 검증하던 것(PUT 성공 → index·editKey 고지)을 새 경로에서 유지한다.
  it("AW-5 성공 시 index 반환 + editKey 최초 생성 고지", async () => {
    const worker = new WorkerClient({ baseUrl: "https://w.test", fetchImpl: okFetch() });
    const res = await uploadCollectedNotes({
      worker,
      storage: new Storage(new MemoryStorage()),
      gistId: "g1",
      clientId: CLIENT,
      notes: [makeNote("aaaaaaaa", 1)],
      files: [],
      authorName: "corun",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.editKeyCreated).toBe(true); // 최초 → 1회 고지 트리거
      expect(res.index.gistId).toBe("g1");
      expect(res.uploaded.notes.length).toBe(1);
    }
  });

  it("AW-7 editKey는 두 번째 업로드에서 재사용된다(고지 1회)", async () => {
    const storage = new Storage(new MemoryStorage());
    const worker = new WorkerClient({ baseUrl: "https://w.test", fetchImpl: okFetch() });
    const args = {
      worker,
      storage,
      gistId: "g1",
      clientId: CLIENT,
      notes: [makeNote("aaaaaaaa", 1)],
      files: [],
    };
    const first = await uploadCollectedNotes(args);
    const second = await uploadCollectedNotes(args);
    expect(first.ok && first.editKeyCreated).toBe(true);
    expect(second.ok && second.editKeyCreated).toBe(false);
  });
});

describe("AW-17 한도 사전 검사(합산 — Worker 교차 검사와 정합)", () => {
  it("AW-17 합산이 maxNotesPerReplay를 넘으면 PUT 전에 차단한다", async () => {
    const fetchImpl = okFetch();
    const limit = NOTES_LIMITS.maxNotesPerReplay;
    // 타인 파일이 limit-1개를 차지 → 내 노트 2개는 합산 초과.
    const files = [othersFile("otherClient1", limit - 1)];
    const res = await uploadCollectedNotes({
      worker: new WorkerClient({ baseUrl: "https://w.test", fetchImpl }),
      storage: new Storage(new MemoryStorage()),
      gistId: "g1",
      clientId: CLIENT,
      notes: [makeNote("aaaaaaaa", 1), makeNote("bbbbbbbb", 2)],
      files,
    });

    expect(res.ok).toBe(false);
    if (!res.ok && res.code === "limit-exceeded") {
      expect(res.violations[0]?.limit).toBe(limit);
      expect(res.violations[0]?.actual).toBe(limit + 1);
      expect(res.violations[0]?.message).toContain(String(limit));
    }
    expect(fetchImpl).not.toHaveBeenCalled(); // 차단은 전송 전
  });

  it("AW-17 한도에 도달했어도 노트 수가 늘지 않는 수정은 통과한다(Worker와 동일 기준)", async () => {
    const fetchImpl = okFetch();
    const limit = NOTES_LIMITS.maxNotesPerReplay;
    // 내 파일이 이미 한도를 다 쓴 상태 — 같은 노트를 고쳐 다시 올린다.
    const mineNotes = Array.from({ length: limit }, (_, i) => makeNote(`mn${i}`.padEnd(8, "x"), i));
    const files = [loadedFile(CLIENT, mineNotes)];
    const edited = { ...mineNotes[0]!, pages: [{ ...mineNotes[0]!.pages[0]!, comment: "고침" }] };

    const res = await uploadCollectedNotes({
      worker: new WorkerClient({ baseUrl: "https://w.test", fetchImpl }),
      storage: new Storage(new MemoryStorage()),
      gistId: "g1",
      clientId: CLIENT,
      notes: [edited],
      files,
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.uploaded.notes.length).toBe(limit); // 교체 — 증가 없음
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("AW-17 파일 단위 한도 위반(노트 내부)도 PUT 전에 차단한다", async () => {
    const fetchImpl = okFetch();
    const overLong = makeNote("aaaaaaaa", 1, "x".repeat(NOTES_LIMITS.maxCommentCodePoints + 1));
    const res = await uploadCollectedNotes({
      worker: new WorkerClient({ baseUrl: "https://w.test", fetchImpl }),
      storage: new Storage(new MemoryStorage()),
      gistId: "g1",
      clientId: CLIENT,
      notes: [overLong],
      files: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("limit-exceeded");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("AW-13 내 노트 이어서 편집(수집함 경유 재업로드)", () => {
  it("AW-13 재편집 노트는 같은 id로 upsert돼 노트 수가 늘지 않는다", async () => {
    const original = makeNote("aaaaaaaa", 1, "원본 주석");
    const files = [loadedFile(CLIENT, [original], "corun")];

    // 사이드바 노트 → { existing } 진입 → 페이지 추가 → 완성 → 수집함
    const sim = createSimulator({
      handling: DEFAULT_HANDLING,
      keys: KEYS,
      init: { existing: original },
    });
    sim.session.addPage("이어서 쓴 페이지");
    const finished = finishNote(sim.session);
    expect(finished.ok).toBe(true);
    sim.dispose();
    if (!finished.ok) return;

    expect(finished.note.id).toBe(original.id); // id 보존 — 새 노트가 아니다
    expect(finished.note.pages.length).toBe(2);

    const fetchImpl = okFetch();
    const res = await uploadCollectedNotes({
      worker: new WorkerClient({ baseUrl: "https://w.test", fetchImpl }),
      storage: new Storage(new MemoryStorage()),
      gistId: "g1",
      clientId: CLIENT,
      notes: collectNote([], finished.note),
      files,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.uploaded.notes.length).toBe(1); // 교체 — 파일에 노트가 늘지 않았다
      expect(res.uploaded.notes[0]?.pages.length).toBe(2);
      expect(res.uploaded.author?.name).toBe("corun"); // 기존 파일의 작성자 유지
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("AW-14 권한 실패 정직 표기", () => {
  it("AW-14 editKey 불일치(403) → WorkerError 전파 → toDisplayError가 명확한 문구로 매핑", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ code: "edit-key-mismatch" }, { status: 403 }),
    );
    const worker = new WorkerClient({ baseUrl: "https://w.test", fetchImpl });
    const storage = new Storage(new MemoryStorage()); // 초기화된 다른 브라우저 — editKey 부재

    const err = await uploadCollectedNotes({
      worker,
      storage,
      gistId: "g1",
      clientId: CLIENT,
      notes: [makeNote("aaaaaaaa", 1)],
      files: [],
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(WorkerError);
    const we = err as WorkerError;
    expect(we.status).toBe(403);

    const display = toDisplayError({ source: "worker", status: we.status, body: we.body });
    expect(display.title).toContain("편집 키가 이 브라우저에 없거나 일치하지 않습니다");
    expect(display.action.kind).toBe("none");

    // 시크릿(editKey)은 오류 문구·예외 메시지 어디에도 실리지 않는다(conventions §7).
    const editKey = storage.getEditKey("g1");
    expect(editKey).not.toBeNull();
    expect(display.title).not.toContain(editKey!);
    expect(we.message).not.toContain(editKey!);
  });
});
