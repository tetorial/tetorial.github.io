// 딥링크 파라미터 파싱·조립 (notes §9, apps-web §1·§3-E).
//
//   /replay?gist=<gistId>[&note=<noteId>][&page=<pageId>]
//
// - gist 없음 = 로컬 파일로 연 상태(파라미터 전부 무시).
// - note만 있으면 첫 페이지, page까지 있으면 해당 페이지를 연다.
// - noteId는 파일 간 충돌 가능성이 이론상 있어 충돌 시 후보 목록을 표시한다(§3-E, AW-10).
//   정규화 형식 `note=<clientId>.<noteId>`는 미결(QUESTIONS #1)이라, 파서는 점(.)이 있으면
//   앞을 clientId 한정자로 관용 해석하는 전방 호환만 갖춘다(공개 스키마 변경 아님).

export interface DeepLink {
  gistId: string | null;
  /** note 파라미터의 noteId 부분([A-Za-z0-9_-]{8}). 없으면 null. */
  noteId: string | null;
  /** `<clientId>.<noteId>` 한정 형식일 때의 clientId. 단순 형식이면 null. */
  clientId: string | null;
  /** page 파라미터(pageId). 없으면 null. */
  pageId: string | null;
}

const NOTE_ID_RE = /^[A-Za-z0-9_-]{8}$/;
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{12}$/;

/** note 파라미터 원문을 { clientId, noteId }로 해석. 유효하지 않으면 noteId=null. */
function parseNoteParam(raw: string | null): { clientId: string | null; noteId: string | null } {
  if (raw === null || raw === "") return { clientId: null, noteId: null };
  const dot = raw.indexOf(".");
  if (dot > 0) {
    const clientId = raw.slice(0, dot);
    const noteId = raw.slice(dot + 1);
    if (CLIENT_ID_RE.test(clientId) && NOTE_ID_RE.test(noteId)) return { clientId, noteId };
    // 형식 불일치 시 한정자 무시하고 전체를 noteId 후보로 재시도.
  }
  return { clientId: null, noteId: NOTE_ID_RE.test(raw) ? raw : null };
}

/** URLSearchParams(또는 쿼리 문자열)에서 딥링크 상태를 파싱한다. */
export function parseDeepLink(search: string | URLSearchParams): DeepLink {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const gistId = params.get("gist");
  const note = parseNoteParam(params.get("note"));
  const pageRaw = params.get("page");
  const pageId = pageRaw !== null && NOTE_ID_RE.test(pageRaw) ? pageRaw : null;
  return {
    gistId: gistId !== null && gistId !== "" ? gistId : null,
    noteId: note.noteId,
    clientId: note.clientId,
    // note가 없으면 page는 의미 없음(§9: page는 note 종속).
    pageId: note.noteId !== null ? pageId : null,
  };
}

/** 딥링크 상태를 쿼리 문자열로 조립한다(선두 "?" 제외). "이 페이지 링크 복사"용(§3-E). */
export function buildDeepLinkQuery(link: {
  gistId: string;
  noteId?: string | null;
  clientId?: string | null;
  pageId?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("gist", link.gistId);
  if (link.noteId) {
    const note = link.clientId ? `${link.clientId}.${link.noteId}` : link.noteId;
    params.set("note", note);
    if (link.pageId) params.set("page", link.pageId);
  }
  return params.toString();
}
