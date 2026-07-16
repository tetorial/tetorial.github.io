import { describe, it, expect } from "vitest";
import { parseDeepLink, buildDeepLinkQuery } from "./deeplink.js";

// AW-1 딥링크 파라미터 파싱 매트릭스 / AW-10 page 딥링크·noteId 형식.
describe("AW-1 딥링크 파싱 매트릭스", () => {
  it("AW-1 파라미터 없음 = 로컬(전부 null)", () => {
    expect(parseDeepLink("")).toEqual({ gistId: null, noteId: null, clientId: null, pageId: null });
  });

  it("AW-1 gist만", () => {
    expect(parseDeepLink("gist=abc123")).toEqual({
      gistId: "abc123",
      noteId: null,
      clientId: null,
      pageId: null,
    });
  });

  it("AW-1 gist+note(첫 페이지)", () => {
    const l = parseDeepLink("gist=abc123&note=AbCdEf12");
    expect(l).toEqual({ gistId: "abc123", noteId: "AbCdEf12", clientId: null, pageId: null });
  });

  it("AW-10 gist+note+page(해당 페이지)", () => {
    const l = parseDeepLink("gist=abc123&note=AbCdEf12&page=Pg345678");
    expect(l).toEqual({ gistId: "abc123", noteId: "AbCdEf12", clientId: null, pageId: "Pg345678" });
  });

  it("AW-1 note 없는 page는 무시(note 종속)", () => {
    const l = parseDeepLink("gist=abc123&page=Pg345678");
    expect(l.noteId).toBeNull();
    expect(l.pageId).toBeNull();
  });

  it("AW-1 잘못된 noteId 형식은 null", () => {
    expect(parseDeepLink("gist=x&note=short").noteId).toBeNull();
  });

  it("AW-10 한정 형식 note=<clientId>.<noteId> 전방 호환 파싱", () => {
    const l = parseDeepLink("gist=abc&note=k3XmP9qLwR2v.AbCdEf12");
    expect(l.clientId).toBe("k3XmP9qLwR2v");
    expect(l.noteId).toBe("AbCdEf12");
  });

  it("AW-10 한정 형식이 유효하지 않으면 전체를 단순 noteId로 재시도", () => {
    // 앞이 clientId 형식 아님 → 점 포함 전체는 noteId 형식도 아니므로 null
    expect(parseDeepLink("gist=x&note=bad.AbCdEf12").clientId).toBeNull();
    expect(parseDeepLink("gist=x&note=bad.AbCdEf12").noteId).toBeNull();
  });
});

describe("AW-10 딥링크 조립(이 페이지 링크 복사)", () => {
  it("AW-10 gist+note+page 왕복", () => {
    const q = buildDeepLinkQuery({ gistId: "abc", noteId: "AbCdEf12", pageId: "Pg345678" });
    expect(parseDeepLink(q)).toEqual({
      gistId: "abc",
      noteId: "AbCdEf12",
      clientId: null,
      pageId: "Pg345678",
    });
  });

  it("AW-10 clientId 한정자 포함 왕복", () => {
    const q = buildDeepLinkQuery({
      gistId: "abc",
      clientId: "k3XmP9qLwR2v",
      noteId: "AbCdEf12",
      pageId: "Pg345678",
    });
    const l = parseDeepLink(q);
    expect(l.clientId).toBe("k3XmP9qLwR2v");
    expect(l.noteId).toBe("AbCdEf12");
    expect(l.pageId).toBe("Pg345678");
  });
});
