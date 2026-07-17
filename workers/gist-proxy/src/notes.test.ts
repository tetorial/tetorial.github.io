import { fetchMock } from "cloudflare:test";
import { NOTES_LIMITS, type NotesFile } from "@tetorial/types";
import { beforeAll, afterEach, describe, it, expect } from "vitest";
import { sha256HexOfString } from "./hash.js";
import {
  callWorker,
  jsonBody,
  putNotes,
  makeNotesFile,
  gistResponse,
  existingNotesContent,
  mockGet,
  mockPatchCapture,
  SAMPLE_CLIENT_ID,
  SAMPLE_EDIT_KEY,
} from "./test-helpers.js";

const FILENAME = `notes-${SAMPLE_CLIENT_ID}.json`;

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

describe("W-1 노트 쓰기 (PUT /g/:gistId/notes)", () => {
  it("W-1 신규 생성 — editKeyHash 서버 계산(클라이언트 값 무시) + PATCH는 대상 파일 1개만", async () => {
    mockGet("gNew", gistResponse("gNew", { "meta.json": "{}", "replay.ttrm.gz.b64": "x" }));
    let patched: { files: Record<string, { content: string }> } = { files: {} };
    mockPatchCapture("gNew", gistResponse("gNew", { [FILENAME]: "{}" }), (b) => {
      patched = b as { files: Record<string, { content: string }> };
    });

    // 클라이언트가 가짜 해시를 보내도 무시되어야 함
    const file = makeNotesFile({ editKeyHash: "b".repeat(64) });
    const res = await callWorker(
      putNotes("gNew", { clientId: SAMPLE_CLIENT_ID, editKey: SAMPLE_EDIT_KEY, file }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { file: string; index: { gistId: string } };
    expect(body.file).toBe(FILENAME);

    // 격리: PATCH files에 오직 대상 파일 하나
    expect(Object.keys(patched.files)).toEqual([FILENAME]);
    const stored = JSON.parse(patched.files[FILENAME]!.content) as Record<string, string>;
    expect(stored.editKeyHash).toBe(await sha256HexOfString(SAMPLE_EDIT_KEY)); // 서버 계산값
    expect(stored.editKeyHash).not.toBe("b".repeat(64)); // 클라이언트 값 무시
    expect(stored.createdAt).not.toBe("2020-01-01T00:00:00Z"); // 서버 시각
    expect(stored.updatedAt).not.toBe("2020-01-01T00:00:00Z");
  });

  it("W-1 정상 수정 — editKeyHash·clientId·createdAt 기존값 강제 유지, updatedAt만 갱신", async () => {
    const existing = await existingNotesContent(
      SAMPLE_CLIENT_ID,
      SAMPLE_EDIT_KEY,
      "2019-06-06T00:00:00Z",
    );
    mockGet("gMod", gistResponse("gMod", { "meta.json": "{}", [FILENAME]: existing }));
    let patched: { files: Record<string, { content: string }> } = { files: {} };
    mockPatchCapture("gMod", gistResponse("gMod", { [FILENAME]: "{}" }), (b) => {
      patched = b as { files: Record<string, { content: string }> };
    });

    // 클라이언트가 서버 소유 필드를 변조 시도
    const file = makeNotesFile({ createdAt: "2099-01-01T00:00:00Z", editKeyHash: "a".repeat(64) });
    const res = await callWorker(
      putNotes("gMod", { clientId: SAMPLE_CLIENT_ID, editKey: SAMPLE_EDIT_KEY, file }),
    );
    expect(res.status).toBe(200);

    const stored = JSON.parse(patched.files[FILENAME]!.content) as Record<string, string>;
    expect(stored.createdAt).toBe("2019-06-06T00:00:00Z"); // 기존값 유지
    expect(stored.clientId).toBe(SAMPLE_CLIENT_ID); // 기존값 유지
    expect(stored.editKeyHash).toBe(await sha256HexOfString(SAMPLE_EDIT_KEY)); // 기존값 유지
    expect(stored.updatedAt).not.toBe("2020-01-01T00:00:00Z"); // 매 쓰기마다 서버 시각
  });

  it("W-1 editKey 불일치 → 403 edit-key-mismatch (PATCH 미발생)", async () => {
    const existing = await existingNotesContent(SAMPLE_CLIENT_ID, "완전히-다른-키");
    mockGet("gBad", gistResponse("gBad", { "meta.json": "{}", [FILENAME]: existing }));
    // PATCH 인터셉터를 등록하지 않는다 → 만약 PATCH를 시도하면 disableNetConnect로 실패

    const res = await callWorker(
      putNotes("gBad", {
        clientId: SAMPLE_CLIENT_ID,
        editKey: SAMPLE_EDIT_KEY,
        file: makeNotesFile(),
      }),
    );
    expect(res.status).toBe(403);
    expect((await jsonBody(res)).code).toBe("edit-key-mismatch");
  });

  it("W-1 clientId 3자 불일치 → 400 (GitHub 호출 없음)", async () => {
    const file = makeNotesFile({ clientId: SAMPLE_CLIENT_ID });
    const res = await callWorker(
      putNotes("gX", { clientId: "otherClient1", editKey: SAMPLE_EDIT_KEY, file }),
    );
    expect(res.status).toBe(400);
    expect((await jsonBody(res)).code).toBe("bad-request");
  });

  it("W-1 존재하지 않는 gist → 404", async () => {
    mockGet("gGone", null, 404);
    const res = await callWorker(
      putNotes("gGone", {
        clientId: SAMPLE_CLIENT_ID,
        editKey: SAMPLE_EDIT_KEY,
        file: makeNotesFile(),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("W-1 서비스 규약 외 gist → 404 위장", async () => {
    mockGet("gForeign", gistResponse("gForeign", { "a.txt": "x" }, "not ours"));
    const res = await callWorker(
      putNotes("gForeign", {
        clientId: SAMPLE_CLIENT_ID,
        editKey: SAMPLE_EDIT_KEY,
        file: makeNotesFile(),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("W-1 editKey 누락 → 400", async () => {
    const res = await callWorker(
      putNotes("gY", { clientId: SAMPLE_CLIENT_ID, file: makeNotesFile() }),
    );
    expect(res.status).toBe(400);
  });

  it("W-1 파일 스키마 한도 위반(comment>500) → 422 limit-exceeded", async () => {
    const file = makeNotesFile();
    file.notes[0]!.pages[0]!.comment = "가".repeat(501);
    const res = await callWorker(
      putNotes("gZ", { clientId: SAMPLE_CLIENT_ID, editKey: SAMPLE_EDIT_KEY, file }),
    );
    expect(res.status).toBe(422);
    expect((await jsonBody(res)).code).toBe("limit-exceeded");
  });
});

/** 유일 id를 가진 노트 count개짜리 파일 (id 형식 [A-Za-z0-9_-]{8} 준수). */
function notesFileWith(count: number, overrides: Partial<NotesFile> = {}): NotesFile {
  const base = makeNotesFile(overrides);
  const proto = base.notes[0]!;
  base.notes = Array.from({ length: count }, (_, i) => ({
    ...proto,
    id: `n${String(i).padStart(7, "0")}`,
  }));
  return base;
}

describe("M2E 리플레이(=gist) 합산 노트 한도 (#35)", () => {
  const LIMIT = NOTES_LIMITS.maxNotesPerReplay;

  it("M2E-1 타 클라이언트 파일 합산이 한도에 도달한 gist에 신규 노트 → 거부 (PATCH 미발생)", async () => {
    const otherFull = JSON.stringify(notesFileWith(LIMIT, { clientId: "otherClient1" }));
    mockGet(
      "gFull",
      gistResponse("gFull", { "meta.json": "{}", "notes-otherClient1.json": otherFull }),
    );
    // PATCH 인터셉터 미등록 — 시도하면 disableNetConnect로 실패

    const res = await callWorker(
      putNotes("gFull", {
        clientId: SAMPLE_CLIENT_ID,
        editKey: SAMPLE_EDIT_KEY,
        file: makeNotesFile(),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("M2E-1 한도 도달 gist에서 노트 수가 늘지 않는 수정은 통과한다", async () => {
    const existing = JSON.stringify(
      notesFileWith(LIMIT, { editKeyHash: await sha256HexOfString(SAMPLE_EDIT_KEY) }),
    );
    mockGet("gEdit", gistResponse("gEdit", { "meta.json": "{}", [FILENAME]: existing }));
    mockPatchCapture("gEdit", gistResponse("gEdit", { [FILENAME]: "{}" }), () => {});

    const res = await callWorker(
      putNotes("gEdit", {
        clientId: SAMPLE_CLIENT_ID,
        editKey: SAMPLE_EDIT_KEY,
        file: notesFileWith(LIMIT), // 자기 파일 교체 — 총합 불변(=한도)
      }),
    );
    expect(res.status).toBe(200);
  });

  it("M2E-2 초과 거부 응답 계약 — 422 limit-exceeded + detail { limit, total }", async () => {
    const nine = JSON.stringify(notesFileWith(LIMIT - 1, { clientId: "otherClient1" }));
    mockGet("gOver", gistResponse("gOver", { "meta.json": "{}", "notes-otherClient1.json": nine }));

    const res = await callWorker(
      putNotes("gOver", {
        clientId: SAMPLE_CLIENT_ID,
        editKey: SAMPLE_EDIT_KEY,
        file: notesFileWith(2), // 9 + 2 = 11 > 10
      }),
    );
    expect(res.status).toBe(422);
    const body = await jsonBody(res);
    expect(body.code).toBe("limit-exceeded");
    expect((body as { detail?: unknown }).detail).toEqual({ limit: LIMIT, total: LIMIT + 1 });
  });
});
