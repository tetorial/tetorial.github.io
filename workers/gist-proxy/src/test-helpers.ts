// 테스트 공용 헬퍼 (테스트 파일이 아님 — *.test.ts 아님). fixture·인코딩·fetchMock 설정.
import {
  fetchMock,
  env as baseEnv,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { MetaFile, NotesFile } from "@tetorial/types";
import { sha256Hex, sha256HexOfString } from "./hash.js";
import type { GistApiResponse, GistFile } from "./github.js";
import type { Env } from "./env.js";
import worker from "./index.js";

export const GITHUB = "https://api.github.com";
export const ALLOWED_ORIGIN = "https://tetorial.example";
export const SAMPLE_EDIT_KEY = "super-secret-edit-key-1234";
export const SAMPLE_CLIENT_ID = "k3XmP9qLwR2v"; // [A-Za-z0-9_-]{12}

// ── 인코딩 (workerd Web 표준) ────────────────────────────────────────────────
async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const stream = new Response(new Blob([bytes]).stream().pipeThrough(cs));
  return new Uint8Array(await stream.arrayBuffer());
}
function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 리플레이 본문(gzip+base64)과 그에 맞는 sha256·bytes를 함께 생성 (해시·바이트 대상 = 압축 전 원문). */
export async function makeReplayBody(
  content = "REPLAY-CONTENT-원문-바이트열",
): Promise<{ body: string; sha256: string; bytes: number }> {
  const raw = new TextEncoder().encode(content);
  return { body: toBase64(await gzip(raw)), sha256: await sha256Hex(raw), bytes: raw.length };
}

// ── fixture ──────────────────────────────────────────────────────────────────
export function makeMeta(
  replay: { sha256: string; bytes: number },
  overrides: Partial<MetaFile> = {},
): MetaFile {
  return {
    schema: "tetorial.meta/1",
    createdAt: "2020-01-01T00:00:00Z", // 서버가 덮어씀 — 초기값은 무의미
    title: "FT3 복기용",
    description: "발췌 업로드",
    uploader: { name: "corun" },
    replay: {
      platform: "tetrio",
      format: "ttrm",
      file: "replay.ttrm.gz.b64",
      encoding: "gzip+base64",
      bytes: replay.bytes,
      sha256: replay.sha256,
    },
    rounds: { totalInOriginal: 7, map: [2, 5] },
    ...overrides,
  };
}

export function makeNotesFile(overrides: Partial<NotesFile> = {}): NotesFile {
  return {
    schema: "tetorial.notes/1",
    clientId: SAMPLE_CLIENT_ID,
    editKeyHash: "0".repeat(64), // 서버가 덮어씀
    author: { name: "corun" },
    createdAt: "2020-01-01T00:00:00Z",
    updatedAt: "2020-01-01T00:00:00Z",
    notes: [
      {
        id: "aB3dE5fG",
        origin: { type: "replay", round: 2, player: 0, frame: 841 },
        snapshot: {
          ruleset: { preset: "srs+", spinBonuses: "all-mini+" },
          board: { width: 10, rows: ["JJJGGGGGG_", "J_SSGGGGG_", "__SS______"] },
          current: "T",
          hold: "I",
          holdLocked: false,
          queue: "LOSZJITSZL",
          counters: { b2b: 2, combo: 0 },
        },
        pages: [
          {
            id: "p1Q2w3E4",
            state: {
              board: { width: 10, rows: ["J_SSGGGGG_", "__SS______"] },
              current: "L",
              hold: "I",
              holdLocked: false,
              queueUsed: 1,
              counters: { b2b: 3, combo: 1 },
            },
            comment: "여기서 TSD가 가능했음",
          },
        ],
        createdAt: "2020-01-01T00:00:00Z",
        updatedAt: "2020-01-01T00:00:00Z",
      },
    ],
    ...overrides,
  };
}

// ── GitHub gist 응답 구성 ─────────────────────────────────────────────────────
function file(filename: string, content: string): GistFile {
  return {
    filename,
    size: new TextEncoder().encode(content).length,
    raw_url: `https://gist.githubusercontent.com/raw/${filename}`,
    truncated: false,
    content,
  };
}

/** 서비스 규약([tetorial]) gist 응답. files: filename→content 맵. */
export function gistResponse(
  id: string,
  files: Record<string, string>,
  description = "[tetorial] x · ttrm · rounds 2,5",
): GistApiResponse {
  const out: Record<string, GistFile> = {};
  for (const [name, content] of Object.entries(files)) out[name] = file(name, content);
  return { id, description, files: out };
}

