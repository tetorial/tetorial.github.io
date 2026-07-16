import { fetchMock, env } from "cloudflare:test";
import { beforeAll, afterEach, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import {
  callWorker,
  postCreate,
  putNotes,
  getRead,
  makeMeta,
  makeReplayBody,
  makeNotesFile,
  gistResponse,
  existingNotesContent,
  mockCreate,
  mockGet,
  mockPatch,
  SAMPLE_CLIENT_ID,
  SAMPLE_EDIT_KEY,
} from "./test-helpers.js";

const PAT = env.GIST_PAT; // "TEST_PAT_MUST_NOT_LEAK"
const FILENAME = `notes-${SAMPLE_CLIENT_ID}.json`;

let logged: string[];
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
beforeEach(() => {
  logged = [];
  logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  });
});
afterEach(() => {
  logSpy.mockRestore();
  fetchMock.assertNoPendingInterceptors();
});
afterAll(() => {
  // 픽스처 자체가 시크릿을 담고 있으니, 상수가 비어있지 않은지 확인 (assert가 무의미해지지 않도록)
  expect(PAT.length).toBeGreaterThan(0);
  expect(SAMPLE_EDIT_KEY.length).toBeGreaterThan(0);
});

function assertClean(bodyText: string): void {
  expect(bodyText).not.toContain(PAT);
  expect(bodyText).not.toContain(SAMPLE_EDIT_KEY);
  for (const line of logged) {
    expect(line).not.toContain(PAT);
    expect(line).not.toContain(SAMPLE_EDIT_KEY);
  }
}

describe("W-6 시크릿 위생 (응답·로그에 PAT/editKey 부재)", () => {
  it("W-6 생성 성공 경로 — 응답·로그에 시크릿 없음", async () => {
    const replay = await makeReplayBody();
    mockCreate(gistResponse("s1", { "meta.json": "{}", "replay.ttrm.gz.b64": "x" }));
    const res = await callWorker(postCreate({ meta: makeMeta(replay), replayBody: replay.body }));
    expect(res.status).toBe(201);
    assertClean(await res.text());
    expect(logged.length).toBeGreaterThan(0); // 로깅은 실제로 일어났다
  });

  it("W-6 노트 신규 — editKey를 다뤄도 응답·로그에 없음", async () => {
    mockGet("s2", gistResponse("s2", { "meta.json": "{}" }));
    mockPatch("s2", gistResponse("s2", { [FILENAME]: "{}" }));
    const res = await callWorker(
      putNotes("s2", {
        clientId: SAMPLE_CLIENT_ID,
        editKey: SAMPLE_EDIT_KEY,
        file: makeNotesFile(),
      }),
    );
    expect(res.status).toBe(200);
    assertClean(await res.text());
  });

  it("W-6 editKey 불일치 403 — 오류 응답·로그에 editKey 없음", async () => {
    const existing = await existingNotesContent(SAMPLE_CLIENT_ID, "다른-키");
    mockGet("s3", gistResponse("s3", { "meta.json": "{}", [FILENAME]: existing }));
    const res = await callWorker(
      putNotes("s3", {
        clientId: SAMPLE_CLIENT_ID,
        editKey: SAMPLE_EDIT_KEY,
        file: makeNotesFile(),
      }),
    );
    expect(res.status).toBe(403);
    assertClean(await res.text());
  });

  it("W-6 업스트림 오류 경로 — 응답·로그에 PAT 없음", async () => {
    mockGet("s4", null, 500);
    const res = await callWorker(getRead("s4"));
    expect(res.status).toBe(502);
    assertClean(await res.text());
  });

  it("W-6 스키마 오류 detail에도 시크릿 없음", async () => {
    const res = await callWorker(
      putNotes("s5", { clientId: SAMPLE_CLIENT_ID, editKey: SAMPLE_EDIT_KEY, file: { bad: true } }),
    );
    expect(res.status).toBe(400);
    assertClean(await res.text());
  });
});
