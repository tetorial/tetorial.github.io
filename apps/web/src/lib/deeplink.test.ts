import { describe, it, expect } from "vitest";
import {
  parseDeepLink,
  buildDeepLink,
  encodeReplayId,
  decodeReplayId,
  pageIndexFromOrdinal,
} from "./deeplink.js";

// 경로형 딥링크 규범(apps-web-m1d §2) — M1d-1 식별, M1d-2 note 한정형,
// M1d-3 fragment best-effort, M1d-4 구형 제거, M1d-5 왕복.

const HEX_ID = "0123456789abcdef0123456789abcdef"; // 32자 hex (현행 gist id 체계)
const HEX_SEG = "ASNFZ4mrze8BI0VniavN7w"; // 위 id의 base64url 22자(패딩 없음)

/** 조립 결과(경로+쿼리+프래그먼트)를 Location 형태로 분해한다. */
function toLoc(url: string): { pathname: string; search: string; hash: string } {
  const u = new URL(url, "https://x.test");
  return { pathname: u.pathname, search: u.search, hash: u.hash };
}

describe("M1d-1 경로형 식별 — replayId 인코딩·판별", () => {
  it("M1d-1 발신: 32-hex gistId는 base64url 22자로 인코딩된다", () => {
    expect(encodeReplayId(HEX_ID)).toBe(HEX_SEG);
    expect(HEX_SEG).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("M1d-1 발신: 32-hex가 아니면 원문 그대로 (fallback이 규범)", () => {
    expect(encodeReplayId("g1")).toBe("g1");
    expect(encodeReplayId("ABCDEF0123456789ABCDEF0123456789")).toBe(
      "ABCDEF0123456789ABCDEF0123456789", // 대문자 hex는 현행 체계가 아님 → 원문 통과
    );
  });

  it("M1d-1 수신: 22자 + [A-Za-z0-9_-] 세그먼트는 32-hex로 복원된다", () => {
    expect(decodeReplayId(HEX_SEG)).toBe(HEX_ID);
  });

  it("M1d-1 수신: 판별(길이·문자집합) 실패 시 원문을 gistId로 사용", () => {
    expect(decodeReplayId("g1")).toBe("g1");
    expect(decodeReplayId(HEX_ID)).toBe(HEX_ID); // 32자는 22자가 아님 → 원문
  });

  it("M1d-1 파서: /replays/<인코딩id> 경로에서 gistId 복원", () => {
    const l = parseDeepLink({ pathname: `/replays/${HEX_SEG}`, search: "", hash: "" });
    expect(l.gistId).toBe(HEX_ID);
  });

  it("M1d-1 파서: 비표준 세그먼트는 원문 통과, 경로형 아니면 null(로컬)", () => {
    expect(parseDeepLink({ pathname: "/replays/g1", search: "", hash: "" }).gistId).toBe("g1");
    expect(parseDeepLink({ pathname: "/replay/", search: "", hash: "" }).gistId).toBeNull();
    expect(parseDeepLink({ pathname: "/", search: "", hash: "" }).gistId).toBeNull();
  });

  it("M1d-1 파서: base 접두를 벗긴다 (하위 경로 이전 대비 — AW-1)", () => {
    const l = parseDeepLink(
      { pathname: `/tetorial/replays/${HEX_SEG}`, search: "", hash: "" },
      "/tetorial/",
    );
    expect(l.gistId).toBe(HEX_ID);
    // base 접두가 없으면 stripBase가 원문을 반환하므로 경로형 해석이 유지된다(방어적).
    expect(
      parseDeepLink({ pathname: `/replays/${HEX_SEG}`, search: "", hash: "" }, "/tetorial/").gistId,
    ).toBe(HEX_ID);
  });

  it("M1d-1 조립: 경로형 + base 접두", () => {
    expect(buildDeepLink({ gistId: HEX_ID })).toBe(`/replays/${HEX_SEG}`);
    expect(buildDeepLink({ gistId: "g1" }, "/tetorial/")).toBe("/tetorial/replays/g1");
  });
});

describe("M1d-2 note 한정형 발신", () => {
  it("M1d-2 발신 note 파라미터는 항상 <clientId>.<noteId>다", () => {
    const url = buildDeepLink({
      gistId: "g1",
      note: { clientId: "k3XmP9qLwR2v", noteId: "AbCdEf12" },
    });
    expect(url).toBe(`/replays/g1?note=${encodeURIComponent("k3XmP9qLwR2v.AbCdEf12")}`);
  });

  it("M1d-2 수신은 bare noteId도 관용 해석 유지(현행 파서 동작 보존)", () => {
    const l = parseDeepLink({ pathname: "/replays/g1", search: "?note=AbCdEf12", hash: "" });
    expect(l.noteId).toBe("AbCdEf12");
    expect(l.clientId).toBeNull();
  });

  it("M1d-2 한정형 형식 불일치 시 전체를 bare noteId로 재시도", () => {
    const l = parseDeepLink({ pathname: "/replays/g1", search: "?note=bad.AbCdEf12", hash: "" });
    expect(l.clientId).toBeNull();
    expect(l.noteId).toBeNull(); // 점 포함 전체는 noteId 형식도 아님
  });
});

describe("M1d-3 fragment #p<n> — best-effort", () => {
  it("M1d-3 #p<n>이 1-기준 서수로 파싱된다", () => {
    const l = parseDeepLink({ pathname: "/replays/g1", search: "?note=AbCdEf12", hash: "#p3" });
    expect(l.page).toBe(3);
  });

  it("M1d-3 부재·비정형 fragment는 null(→ 첫 페이지)", () => {
    const base = { pathname: "/replays/g1", search: "?note=AbCdEf12" };
    expect(parseDeepLink({ ...base, hash: "" }).page).toBeNull();
    expect(parseDeepLink({ ...base, hash: "#p0" }).page).toBeNull(); // 1-기준
    expect(parseDeepLink({ ...base, hash: "#page3" }).page).toBeNull();
    expect(parseDeepLink({ ...base, hash: "#p" }).page).toBeNull();
  });

  it("M1d-3 note 없는 fragment는 무시(서수는 노트 페이지 목록 기준)", () => {
    expect(parseDeepLink({ pathname: "/replays/g1", search: "", hash: "#p3" }).page).toBeNull();
  });

  it("M1d-3 범위 밖 서수는 에러가 아니라 첫 페이지(인덱스 0)", () => {
    expect(pageIndexFromOrdinal(3, 5)).toBe(2);
    expect(pageIndexFromOrdinal(6, 5)).toBe(0); // 범위 밖 → 첫 페이지
    expect(pageIndexFromOrdinal(null, 5)).toBe(0); // 부재 → 첫 페이지
    expect(pageIndexFromOrdinal(1, 1)).toBe(0);
  });

  it("M1d-3 조립: 페이지 문맥이 있을 때만 fragment를 붙인다(옵션)", () => {
    const note = { clientId: "k3XmP9qLwR2v", noteId: "AbCdEf12" };
    expect(buildDeepLink({ gistId: "g1", note, page: 3 })).toMatch(/#p3$/);
    expect(buildDeepLink({ gistId: "g1", note })).not.toContain("#");
    expect(buildDeepLink({ gistId: "g1", note, page: null })).not.toContain("#");
  });
});

describe("M1d-4 구형 제거 — ?gist=·page= 해석 없음", () => {
  it("M1d-4 구형 ?gist=는 무시된다(경로만이 식별자)", () => {
    const l = parseDeepLink({ pathname: "/replay/", search: "?gist=abc123", hash: "" });
    expect(l.gistId).toBeNull();
  });

  it("M1d-4 구형 page= 파라미터는 무시된다(fragment만 해석)", () => {
    const l = parseDeepLink({
      pathname: "/replays/g1",
      search: "?note=AbCdEf12&page=Pg345678",
      hash: "",
    });
    expect(l.page).toBeNull();
    expect(l).not.toHaveProperty("pageId");
  });

  it("M1d-4 경로형 + 구형 파라미터 혼재 시 경로·fragment만 유효", () => {
    const l = parseDeepLink({
      pathname: "/replays/g1",
      search: "?gist=other&note=AbCdEf12&page=Pg345678",
      hash: "#p2",
    });
    expect(l.gistId).toBe("g1");
    expect(l.page).toBe(2);
  });
});

describe("M1d-5 조립→파싱 왕복", () => {
  const note = { clientId: "k3XmP9qLwR2v", noteId: "AbCdEf12" };

  it("M1d-5 왕복: 인코딩 id 단독", () => {
    const l = parseDeepLink(toLoc(buildDeepLink({ gistId: HEX_ID })));
    expect(l).toEqual({ gistId: HEX_ID, noteId: null, clientId: null, page: null });
  });

  it("M1d-5 왕복: 비표준 원문 id 단독", () => {
    const l = parseDeepLink(toLoc(buildDeepLink({ gistId: "g1" })));
    expect(l).toEqual({ gistId: "g1", noteId: null, clientId: null, page: null });
  });

  it("M1d-5 왕복: note 한정형 포함", () => {
    const l = parseDeepLink(toLoc(buildDeepLink({ gistId: HEX_ID, note })));
    expect(l).toEqual({
      gistId: HEX_ID,
      noteId: note.noteId,
      clientId: note.clientId,
      page: null,
    });
  });

  it("M1d-5 왕복: note + fragment 포함", () => {
    const l = parseDeepLink(toLoc(buildDeepLink({ gistId: HEX_ID, note, page: 7 })));
    expect(l).toEqual({ gistId: HEX_ID, noteId: note.noteId, clientId: note.clientId, page: 7 });
  });

  it("M1d-5 왕복: 하위 경로 base에서도 성립", () => {
    const url = buildDeepLink({ gistId: HEX_ID, note, page: 2 }, "/tetorial/");
    const l = parseDeepLink(toLoc(url), "/tetorial/");
    expect(l).toEqual({ gistId: HEX_ID, noteId: note.noteId, clientId: note.clientId, page: 2 });
  });
});
