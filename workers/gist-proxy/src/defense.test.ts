import { fetchMock } from "cloudflare:test";
import { beforeAll, afterEach, describe, it, expect } from "vitest";
import {
  callWorker,
  jsonBody,
  postCreate,
  putNotes,
  makeMeta,
  makeReplayBody,
  makeNotesFile,
  gistResponse,
  mockCreate,
  mockGet,
  ALLOWED_ORIGIN,
  SAMPLE_CLIENT_ID,
  SAMPLE_EDIT_KEY,
} from "./test-helpers.js";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

describe("W-4 방어 계층", () => {
  it("W-4 CORS preflight(OPTIONS) — 허용 origin은 204 + Allow 헤더", async () => {
    const req = new Request("https://proxy.test/g", {
      method: "OPTIONS",
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const res = await callWorker(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("W-4 preflight — 비허용 origin은 403 origin-forbidden", async () => {
    const req = new Request("https://proxy.test/g", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    const res = await callWorker(req);
    expect(res.status).toBe(403);
    expect((await jsonBody(res)).code).toBe("origin-forbidden");
  });

  it("W-4 실제 요청 — 비허용 origin은 403 (GitHub 호출 없음)", async () => {
    const replay = await makeReplayBody();
    const res = await callWorker(
      postCreate({ meta: makeMeta(replay), replayBody: replay.body }, "https://evil.example"),
    );
    expect(res.status).toBe(403);
    expect((await jsonBody(res)).code).toBe("origin-forbidden");
  });

  it("W-4 허용 응답에는 CORS 헤더가, origin 없는 요청에는 미부착", async () => {
    const gist = gistResponse("d1", { "meta.json": "{}" });
    mockGet("d1", gist);
    const res = await callWorker(new Request("https://proxy.test/g/d1", { method: "GET" })); // Origin 없음
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("W-4 크기 게이트(생성) — 본문 1.2MB 초과 시 413 (헤더+파싱 후 실측 이중 검사)", async () => {
    // readJsonBody가 GitHub 호출·스키마 검증 이전에 차단하므로 인터셉터 불필요.
    const res = await callWorker(
      postCreate({ meta: { junk: true }, replayBody: "A".repeat(1_300_000) }),
    );
    expect(res.status).toBe(413);
    expect((await jsonBody(res)).code).toBe("payload-too-large");
  });

  it("W-4 크기 게이트(노트) — 본문 900KB 초과 시 413", async () => {
    // editKey를 거대하게 만들어 본문을 부풀림 → 스키마 이전 크기 게이트에서 차단.
    const res = await callWorker(
      putNotes("dSize", {
        clientId: SAMPLE_CLIENT_ID,
        editKey: "x".repeat(1_000_000),
        file: makeNotesFile(),
      }),
    );
    expect(res.status).toBe(413);
    expect((await jsonBody(res)).code).toBe("payload-too-large");
  });

  it("W-4 WRITE_ENABLED=false → 쓰기 503 (생성·노트 공통)", async () => {
    const replay = await makeReplayBody();
    const create = await callWorker(
      postCreate({ meta: makeMeta(replay), replayBody: replay.body }),
      { WRITE_ENABLED: "false" },
    );
    expect(create.status).toBe(503);
    expect((await jsonBody(create)).code).toBe("writes-disabled");

    const note = await callWorker(
      putNotes("gW", {
        clientId: SAMPLE_CLIENT_ID,
        editKey: SAMPLE_EDIT_KEY,
        file: makeNotesFile(),
      }),
      { WRITE_ENABLED: "false" },
    );
    expect(note.status).toBe(503);
  });

  it("W-4 Turnstile 활성 — 유효 토큰 통과", async () => {
    fetchMock
      .get("https://challenges.cloudflare.com")
      .intercept({ method: "POST", path: "/turnstile/v0/siteverify" })
      .reply(200, { success: true });
    const replay = await makeReplayBody();
    mockCreate(gistResponse("gT", { "meta.json": "{}" }));
    const res = await callWorker(
      postCreate({ meta: makeMeta(replay), replayBody: replay.body, turnstileToken: "good" }),
      { TURNSTILE_SECRET: "ts-secret" },
    );
    expect(res.status).toBe(201);
  });

  it("W-4 Turnstile 활성 — 실패 토큰은 429 (GitHub 호출 없음)", async () => {
    fetchMock
      .get("https://challenges.cloudflare.com")
      .intercept({ method: "POST", path: "/turnstile/v0/siteverify" })
      .reply(200, { success: false });
    const replay = await makeReplayBody();
    const res = await callWorker(
      postCreate({ meta: makeMeta(replay), replayBody: replay.body, turnstileToken: "bad" }),
      { TURNSTILE_SECRET: "ts-secret" },
    );
    expect(res.status).toBe(429);
    expect((await jsonBody(res)).code).toBe("rate-limited");
  });

  it("W-4 Turnstile 비활성(시크릿 미설정) — 토큰 없이 통과", async () => {
    const replay = await makeReplayBody();
    mockCreate(gistResponse("gN", { "meta.json": "{}" }));
    const res = await callWorker(postCreate({ meta: makeMeta(replay), replayBody: replay.body })); // TURNSTILE_SECRET 없음
    expect(res.status).toBe(201);
  });
});
