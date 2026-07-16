import { describe, it, expect, vi } from "vitest";
import { WorkerClient, WorkerError, RawFetchError, type GistIndex } from "./worker-client.js";
import type { MetaFile, NotesFile } from "@tetorial/types";

const BASE = "https://worker.test";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

const sampleIndex: GistIndex = {
  gistId: "abc123",
  files: [
    { name: "meta.json", size: 100, rawUrl: "https://gist.raw/meta", truncated: false },
    { name: "replay.ttrm.gz.b64", size: 200, rawUrl: "https://gist.raw/replay", truncated: false },
  ],
  fetchedAt: "2026-07-12T00:00:00.000Z",
};

const dummyMeta = { schema: "tetorial.meta/1" } as unknown as MetaFile;
const dummyFile = { schema: "tetorial.notes/1" } as unknown as NotesFile;

// AW-3 업로드 POST / AW-4 gist 읽기 / AW-5 노트 PUT / AW-7 편집 키 403 — Worker 클라이언트 계약.
describe("AW-4 WorkerClient 읽기(GET /g/:id)", () => {
  it("AW-4 GistIndex 형태를 zod로 검증해 반환", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(sampleIndex));
    const client = new WorkerClient({ baseUrl: BASE, fetchImpl });
    const index = await client.getIndex("abc123");
    expect(index.files[1]?.rawUrl).toBe("https://gist.raw/replay");
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/g/abc123`, { method: "GET" });
  });

  it("AW-4 rawUrl은 응답 값 그대로 fetch(손조립 금지)", async () => {
    const fetchImpl = vi.fn(async () => new Response("raw-body-text", { status: 200 }));
    const client = new WorkerClient({ baseUrl: BASE, fetchImpl });
    const text = await client.fetchRaw("https://gist.raw/replay");
    expect(text).toBe("raw-body-text");
    expect(fetchImpl).toHaveBeenCalledWith("https://gist.raw/replay", { method: "GET" });
  });

  it("AW-4 rawUrl 비200 → RawFetchError", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));
    const client = new WorkerClient({ baseUrl: BASE, fetchImpl });
    await expect(client.fetchRaw("https://gist.raw/x")).rejects.toBeInstanceOf(RawFetchError);
  });

  it("AW-4 gist 404 → WorkerError(not-found)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ code: "not-found", message: "없음" }, { status: 404 }),
    );
    const client = new WorkerClient({ baseUrl: BASE, fetchImpl });
    await expect(client.getIndex("nope")).rejects.toMatchObject({
      status: 404,
      body: { code: "not-found" },
    });
  });
});

describe("AW-3 WorkerClient 생성(POST /g)", () => {
  it("AW-3 성공 시 gistId·index 반환", async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => jsonResponse({ gistId: "abc123", index: sampleIndex }, { status: 201 }),
    );
    const client = new WorkerClient({ baseUrl: BASE, fetchImpl });
    const res = await client.createReplay({ meta: dummyMeta, replayBody: "GZ" });
    expect(res.gistId).toBe("abc123");
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    // turnstileToken(undefined)은 직렬화에서 제거된다(v1 비활성 훅).
    expect(JSON.parse(init?.body as string)).not.toHaveProperty("turnstileToken");
  });
});

describe("AW-5 WorkerClient 노트 쓰기(PUT /g/:id/notes)", () => {
  it("AW-5 성공 시 index 동봉(사이드바 즉시 갱신)", async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => jsonResponse({ gistId: "abc123", file: "notes-x.json", index: sampleIndex }),
    );
    const client = new WorkerClient({ baseUrl: BASE, fetchImpl });
    const res = await client.putNotes("abc123", {
      clientId: "k3XmP9qLwR2v",
      editKey: "secret",
      file: dummyFile,
    });
    expect(res.index.gistId).toBe("abc123");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${BASE}/g/abc123/notes`);
    expect(init?.method).toBe("PUT");
  });

  it("AW-7 편집 키 불일치 → WorkerError(403 edit-key-mismatch)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ code: "edit-key-mismatch", message: "불일치" }, { status: 403 }),
    );
    const client = new WorkerClient({ baseUrl: BASE, fetchImpl });
    await expect(
      client.putNotes("abc123", { clientId: "k3XmP9qLwR2v", editKey: "wrong", file: dummyFile }),
    ).rejects.toBeInstanceOf(WorkerError);
  });

  it("AW-5 429 → Retry-After를 ms로 정규화", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ code: "rate-limited" }, { status: 429, headers: { "retry-after": "3" } }),
    );
    const client = new WorkerClient({ baseUrl: BASE, fetchImpl });
    await client
      .putNotes("abc123", { clientId: "k3XmP9qLwR2v", editKey: "k", file: dummyFile })
      .then(
        () => expect.fail("should throw"),
        (e: WorkerError) => {
          expect(e.retryAfterMs).toBe(3000);
        },
      );
  });
});

describe("WorkerClient 설정", () => {
  it("PUBLIC_WORKER_URL 미설정 시 명확한 오류", () => {
    // import.meta.env.PUBLIC_WORKER_URL은 vitest에서 undefined
    expect(() => new WorkerClient({})).toThrow(/PUBLIC_WORKER_URL/);
  });
});
