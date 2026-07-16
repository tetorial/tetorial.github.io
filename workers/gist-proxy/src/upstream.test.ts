import { fetchMock } from "cloudflare:test";
import { beforeAll, afterEach, describe, it, expect } from "vitest";
import {
  callWorker,
  jsonBody,
  postCreate,
  getRead,
  makeMeta,
  makeReplayBody,
  mockCreateRaw,
  mockGetRaw,
} from "./test-helpers.js";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

describe("W-5 오류 번역 (업스트림 본문 비중계)", () => {
  it("W-5 GitHub 403 rate limit → 503 upstream-rate-limited + Retry-After", async () => {
    mockCreateRaw(403, {
      "x-ratelimit-remaining": "0",
      "retry-after": "42",
      "x-secret-upstream": "LEAK?",
    });
    const replay = await makeReplayBody();
    const res = await callWorker(postCreate({ meta: makeMeta(replay), replayBody: replay.body }));
    expect(res.status).toBe(503);
    const body = await jsonBody(res);
    expect(body.code).toBe("upstream-rate-limited");
    expect(res.headers.get("Retry-After")).toBe("42");
    // 업스트림 본문·헤더는 중계하지 않는다
    expect(res.headers.get("x-secret-upstream")).toBeNull();
  });

  it("W-5 GitHub 403 + x-ratelimit-reset만 → Retry-After 초 계산", async () => {
    const reset = Math.floor(Date.now() / 1000) + 100;
    mockGetRaw("rl", 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) });
    const res = await callWorker(getRead("rl"));
    expect(res.status).toBe(503);
    const retry = Number(res.headers.get("Retry-After"));
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(100);
  });

  it("W-5 GitHub 5xx → 502 upstream-error", async () => {
    mockCreateRaw(500, {});
    const replay = await makeReplayBody();
    const res = await callWorker(postCreate({ meta: makeMeta(replay), replayBody: replay.body }));
    expect(res.status).toBe(502);
    expect((await jsonBody(res)).code).toBe("upstream-error");
  });

  it("W-5 업스트림 본문을 응답에 담지 않는다 (읽기 502)", async () => {
    mockGetRaw("boom", 503, {});
    const res = await callWorker(getRead("boom"));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain("boom-upstream-body");
    expect(JSON.parse(text).code).toBe("upstream-error");
  });
});
