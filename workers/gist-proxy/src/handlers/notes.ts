// PUT /g/:gistId/notes — 노트 파일 생성/수정 (§4-2, notes 명세 §7). 검증은 순서대로.
import { notesFileSchema, NOTES_LIMITS, type NotesFile } from "@tetorial/types";
import { ApiError } from "../errors.js";
import { writesEnabled, type Env } from "../env.js";
import { readJsonBody } from "../request.js";
import { verifyTurnstile } from "../turnstile.js";
import { zodError } from "../zod-error.js";
import { sha256HexOfString, byteLength } from "../hash.js";
import { isServiceGist, toGistIndex } from "../gist-index.js";
import { GitHubClient, type GistApiResponse } from "../github.js";

/** PUT notes 요청 본문 상한 (§4-2 step2). */
const MAX_REQUEST_BYTES = 900_000;

/** 기존 파일에서 서버가 강제 유지하는 필드만 추출. 우리가 쓴 파일이므로 형식이 보장되나 방어적으로 검사. */
function readServerOwnedFields(raw: string): {
  editKeyHash: string;
  clientId: string;
  createdAt: string;
} {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new ApiError("upstream-error", { message: "기존 노트 파일을 읽지 못했습니다." });
  }
  const o = obj as Record<string, unknown>;
  if (
    typeof o.editKeyHash !== "string" ||
    typeof o.clientId !== "string" ||
    typeof o.createdAt !== "string"
  ) {
    throw new ApiError("upstream-error", { message: "기존 노트 파일 형식이 올바르지 않습니다." });
  }
  return { editKeyHash: o.editKeyHash, clientId: o.clientId, createdAt: o.createdAt };
}

/** 기존 노트 파일 본문을 얻는다. 인라인 content 우선(쿼터 0), truncated면 raw_url fallback(쿼터 밖). */
async function fetchExistingBody(gist: GistApiResponse, filename: string): Promise<string> {
  const f = gist.files[filename];
  if (f === undefined) throw new ApiError("upstream-error");
  if (f.content !== undefined && !f.truncated) return f.content;
  const res = await fetch(f.raw_url);
  if (!res.ok) throw new ApiError("upstream-error");
  return await res.text();
}

/** notes 파일 하나의 노트 수. 형식이 깨진 파일은 0으로 센다 — 손상 파일 하나가 gist 전체 쓰기를 막지 않게. */
function countNotes(raw: string): number {
  try {
    const o = JSON.parse(raw) as { notes?: unknown };
    return Array.isArray(o.notes) ? o.notes.length : 0;
  } catch {
    return 0;
  }
}

/**
 * 리플레이(=gist) 합산 노트 한도 (#35, M2E-1). 대상 파일을 요청본으로 교체했을 때의 총합이
 * NOTES_LIMITS.maxNotesPerReplay를 넘으면 422 limit-exceeded. 노트 수가 늘지 않는 수정은
 * 이미 한도에 도달한 gist에서도 통과한다 (초과 "생성"만 거부).
 */
async function assertReplayNotesLimit(
  gist: GistApiResponse,
  targetFilename: string,
  incomingCount: number,
): Promise<void> {
  let total = incomingCount;
  for (const name of Object.keys(gist.files)) {
    if (name === targetFilename || !/^notes-.+\.json$/.test(name)) continue;
    total += countNotes(await fetchExistingBody(gist, name));
  }
  if (total > NOTES_LIMITS.maxNotesPerReplay) {
    throw new ApiError("limit-exceeded", {
      message: `리플레이당 노트 한도(${NOTES_LIMITS.maxNotesPerReplay}개)를 초과합니다.`,
      detail: { limit: NOTES_LIMITS.maxNotesPerReplay, total },
    });
  }
}

export async function handleNotes(
  request: Request,
  env: Env,
  github: GitHubClient,
  gistId: string,
): Promise<Response> {
  if (!writesEnabled(env)) throw new ApiError("writes-disabled");

  const body = (await readJsonBody(request, MAX_REQUEST_BYTES)) as {
    clientId?: unknown;
    editKey?: unknown;
    file?: unknown;
    turnstileToken?: unknown;
  };

  if (typeof body.editKey !== "string" || body.editKey.length === 0) {
    throw new ApiError("bad-request", { message: "editKey가 필요합니다." });
  }
  await verifyTurnstile(env, body.turnstileToken);

  // 구조 검증 — 저장 본문은 파싱 결과(strip 정화)를 직렬화 (§4 저장 본문 규범)
  const parsed = notesFileSchema.safeParse(body.file);
  if (!parsed.success) throw zodError(parsed.error);
  const file: NotesFile = parsed.data;

  // clientId 3자 일치 (body == file.clientId; 파일명은 Worker가 조립 → 실질 2자 대조, §4-2 step4)
  if (body.clientId !== file.clientId) {
    throw new ApiError("bad-request", { message: "clientId가 일치하지 않습니다." });
  }
  const filename = `notes-${file.clientId}.json`;

  // 대상 gist 확인 + 서비스 규약 검증(비서비스 gist는 404 위장)
  const gist = await github.getGist(gistId);
  if (gist === null || !isServiceGist(gist)) throw new ApiError("not-found");

  const editKeyHash = await sha256HexOfString(body.editKey);
  const exists = gist.files[filename] !== undefined;

  if (exists) {
    // 수정: 기존 editKeyHash 대조 후 서버 소유 필드 강제 유지 (§4-3)
    const prev = readServerOwnedFields(await fetchExistingBody(gist, filename));
    if (editKeyHash !== prev.editKeyHash) throw new ApiError("edit-key-mismatch");
    file.editKeyHash = prev.editKeyHash;
    file.clientId = prev.clientId;
    file.createdAt = prev.createdAt;
  } else {
    // 신규: 해시는 서버 계산값으로 덮어씀(클라이언트 값 무시), createdAt는 서버 시각
    file.editKeyHash = editKeyHash;
    file.createdAt = new Date().toISOString();
  }
  file.updatedAt = new Date().toISOString();

  // 리플레이 합산 노트 한도 — 인증(editKey) 통과 후, 저장 직전 검사 (#35, M2E-1)
  await assertReplayNotesLimit(gist, filename, file.notes.length);

  // 직렬화 크기 상한 (types는 파싱된 객체만 보므로 크기 강제는 Worker 몫, §6·README)
  const content = JSON.stringify(file);
  if (byteLength(content) > NOTES_LIMITS.maxFileBytes) throw new ApiError("payload-too-large");

  // 격리: PATCH 페이로드에 오직 이 노트 파일 하나만 (§4-2 step8, notes §7-5)
  const patched = await github.patchGist(gistId, { [filename]: { content } });

  return Response.json({ gistId, file: filename, index: toGistIndex(patched) });
}
