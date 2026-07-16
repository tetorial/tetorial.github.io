import { fetchMock } from "cloudflare:test";
import { beforeAll, afterEach, describe, it, expect } from "vitest";
import { callWorker, jsonBody, getRead, gistResponse, mockGet } from "./test-helpers.js";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

describe("W-3 읽기 (GET /g/:gistId)", () => {
  it("W-3 GistIndex 형태 + raw_url 원본 그대로 전달", async () => {
    const gist = gistResponse("read1", { "meta.json": '{"a":1}', "replay.ttrm.gz.b64": "xxxx" });
    mockGet("read1", gist);

    const res = await callWorker(getRead("read1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      gistId: string;
      files: { name: string; size: number; rawUrl: string; truncated: boolean }[];
      fetchedAt: string;
    };
    expect(body.gistId).toBe("read1");
    expect(typeof body.fetchedAt).toBe("string");
    const meta = body.files.find((f) => f.name === "meta.json")!;
    expect(meta.rawUrl).toBe("https://gist.githubusercontent.com/raw/meta.json"); // 원본 그대로
    expect(meta.truncated).toBe(false);
    // 본문은 포함하지 않는다
    expect(JSON.stringify(body)).not.toContain('"content"');
  });

  it("W-3 60초 캐시 — 미스(GitHub 1회) 후 히트(GitHub 0회)", async () => {
    const gist = gistResponse("cache1", { "meta.json": "{}" });
    mockGet("cache1", gist); // 인터셉터 1개만 등록 → 두 번째 호출이 GitHub에 가면 실패

    const miss = await callWorker(getRead("cache1"));
    expect(miss.headers.get("X-Cache")).toBe("MISS");

    const hit = await callWorker(getRead("cache1"));
    expect(hit.headers.get("X-Cache")).toBe("HIT");
    const body = (await hit.json()) as { gistId: string };
    expect(body.gistId).toBe("cache1");
    // afterEach의 assertNoPendingInterceptors가 "GitHub는 정확히 1회 호출됨"을 보장 (히트는 미호출)
  });

  it("W-3 존재하지 않는 gist는 404", async () => {
    mockGet("missing", null, 404);
    const res = await callWorker(getRead("missing"));
    expect(res.status).toBe(404);
    expect((await jsonBody(res)).code).toBe("not-found");
  });

  it("W-3 서비스 규약 외([tetorial] 없음) gist는 404로 위장", async () => {
    const foreign = gistResponse("foreign", { "a.txt": "hi" }, "someone else's gist");
    mockGet("foreign", foreign);
    const res = await callWorker(getRead("foreign"));
    expect(res.status).toBe(404);
    expect((await jsonBody(res)).code).toBe("not-found");
  });
});
