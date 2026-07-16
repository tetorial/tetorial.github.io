// gist-proxy Worker 클라이언트 — PUBLIC_WORKER_URL 기반 thin fetch 래퍼(conventions §7).
// 응답 형태는 zod로 검증(apps-web §4). 오류는 WorkerError로 정규화(status·code·Retry-After).
// rawUrl은 Worker 응답의 값을 그대로 fetch하며 손조립하지 않는다(gist-proxy §3).
import { z } from "zod";
import type { MetaFile, NotesFile } from "@tetorial/types";
import { parseRetryAfter, type WorkerErrorBody } from "./errors.js";

/** GET /g/:id · POST/PUT 응답에 동봉되는 파일 인덱스(gist-proxy §3). */
export interface GistIndexFile {
  name: string;
  size: number;
  rawUrl: string;
  truncated: boolean;
}
export interface GistIndex {
  gistId: string;
  files: GistIndexFile[];
  fetchedAt: string;
}

const gistIndexSchema = z.object({
  gistId: z.string(),
  files: z.array(
    z.object({
      name: z.string(),
      size: z.number(),
      rawUrl: z.string(),
      truncated: z.boolean(),
    }),
  ),
  fetchedAt: z.string(),
});

const createResponseSchema = z.object({ gistId: z.string(), index: gistIndexSchema });
const putResponseSchema = z.object({
  gistId: z.string(),
  file: z.string(),
  index: gistIndexSchema,
});
const errorBodySchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  detail: z.unknown().optional(),
});

/** Worker 오류(비 2xx) — errors.toDisplayError의 입력을 그대로 담는다. */
export class WorkerError extends Error {
  readonly status: number;
  readonly body: WorkerErrorBody;
  readonly retryAfterMs: number | null;
  constructor(status: number, body: WorkerErrorBody, retryAfterMs: number | null) {
    super(`worker ${status} ${body.code}`);
    this.name = "WorkerError";
    this.status = status;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }
}

/** rawUrl fetch 실패(무결성 이전 단계 — 네트워크·비200). */
export class RawFetchError extends Error {
  constructor(readonly rawUrl: string, readonly status: number) {
    super(`raw fetch ${status}`);
    this.name = "RawFetchError";
  }
}

export interface CreateReplayInput {
  meta: MetaFile;
  replayBody: string; // gzip+base64
  turnstileToken?: string;
}
export interface PutNotesInput {
  clientId: string;
  editKey: string;
  file: NotesFile;
  turnstileToken?: string;
}

export interface WorkerClientOptions {
  /** Worker 베이스 URL. 생략 시 import.meta.env.PUBLIC_WORKER_URL. */
  baseUrl?: string;
  /** fetch 주입(테스트 mock). 생략 시 전역 fetch. */
  fetchImpl?: typeof fetch;
}

function resolveBaseUrl(explicit: string | undefined): string {
  const url = explicit ?? import.meta.env.PUBLIC_WORKER_URL;
  if (!url) {
    throw new Error(
      "PUBLIC_WORKER_URL이 설정되지 않았습니다 (conventions §7 — 저장·공유 기능 비활성).",
    );
  }
  return url.replace(/\/+$/, "");
}

export class WorkerClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: WorkerClientOptions = {}) {
    this.#baseUrl = resolveBaseUrl(options.baseUrl);
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /** POST /g — 리플레이 Gist 생성. */
  async createReplay(input: CreateReplayInput): Promise<{ gistId: string; index: GistIndex }> {
    const res = await this.#fetch(`${this.#baseUrl}/g`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pruneUndefined(input)),
    });
    return createResponseSchema.parse(await this.#json(res));
  }

  /** PUT /g/:id/notes — 노트 파일 생성/수정. */
  async putNotes(
    gistId: string,
    input: PutNotesInput,
  ): Promise<{ gistId: string; file: string; index: GistIndex }> {
    const res = await this.#fetch(`${this.#baseUrl}/g/${encodeURIComponent(gistId)}/notes`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pruneUndefined(input)),
    });
    return putResponseSchema.parse(await this.#json(res));
  }

  /** GET /g/:id — 파일 목록·rawUrl 조회(본문 없음). */
  async getIndex(gistId: string): Promise<GistIndex> {
    const res = await this.#fetch(`${this.#baseUrl}/g/${encodeURIComponent(gistId)}`, {
      method: "GET",
    });
    return gistIndexSchema.parse(await this.#json(res));
  }

  /** Worker 응답의 rawUrl을 그대로 fetch해 텍스트를 반환(손조립 금지 — gist-proxy §3). */
  async fetchRaw(rawUrl: string): Promise<string> {
    const res = await this.#fetch(rawUrl, { method: "GET" });
    if (!res.ok) throw new RawFetchError(rawUrl, res.status);
    return res.text();
  }

  /** 2xx면 JSON, 아니면 오류 본문을 파싱해 WorkerError throw. */
  async #json(res: Response): Promise<unknown> {
    if (res.ok) return res.json();
    let body: WorkerErrorBody = { code: `http-${res.status}` };
    try {
      const parsed = errorBodySchema.safeParse(await res.json());
      if (parsed.success) body = parsed.data;
    } catch {
      /* 비 JSON 오류 응답 — 코드 폴백 유지 */
    }
    const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
    throw new WorkerError(res.status, body, retryAfterMs);
  }
}

/** turnstileToken 등 undefined 필드를 직렬화에서 제거(훅만 준비 — v1 비활성). */
function pruneUndefined(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
