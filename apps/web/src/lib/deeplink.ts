// 경로형 딥링크 조립·파싱 쌍 (apps-web-m1d §2 — F-1 동결 규범).
//
//   {origin}/replays/<replayId>[?note=<clientId>.<noteId>][#p<n>]
//
// - replayId 발신: gistId가 32자 hex면 16바이트 → base64url 22자(패딩 없음).
//   아니면 원문 그대로 (GitHub id 체계 변경 대비 fallback — D-19).
// - replayId 수신: 세그먼트가 22자 + [A-Za-z0-9_-]면 base64url → 32자 hex 복원.
//   아니면 원문을 gistId로 사용 (판별은 길이+문자집합 — 현행 32-hex는 22자가 될 수 없어 모호성 없음).
// - note 발신은 항상 <clientId>.<noteId> 한정형(M1d-2). 수신은 bare noteId도 관용 해석 유지.
// - fragment #p<n>은 1-기준 페이지 서수, best-effort(M1d-3) — 부재·범위 밖이면 첫 페이지.
// - 구형 ?gist=·page= 해석은 제거됨(M1d-4 — 공유된 링크 0개, 동결 표면 최소화).
import { NOTE_ID_PATTERN } from "@tetorial/types";
import { withBase, stripBase } from "./base-url.js";

export interface DeepLink {
  /** 경로 /replays/<seg>에서 복원한 gistId. 경로형이 아니면 null(로컬 열기). */
  gistId: string | null;
  /** note 파라미터의 noteId 부분(NOTE_ID_PATTERN). 없으면 null. */
  noteId: string | null;
  /** `<clientId>.<noteId>` 한정 형식일 때의 clientId. bare 형식이면 null. */
  clientId: string | null;
  /** fragment #p<n>의 1-기준 페이지 서수. 없거나 형식이 아니면 null(→ 첫 페이지). */
  page: number | null;
}

const CLIENT_ID_RE = /^[A-Za-z0-9_-]{12}$/;
const HEX32_RE = /^[0-9a-f]{32}$/;
const REPLAY_SEG_RE = /^[A-Za-z0-9_-]{22}$/;

/** gistId → 경로 세그먼트. 32자 hex는 base64url 22자, 그 외 원문 통과(fallback이 규범). */
export function encodeReplayId(gistId: string): string {
  if (!HEX32_RE.test(gistId)) return gistId;
  let bin = "";
  for (let i = 0; i < 32; i += 2) {
    bin += String.fromCharCode(parseInt(gistId.slice(i, i + 2), 16));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 경로 세그먼트 → gistId. 판별(길이 22 + 문자집합) 실패 시 원문 통과. */
export function decodeReplayId(segment: string): string {
  if (!REPLAY_SEG_RE.test(segment)) return segment;
  let bin: string;
  try {
    bin = atob(`${segment.replace(/-/g, "+").replace(/_/g, "/")}==`);
  } catch {
    return segment; // base64 해석 불가 → 원문을 gistId로 (fallback)
  }
  let hex = "";
  for (let i = 0; i < bin.length; i++) {
    hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

/** note 파라미터 원문 해석 — 한정형 우선, bare noteId 관용 유지(§2 수신 규범). */
function parseNoteParam(raw: string | null): { clientId: string | null; noteId: string | null } {
  if (raw === null || raw === "") return { clientId: null, noteId: null };
  const dot = raw.indexOf(".");
  if (dot > 0) {
    const clientId = raw.slice(0, dot);
    const noteId = raw.slice(dot + 1);
    if (CLIENT_ID_RE.test(clientId) && NOTE_ID_PATTERN.test(noteId)) return { clientId, noteId };
    // 형식 불일치 시 한정자 무시하고 전체를 noteId 후보로 재시도.
  }
  return { clientId: null, noteId: NOTE_ID_PATTERN.test(raw) ? raw : null };
}

/** fragment("#p3" 또는 "p3") → 1-기준 페이지 서수. 형식이 아니면 null. */
function parsePageFragment(hash: string): number | null {
  const m = /^#?p([1-9]\d*)$/.exec(hash);
  return m ? Number(m[1]) : null;
}

/**
 * location(pathname·search·hash)에서 딥링크 상태를 파싱한다.
 * pathname은 base 접두를 벗긴 뒤 /replays/<seg>를 추출한다(하위 경로 이전 대비 — AW-1).
 */
export function parseDeepLink(
  loc: { pathname: string; search: string; hash: string },
  base?: string,
): DeepLink {
  const path = base === undefined ? stripBase(loc.pathname) : stripBase(loc.pathname, base);
  const seg = /^\/replays\/([^/]+)\/?$/.exec(path)?.[1];
  const gistId = seg !== undefined && seg !== "" ? decodeReplayId(decodeURIComponent(seg)) : null;
  const note = parseNoteParam(new URLSearchParams(loc.search).get("note"));
  const page = parsePageFragment(loc.hash);
  return {
    gistId,
    noteId: note.noteId,
    clientId: note.clientId,
    // note가 없으면 page는 의미 없음(서수는 노트 페이지 목록 기준).
    page: note.noteId !== null ? page : null,
  };
}

/** 딥링크 발신 대상 — note는 항상 한정형으로만 발신한다(M1d-2). */
export interface DeepLinkTarget {
  gistId: string;
  note?: { clientId: string; noteId: string } | null;
  /** 1-기준 페이지 서수. 페이지 문맥이 있을 때만 fragment로 붙는다(옵션 — §2). */
  page?: number | null;
}

/**
 * 정규형 경로(base 접두 포함, origin 제외)를 조립한다.
 * 예: "/replays/obLD1OX2p7jJ0OHyo7TF1g?note=k7F3q9Zw4RtY.n4X2p8Qs#p3"
 * 절대 URL이 필요하면 호출부가 window.location.origin을 앞에 붙인다.
 */
export function buildDeepLink(target: DeepLinkTarget, base?: string): string {
  const path = `replays/${encodeURIComponent(encodeReplayId(target.gistId))}`;
  let url = base === undefined ? withBase(path) : withBase(path, base);
  if (target.note) {
    url += `?note=${encodeURIComponent(`${target.note.clientId}.${target.note.noteId}`)}`;
    if (target.page != null && target.page >= 1) url += `#p${target.page}`;
  }
  return url;
}

/**
 * 페이지 서수(1-기준)를 0-기준 인덱스로 해석한다 — best-effort(M1d-3):
 * 부재(null)·범위 밖이면 에러가 아니라 첫 페이지(0)다.
 */
export function pageIndexFromOrdinal(page: number | null, pageCount: number): number {
  if (page === null || !Number.isInteger(page) || page < 1 || page > pageCount) return 0;
  return page - 1;
}
