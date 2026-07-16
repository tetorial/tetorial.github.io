// .ttrm/.ttr 파싱과 정규화 — 명세 §2.
//
// 실물 파일은 평문 JSON이다(스파이크 R-2 — theorypack은 triangle 테스트 아카이브 전용).
// 파서는 관용적으로 동작한다: 모르는 필드는 `raw`에 보존하고, 필요한 필드 부재 시에만 오류.
import type { TetrioFrame, TetrioRoundOptions } from "./convert.js";

/** 정규화된 리플레이 문서. `raw`는 발췌 재조립·전방 호환을 위해 원문을 그대로 보존한다. */
export interface ReplayDoc {
  kind: "ttrm" | "ttr";
  info: {
    tetrioReplayId: string | null; // 최상위 id. 로컬 저장본은 null (ttrm 샘플)
    gamemode: string | null;
    playedAt: string | null; // 최상위 ts (ISO 8601)
    users: { id: string; username: string }[];
    formatVersion: number | null; // 라운드 옵션의 version (실측 샘플 = 19)
  };
  rounds: RoundEntry[][]; // [라운드][플레이어]. ttr은 1라운드 × 1플레이어로 정규화
  raw: unknown; // 원문 (발췌 재조립용)
}

export interface RoundEntry {
  userId: string;
  username: string;
  alive: boolean | null; // ttr은 null (승패 개념 없음)
  options: TetrioRoundOptions; // replay.options 원문 (기본값 폴백은 convert에서)
  events: TetrioFrame[];
  stats: unknown | null; // pps/apm 등 (displayCache 후보)
}

export type ParseError = {
  code: "invalid-json" | "unknown-structure" | "empty-rounds";
  detail?: string;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ParseError };

// ---------------------------------------------------------------------------
// 원문(느슨한) 구조 — 파싱 전 unknown에서 안전하게 좁히기 위한 최소 형태
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** 라운드 항목 하나(`{ id, username, alive, stats, replay: { options, events } }`)를 정규화. */
function normalizeEntry(raw: unknown): RoundEntry | null {
  if (!isObject(raw)) return null;
  const replay = raw["replay"];
  if (!isObject(replay)) return null;
  const options = replay["options"];
  const events = replay["events"];
  if (!isObject(options) || !Array.isArray(events)) return null;
  return {
    userId: asString(raw["id"]) ?? "",
    username: asString(raw["username"]) ?? "",
    alive: typeof raw["alive"] === "boolean" ? raw["alive"] : null,
    options: options as unknown as TetrioRoundOptions,
    events: events as TetrioFrame[],
    stats: "stats" in raw ? (raw["stats"] ?? null) : null,
  };
}

function normalizeUsers(raw: unknown): { id: string; username: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObject).map((u) => ({
    id: asString(u["id"]) ?? "",
    username: asString(u["username"]) ?? "",
  }));
}

/**
 * 라운드 항목을 top-level `users[]` 순서(= 보드/플레이어 인덱스)로 정규화한다.
 *
 * 실물 ttrm의 `replay.rounds[r]`는 **라운드별 리더보드(승자 우선) 순**으로 저장되므로,
 * 위치 인덱스를 그대로 쓰면 같은 인덱스가 라운드마다 다른 플레이어를 가리킨다
 * (승자가 항상 인덱스 0이 되는 결함 — QA 스모크 §1). `userId`를 근거로 `users[]` 순서에
 * 맞춰 재정렬해 `doc.rounds[r][p]`가 라운드와 무관하게 같은 보드를 가리키게 한다.
 * 이로써 origin.player·displayCache.players·roundWinners의 인덱스가 모두 정합한다
 * (meta 명세 §2, §8). `users`에 없는 id는 원래 상대순서를 유지한 채 뒤로 보낸다(관용적 처리).
 */
