import { describe, it, expect } from "vitest";
import { Storage, MemoryStorage } from "./storage.js";

// storage 유틸 — clientId·editKey·draft 수명주기. AW-6/AW-7/AW-8의 영속 기반.
describe("storage clientId", () => {
  it("최초 조회 시 [A-Za-z0-9_-]{12} 생성·보관, 재조회 시 동일", () => {
    const s = new Storage(new MemoryStorage());
    const id = s.getOrCreateClientId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(s.getOrCreateClientId()).toBe(id);
    expect(s.peekClientId()).toBe(id);
  });

  it("생성 전에는 peek이 null", () => {
    expect(new Storage(new MemoryStorage()).peekClientId()).toBeNull();
  });
});

// AW-7 편집 키 수명주기: 최초 생성·고지 → 재사용 → 다른 브라우저에서 부재.
describe("AW-7 editKey 수명주기", () => {
  it("AW-7 최초 업로드 시 생성 + created=true(1회 고지 트리거)", () => {
    const s = new Storage(new MemoryStorage());
    const first = s.getOrCreateEditKey("gist1");
    expect(first.created).toBe(true);
    expect(first.editKey.length).toBeGreaterThanOrEqual(16);
  });

  it("AW-7 재편집 시 동일 키 재사용(created=false)", () => {
    const s = new Storage(new MemoryStorage());
    const first = s.getOrCreateEditKey("gist1");
    const again = s.getOrCreateEditKey("gist1");
    expect(again.editKey).toBe(first.editKey);
    expect(again.created).toBe(false);
  });

  it("AW-7 다른 브라우저(스토리지 초기화)에는 editKey가 없다 → 403 유발 조건", () => {
    const other = new Storage(new MemoryStorage());
    expect(other.getEditKey("gist1")).toBeNull();
    expect(other.hasEditKey("gist1")).toBe(false);
  });

  it("AW-7 gist별로 독립적인 키", () => {
    const s = new Storage(new MemoryStorage());
    expect(s.getOrCreateEditKey("g1").editKey).not.toBe(s.getOrCreateEditKey("g2").editKey);
  });
});

describe("storage 드래프트·설정 왕복", () => {
  it("드래프트 저장·복원·삭제", () => {
    const s = new Storage(new MemoryStorage());
    const draft = { v: 1, foo: "bar" } as never;
    s.setDraft("local", draft);
    expect(s.getDraft("local")).toEqual({ v: 1, foo: "bar" });
    s.clearDraft("local");
    expect(s.getDraft("local")).toBeNull();
  });

  it("손상된 JSON은 null로 방어", () => {
    const backend = new MemoryStorage();
    backend.setItem("tetorial:draft:local", "{not json");
    expect(new Storage(backend).getDraft("local")).toBeNull();
  });

  it("백엔드 부재(null)에서도 throw하지 않는다", () => {
    const s = new Storage(null);
    expect(() => s.getOrCreateClientId()).not.toThrow();
    expect(s.getDraft("local")).toBeNull();
  });
});
