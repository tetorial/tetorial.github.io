import { describe, it, expect } from "vitest";
import {
  parseNotesFile,
  loadNotesFiles,
  flattenSidebar,
  resolveNoteCandidates,
  applyUploadedFile,
  type LoadedNotesFile,
} from "./notes-loading.js";
import type { GistIndex } from "./worker-client.js";
import { makeNote, makeNotesFile } from "./testing.js";

const clientA = "aaaaaaaaaaaa";
const clientB = "bbbbbbbbbbbb";

function indexWith(files: { name: string; rawUrl: string }[]): GistIndex {
  return {
    gistId: "g1",
    files: files.map((f) => ({ name: f.name, size: 1, rawUrl: f.rawUrl, truncated: false })),
    fetchedAt: "2026-07-12T00:00:00.000Z",
  };
}

// AW-4 gist 노트 로딩 / AW-10 사이드바·딥링크 후보.
describe("AW-4 노트 파일 로딩", () => {
  it("AW-4 notes-*.json만 rawUrl로 로드·검증(비노트 파일 무시)", async () => {
    const fileA = makeNotesFile(clientA, [makeNote("aaaaaaaa", 100)], "corun");
    const raw: Record<string, string> = {
      "raw://a": JSON.stringify(fileA),
      "raw://meta": JSON.stringify({ schema: "tetorial.meta/1" }),
    };
    const index = indexWith([
      { name: `notes-${clientA}.json`, rawUrl: "raw://a" },
      { name: "meta.json", rawUrl: "raw://meta" },
      { name: "replay.ttrm.gz.b64", rawUrl: "raw://replay" },
    ]);
    const loaded = await loadNotesFiles(index, async (u) => raw[u] ?? "");
    expect(loaded.length).toBe(1);
    expect(loaded[0]?.clientId).toBe(clientA);
    expect(loaded[0]?.authorName).toBe("corun");
  });

  it("AW-4 손상된 노트 파일은 조용히 건너뛴다", async () => {
    const index = indexWith([{ name: `notes-${clientA}.json`, rawUrl: "raw://bad" }]);
    const loaded = await loadNotesFiles(index, async () => "{not json");
    expect(loaded).toEqual([]);
  });

  it("parseNotesFile: 유효/무효 분기", () => {
    const file = makeNotesFile(clientA, [makeNote("aaaaaaaa", 1)]);
    expect(parseNotesFile(JSON.stringify(file))?.clientId).toBe(clientA);
    expect(parseNotesFile("{}")).toBeNull();
  });
});

describe("AW-10 사이드바 평탄화", () => {
  it("AW-10 노트 단위 평탄화 + 내 노트 배지", () => {
    const files = [
      makeNotesFile(clientA, [makeNote("aaaaaaaa", 100, "첫 주석"), makeNote("aaaaaaab", 200)], "corun"),
      makeNotesFile(clientB, [makeNote("bbbbbbbb", 150)], "guest"),
    ].map((f) => ({ clientId: f.clientId, authorName: f.author?.name, notes: f.notes, file: f }));

    const entries = flattenSidebar(files, clientA);
    expect(entries.length).toBe(3);
    const mine = entries.filter((e) => e.isMine);
    expect(mine.length).toBe(2);
    expect(mine.every((e) => e.clientId === clientA)).toBe(true);
    const first = entries.find((e) => e.noteId === "aaaaaaaa");
    expect(first?.firstComment).toBe("첫 주석");
    expect(first?.pageCount).toBe(1);
    expect(first?.authorName).toBe("corun");
  });

  it("AW-10 myClientId 없으면 내 것 배지 없음", () => {
    const files = [makeNotesFile(clientA, [makeNote("aaaaaaaa", 1)])].map((f) => ({
      clientId: f.clientId,
      authorName: undefined,
      notes: f.notes,
      file: f,
    }));
    expect(flattenSidebar(files, null).every((e) => !e.isMine)).toBe(true);
  });
});

describe("AW-10 딥링크 노트 후보 해석(충돌)", () => {
  const files = [
    makeNotesFile(clientA, [makeNote("dupnote1", 100)]),
    makeNotesFile(clientB, [makeNote("dupnote1", 200)]), // 파일 간 같은 noteId 충돌
  ].map((f) => ({ clientId: f.clientId, authorName: undefined, notes: f.notes, file: f }));

  it("AW-10 충돌 시 후보 여러 개 반환(후보 목록)", () => {
    const c = resolveNoteCandidates(files, "dupnote1");
    expect(c.length).toBe(2);
    expect(c.map((x) => x.clientId).sort()).toEqual([clientA, clientB]);
  });

  it("AW-10 clientId 한정자로 후보 1개 확정", () => {
    const c = resolveNoteCandidates(files, "dupnote1", clientB);
    expect(c.length).toBe(1);
    expect(c[0]?.clientId).toBe(clientB);
  });

  it("AW-10 없는 noteId는 후보 0개", () => {
    expect(resolveNoteCandidates(files, "nomatch1")).toEqual([]);
  });
});

describe("AW-11 업로드 즉시 반영(재로드 없이 사이드바 갱신)", () => {
  function loadedOf(clientId: string, notes: ReturnType<typeof makeNote>[], author?: string): LoadedNotesFile {
    const file = makeNotesFile(clientId, notes, author);
    return { clientId, ...(author ? { authorName: author } : {}), notes, file };
  }

  it("AW-11 처음 올린 파일은 열람 상태에 추가돼 사이드바에 바로 뜬다", () => {
    const before: LoadedNotesFile[] = [loadedOf(clientB, [makeNote("bbbbbbbb", 5)], "남")];
    expect(flattenSidebar(before, clientA).length).toBe(1);

    const uploaded = makeNotesFile(clientA, [makeNote("aaaaaaaa", 1, "새 노트")], "corun");
    const after = applyUploadedFile(before, uploaded);

    const sidebar = flattenSidebar(after, clientA);
    expect(sidebar.length).toBe(2);
    const mine = sidebar.find((e) => e.noteId === "aaaaaaaa");
    expect(mine?.isMine).toBe(true);
    expect(mine?.authorName).toBe("corun");
    expect(mine?.firstComment).toBe("새 노트");
  });

  it("AW-11 다시 올리면 같은 clientId 항목이 교체된다(중복 생성 없음)", () => {
    const before: LoadedNotesFile[] = [loadedOf(clientA, [makeNote("aaaaaaaa", 1, "이전")], "corun")];
    const uploaded = makeNotesFile(
      clientA,
      [makeNote("aaaaaaaa", 1, "고침"), makeNote("cccccccc", 2, "추가")],
      "corun",
    );
    const after = applyUploadedFile(before, uploaded);

    expect(after.length).toBe(1); // 파일은 기여자당 1개(D-5)
    const sidebar = flattenSidebar(after, clientA);
    expect(sidebar.map((e) => e.noteId)).toEqual(["aaaaaaaa", "cccccccc"]);
    expect(sidebar[0]?.firstComment).toBe("고침");
  });

  it("AW-11 입력 배열을 변형하지 않는다(상태 교체로만 반영)", () => {
    const before: LoadedNotesFile[] = [loadedOf(clientA, [makeNote("aaaaaaaa", 1)])];
    const after = applyUploadedFile(before, makeNotesFile(clientB, [makeNote("bbbbbbbb", 2)]));
    expect(before.length).toBe(1);
    expect(after.length).toBe(2);
    expect(after).not.toBe(before);
  });
});
