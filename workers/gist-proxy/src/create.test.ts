import { fetchMock } from "cloudflare:test";
import { beforeAll, afterEach, describe, it, expect } from "vitest";
import {
  callWorker,
  jsonBody,
  postCreate,
  makeMeta,
  makeReplayBody,
  gistResponse,
  mockCreateCapture,
} from "./test-helpers.js";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

describe("W-2 생성 (POST /g)", () => {
  it("W-2 정상 201 + description 규약 + createdAt 서버 덮어씀 + 미지 필드 strip", async () => {
    const replay = await makeReplayBody();
    const meta = makeMeta(replay, { title: "제목", createdAt: "1999-01-01T00:00:00Z" });
    // 스키마에 없는 미지 필드를 섞어 보낸다 → 저장 본문에서 제거되어야 함 (§4 저장 본문 규범)
    const dirty = { ...meta, evilField: "should-be-stripped" };

    let sentBody: Record<string, unknown> = {};
    mockCreateCapture(
      gistResponse("gNew", { "meta.json": "{}", "replay.ttrm.gz.b64": "x" }),
      (b) => {
        sentBody = b as Record<string, unknown>;
      },
    );

    const res = await callWorker(postCreate({ meta: dirty, replayBody: replay.body }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { gistId: string; index: { gistId: string } };
    expect(body.gistId).toBe("gNew");
    expect(body.index.gistId).toBe("gNew");

    // GitHub로 나간 본문 검증
    expect(sentBody.public).toBe(false);
    expect(sentBody.description).toBe("[tetorial] 제목 · ttrm · rounds 2,5");
    const files = sentBody.files as Record<string, { content: string }>;
    const storedMeta = JSON.parse(files["meta.json"]!.content) as Record<string, unknown>;
    expect(storedMeta.evilField).toBeUndefined(); // strip 정화
    expect(storedMeta.createdAt).not.toBe("1999-01-01T00:00:00Z"); // 서버 시각으로 덮어씀
    expect(files["replay.ttrm.gz.b64"]!.content).toBe(replay.body); // 리플레이 본문 원형 저장
  });

  it("W-2 title 없으면 description은 untitled", async () => {
    const replay = await makeReplayBody();
    const meta = makeMeta(replay, { title: undefined });
    let sent: Record<string, unknown> = {};
    mockCreateCapture(
      gistResponse("gU", { "meta.json": "{}" }),
      (b) => (sent = b as Record<string, unknown>),
    );
    await callWorker(postCreate({ meta, replayBody: replay.body }));
    expect(sent.description).toBe("[tetorial] untitled · ttrm · rounds 2,5");
  });

  it("W-2 해시 불일치 → 422 integrity-mismatch", async () => {
    const replay = await makeReplayBody();
    const meta = makeMeta({ sha256: "f".repeat(64), bytes: replay.bytes }); // 잘못된 해시
    const res = await callWorker(postCreate({ meta, replayBody: replay.body }));
    expect(res.status).toBe(422);
    expect((await jsonBody(res)).code).toBe("integrity-mismatch");
    // GitHub 호출 없이 조기 거부 (인터셉터 미등록 → assertNoPendingInterceptors 통과)
  });

  it("W-2 bytes 불일치 → 422 integrity-mismatch", async () => {
    const replay = await makeReplayBody();
    const meta = makeMeta({ sha256: replay.sha256, bytes: replay.bytes + 999 });
    const res = await callWorker(postCreate({ meta, replayBody: replay.body }));
    expect(res.status).toBe(422);
    expect((await jsonBody(res)).code).toBe("integrity-mismatch");
  });

  it("W-2 zod 한도 위반(title>100) → 422 limit-exceeded", async () => {
    const replay = await makeReplayBody();
    const meta = makeMeta(replay, { title: "가".repeat(101) });
    const res = await callWorker(postCreate({ meta, replayBody: replay.body }));
    expect(res.status).toBe(422);
    expect((await jsonBody(res)).code).toBe("limit-exceeded");
  });

  it("W-2 구조 위반(schema 값 오류) → 400 bad-request", async () => {
    const replay = await makeReplayBody();
    const meta = { ...makeMeta(replay), schema: "wrong/schema" };
    const res = await callWorker(postCreate({ meta, replayBody: replay.body }));
    expect(res.status).toBe(400);
    expect((await jsonBody(res)).code).toBe("bad-request");
  });

  it("W-2 ttr 교차검증 위반(totalInOriginal≠1) → 400", async () => {
    const replay = await makeReplayBody();
    const meta = makeMeta(replay, {
      replay: {
        platform: "tetrio",
        format: "ttr",
        file: "replay.ttr.gz.b64",
        encoding: "gzip+base64",
        bytes: replay.bytes,
        sha256: replay.sha256,
      },
      rounds: { totalInOriginal: 7, map: [0] },
    });
    const res = await callWorker(postCreate({ meta, replayBody: replay.body }));
    expect(res.status).toBe(400);
  });

  it("replayBody 문자열 아님 → 400", async () => {
    const replay = await makeReplayBody();
    const meta = makeMeta(replay);
    const res = await callWorker(postCreate({ meta, replayBody: 12345 }));
    expect(res.status).toBe(400);
  });
});
