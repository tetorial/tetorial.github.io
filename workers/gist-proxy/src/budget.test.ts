import { fetchMock } from "cloudflare:test";
import { beforeAll, afterEach, describe, it, expect } from "vitest";
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
  GITHUB,
  SAMPLE_CLIENT_ID,
  SAMPLE_EDIT_KEY,
} from "./test-helpers.js";

const FILENAME = `notes-${SAMPLE_CLIENT_ID}.json`;

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

/** 메서드별 GitHub API 호출 수 카운터 인터셉터를 건다. 초과 호출은 disableNetConnect로 실패한다. */
function counter() {
  const counts = { POST: 0, GET: 0, PATCH: 0 };
  return {
    counts,
    onPost(id: string) {
      fetchMock
        .get(GITHUB)
        .intercept({ method: "POST", path: "/gists" })
        .reply(() => {
          counts.POST++;
          return { statusCode: 201, data: gistResponse(id, { "meta.json": "{}" }) };
        });
    },
    onGet(id: string, data: ReturnType<typeof gistResponse>) {
      fetchMock
        .get(GITHUB)
        .intercept({ method: "GET", path: `/gists/${id}` })
        .reply(() => {
          counts.GET++;
          return { statusCode: 200, data };
        });
    },
    onPatch(id: string) {
      fetchMock
        .get(GITHUB)
        .intercept({ method: "PATCH", path: `/gists/${id}` })
        .reply(() => {
          counts.PATCH++;
          return { statusCode: 200, data: gistResponse(id, { [FILENAME]: "{}" }) };
        });
    },
  };
}

describe("W-7 예산 (쓰기당 GitHub API 호출 수 = §2 표)", () => {
  it("W-7 POST /g = POST /gists 1회뿐", async () => {
    const c = counter();
    c.onPost("b1");
    const replay = await makeReplayBody();
    await callWorker(postCreate({ meta: makeMeta(replay), replayBody: replay.body }));
    expect(c.counts).toEqual({ POST: 1, GET: 0, PATCH: 0 });
  });

  it("W-7 PUT notes(신규) = GET 1 + PATCH 1", async () => {
    const c = counter();
    c.onGet("b2", gistResponse("b2", { "meta.json": "{}" }));
    c.onPatch("b2");
    await callWorker(
      putNotes("b2", {
        clientId: SAMPLE_CLIENT_ID,
        editKey: SAMPLE_EDIT_KEY,
        file: makeNotesFile(),
      }),
    );
    expect(c.counts).toEqual({ POST: 0, GET: 1, PATCH: 1 });
  });

  it("W-7 PUT notes(수정) = GET 1 + PATCH 1 (기존 본문은 인라인 — 추가 호출 없음)", async () => {
    const c = counter();
    const existing = await existingNotesContent();
    c.onGet("b3", gistResponse("b3", { "meta.json": "{}", [FILENAME]: existing }));
    c.onPatch("b3");
    await callWorker(
      putNotes("b3", {
        clientId: SAMPLE_CLIENT_ID,
        editKey: SAMPLE_EDIT_KEY,
        file: makeNotesFile(),
      }),
    );
    expect(c.counts).toEqual({ POST: 0, GET: 1, PATCH: 1 });
  });

  it("W-7 GET /g = GET 1회(미스), 0회(히트)", async () => {
    const c = counter();
    c.onGet("b4", gistResponse("b4", { "meta.json": "{}" }));
    await callWorker(getRead("b4")); // 미스
    await callWorker(getRead("b4")); // 히트 — GitHub 미호출
    expect(c.counts).toEqual({ POST: 0, GET: 1, PATCH: 0 });
  });
});