function orderByUsers(entries: RoundEntry[], users: { id: string }[]): RoundEntry[] {
  if (users.length === 0) return entries;
  const rank = new Map(users.map((u, i) => [u.id, i]));
  return entries
    .map((entry, i) => ({ entry, i }))
    .sort((a, b) => {
      const ra = rank.get(a.entry.userId) ?? Number.POSITIVE_INFINITY;
      const rb = rank.get(b.entry.userId) ?? Number.POSITIVE_INFINITY;
      return ra - rb || a.i - b.i; // 동순위·미등록은 원래 순서 유지(안정 정렬)
    })
    .map((x) => x.entry);
}

function err(code: ParseError["code"], detail?: string): ParseResult<never> {
  return { ok: false, error: detail === undefined ? { code } : { code, detail } };
}

/**
 * .ttrm/.ttr 텍스트를 파싱해 정규화한다.
 *
 * - ttrm: `replay.rounds`(Round[][])를 그대로 정규화.
 * - ttr: 라운드 래핑 없는 단판 → **1라운드 × 1플레이어**로 정규화(`alive = null`).
 * - 오류: JSON 파싱 실패(`invalid-json`), 구조 판별 불가·필수 필드 부재(`unknown-structure`),
 *   재생 가능한 라운드가 하나도 없음(`empty-rounds`).
 */
export function parseReplay(text: string): ParseResult<ReplayDoc> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return err("invalid-json", e instanceof Error ? e.message : String(e));
  }

  if (!isObject(raw)) return err("unknown-structure", "최상위가 객체가 아님");
  const replay = raw["replay"];
  if (!isObject(replay)) return err("unknown-structure", "replay 필드 부재");

  const users = normalizeUsers(raw["users"]);

  const info = (rounds: RoundEntry[][]): ReplayDoc["info"] => ({
    tetrioReplayId: asString(raw["id"]),
    gamemode: asString(raw["gamemode"]),
    playedAt: asString(raw["ts"]),
    users,
    // formatVersion ← 첫 라운드 항목 옵션의 version (실측 샘플 = 19)
    formatVersion:
      typeof rounds[0]?.[0]?.options.version === "number" ? rounds[0][0].options.version : null,
  });

  // --- ttrm: replay.rounds 존재 ---
  if (Array.isArray(replay["rounds"])) {
    const rawRounds = replay["rounds"];
    if (rawRounds.length === 0) return err("empty-rounds", "rounds 배열이 비어 있음");
    const rounds: RoundEntry[][] = [];
    for (const rawRound of rawRounds) {
      if (!Array.isArray(rawRound)) return err("unknown-structure", "라운드가 배열이 아님");
      const entries: RoundEntry[] = [];
      for (const rawEntry of rawRound) {
        const entry = normalizeEntry(rawEntry);
        if (entry === null) return err("unknown-structure", "라운드 항목 정규화 실패");
        entries.push(entry);
      }
      if (entries.length === 0) return err("empty-rounds", "플레이어 없는 라운드");
      // 라운드 항목을 users[](보드/플레이어 인덱스) 순서로 정규화 — W4-a 버그1.
      rounds.push(orderByUsers(entries, users));
    }
    return { ok: true, value: { kind: "ttrm", info: info(rounds), rounds, raw } };
  }

  // --- ttr: replay.events 존재 → 단판, 1×1 정규화 ---
  if (Array.isArray(replay["events"])) {
    const options = replay["options"];
    if (!isObject(options)) return err("unknown-structure", "ttr replay.options 부재");
    const entry: RoundEntry = {
      userId: users[0]?.id ?? "",
      username: users[0]?.username ?? asString((options as Json)["username"]) ?? "",
      alive: null, // ttr은 승패 개념 없음 (§2)
      options: options as unknown as TetrioRoundOptions,
      events: replay["events"] as TetrioFrame[],
      stats: "results" in replay ? (replay["results"] ?? null) : null,
    };
    const rounds: RoundEntry[][] = [[entry]];
    return { ok: true, value: { kind: "ttr", info: info(rounds), rounds, raw } };
  }

  return err("unknown-structure", "replay.rounds/replay.events 모두 부재");
}