/** 기존 노트 파일 content (수정 경로 대조용). editKeyHash를 넣어 서버 대조를 통과/실패시킨다. */
export async function existingNotesContent(
  clientId = SAMPLE_CLIENT_ID,
  editKey = SAMPLE_EDIT_KEY,
  createdAt = "2019-06-06T00:00:00Z",
): Promise<string> {
  const f = makeNotesFile({ clientId, editKeyHash: await sha256HexOfString(editKey), createdAt });
  return JSON.stringify(f);
}

// ── fetchMock 인터셉터 (모두 1회성 — 소비되지 않으면 assertNoPendingInterceptors가 잡는다) ──
export function mockCreate(response: GistApiResponse, status = 201): void {
  fetchMock.get(GITHUB).intercept({ method: "POST", path: "/gists" }).reply(status, response);
}
export function mockGet(id: string, response: GistApiResponse | null, status = 200): void {
  fetchMock
    .get(GITHUB)
    .intercept({ method: "GET", path: `/gists/${id}` })
    .reply(status, response ?? {});
}
export function mockPatch(id: string, response: GistApiResponse, status = 200): void {
  fetchMock
    .get(GITHUB)
    .intercept({ method: "PATCH", path: `/gists/${id}` })
    .reply(status, response);
}
/** 헤더 포함 오류 응답(rate limit 등) 모킹. */
export function mockGetRaw(id: string, status: number, headers: Record<string, string>): void {
  fetchMock
    .get(GITHUB)
    .intercept({ method: "GET", path: `/gists/${id}` })
    .reply(status, "", { headers });
}
export function mockCreateRaw(status: number, headers: Record<string, string> = {}): void {
  fetchMock
    .get(GITHUB)
    .intercept({ method: "POST", path: "/gists" })
    .reply(status, "", { headers });
}

function parseBody(body: unknown): unknown {
  return typeof body === "string" ? JSON.parse(body) : {};
}
/** POST /gists 요청 본문을 캡처하면서 응답을 모킹 (description·저장 본문 규범 검증용). */
export function mockCreateCapture(
  response: GistApiResponse,
  onBody: (b: unknown) => void,
  status = 201,
): void {
  fetchMock
    .get(GITHUB)
    .intercept({ method: "POST", path: "/gists" })
    .reply((opts) => {
      onBody(parseBody(opts.body));
      return { statusCode: status, data: response };
    });
}
/** PATCH /gists/:id 요청 본문(files 페이로드)을 캡처하면서 응답을 모킹 (격리·서버 우선 필드 검증용). */
export function mockPatchCapture(
  id: string,
  response: GistApiResponse,
  onBody: (b: unknown) => void,
  status = 200,
): void {
  fetchMock
    .get(GITHUB)
    .intercept({ method: "PATCH", path: `/gists/${id}` })
    .reply((opts) => {
      onBody(parseBody(opts.body));
      return { statusCode: status, data: response };
    });
}

// ── 요청 빌더 & 워커 호출 ──────────────────────────────────────────────────────
function headers(origin: string | null): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (origin !== null) h["Origin"] = origin;
  return h;
}

export function postCreate(body: unknown, origin: string | null = ALLOWED_ORIGIN): Request {
  return new Request("https://proxy.test/g", {
    method: "POST",
    headers: headers(origin),
    body: JSON.stringify(body),
  });
}
export function putNotes(
  gistId: string,
  body: unknown,
  origin: string | null = ALLOWED_ORIGIN,
): Request {
  return new Request(`https://proxy.test/g/${gistId}/notes`, {
    method: "PUT",
    headers: headers(origin),
    body: JSON.stringify(body),
  });
}
export function getRead(gistId: string, origin: string | null = ALLOWED_ORIGIN): Request {
  return new Request(`https://proxy.test/g/${gistId}`, { method: "GET", headers: headers(origin) });
}

/** baseEnv(miniflare 바인딩) 위에 override를 얹어 워커를 호출. */
export async function callWorker(
  request: Request,
  envOverrides: Partial<Env> = {},
): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, { ...baseEnv, ...envOverrides }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/** 응답 JSON을 레코드로 읽는다(테스트 편의 — Response.json()은 unknown 반환). */
export async function jsonBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}
