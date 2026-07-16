// POST /g — 리플레이 Gist 생성 (§4-1, meta 명세 §5). 검증은 순서대로, 하나라도 실패 시 전체 거부.
import { metaFileSchema, META_LIMITS, type MetaFile } from "@tetorial/types";
import { ApiError } from "../errors.js";
import { writesEnabled, type Env } from "../env.js";
import { readJsonBody } from "../request.js";
import { verifyTurnstile } from "../turnstile.js";
import { zodError } from "../zod-error.js";
import { base64Decode, gunzip, sha256Hex, byteLength } from "../hash.js";
import { SERVICE_PREFIX, toGistIndex } from "../gist-index.js";
import { GitHubClient } from "../github.js";

/** POST /g 요청 본문 상한: 전체 1.2MB (§4-1 step2). replayBody 자체는 800KB (meta §5-2). */
const MAX_REQUEST_BYTES = 1_200_000;

function buildDescription(meta: MetaFile): string {
  const title = meta.title !== undefined && meta.title.length > 0 ? meta.title : "untitled";
  const rounds = meta.rounds.map.join(",");
  return `${SERVICE_PREFIX} ${title} · ${meta.replay.format} · rounds ${rounds}`;
}

export async function handleCreate(
  request: Request,
  env: Env,
  github: GitHubClient,
): Promise<Response> {
  if (!writesEnabled(env)) throw new ApiError("writes-disabled");

  const body = (await readJsonBody(request, MAX_REQUEST_BYTES)) as {
    meta?: unknown;
    replayBody?: unknown;
    turnstileToken?: unknown;
  };

  if (typeof body.replayBody !== "string") {
    throw new ApiError("bad-request", { message: "replayBody(문자열)가 필요합니다." });
  }
  await verifyTurnstile(env, body.turnstileToken);

  // 구조 검증 — 저장 본문은 파싱 결과(strip 정화)를 직렬화한다 (§4 저장 본문 규범).
  const parsed = metaFileSchema.safeParse(body.meta);
  if (!parsed.success) throw zodError(parsed.error);
  const meta = parsed.data;

  // replayBody 크기 (base64 기준) 상한
  if (byteLength(body.replayBody) > META_LIMITS.maxReplayBodyBytes) {
    throw new ApiError("payload-too-large");
  }

  // 무결성: base64 디코드 → gunzip → SHA-256·바이트 대조 (해시·바이트 대상 = 발췌 후·압축 전 원문)
  const decompressed = await gunzip(base64Decode(body.replayBody));
  const digest = await sha256Hex(decompressed);
  if (digest !== meta.replay.sha256) {
    throw new ApiError("integrity-mismatch", {
      message: "리플레이 해시가 meta.replay.sha256과 일치하지 않습니다.",
    });
  }
  if (decompressed.length !== meta.replay.bytes) {
    throw new ApiError("integrity-mismatch", {
      message: "리플레이 바이트 수가 meta.replay.bytes와 일치하지 않습니다.",
    });
  }

  // 서버가 이기는 필드: createdAt (§4-3)
  meta.createdAt = new Date().toISOString();

  const created = await github.createGist({
    public: false,
    description: buildDescription(meta),
    files: {
      "meta.json": { content: JSON.stringify(meta) },
      [meta.replay.file]: { content: body.replayBody },
    },
  });

  return Response.json({ gistId: created.id, index: toGistIndex(created) }, { status: 201 });
}
