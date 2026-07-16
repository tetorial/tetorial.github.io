import { fetchMock } from "cloudflare:test";
import { beforeAll, afterEach, describe, it, expect } from "vitest";
import { callWorker, jsonBody, ALLOWED_ORIGIN } from "./test-helpers.js";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

describe("라우팅 — healthz·404·405", () => {
  it("healthz 200 (origin 무관)", async () => {
    const res = await callWorker(new Request("https://proxy.test/healthz"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "gist-proxy" });
  });

  it("healthz는 GET만 — POST는 405", async () => {
    const res = await callWorker(new Request("https://proxy.test/healthz", { method: "POST" }));
    expect(res.status).toBe(405);
    expect((await jsonBody(res)).code).toBe("method-not-allowed");
  });

  it("미지의 경로는 404", async () => {
    const res = await callWorker(
      new Request("https://proxy.test/nope", { headers: { Origin: ALLOWED_ORIGIN } }),
    );
    expect(res.status).toBe(404);
    expect((await jsonBody(res)).code).toBe("not-found");
  });

  it("POST /g는 존재하지만 GET /g는 405", async () => {
    const res = await callWorker(
      new Request("https://proxy.test/g", { method: "GET", headers: { Origin: ALLOWED_ORIGIN } }),
    );
    expect(res.status).toBe(405);
  });

  it("PUT /g/:id/notes 외 메서드는 405", async () => {
    const res = await callWorker(
      new Request("https://proxy.test/g/abc/notes", {
        method: "GET",
        headers: { Origin: ALLOWED_ORIGIN },
      }),
    );
    expect(res.status).toBe(405);
  });
});
