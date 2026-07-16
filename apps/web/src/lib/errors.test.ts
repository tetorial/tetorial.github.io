import { describe, it, expect } from "vitest";
import { toDisplayError, parseRetryAfter, summarizeLimitDetail } from "./errors.js";

// AW-9 오류 매핑: §6 표 전 행의 표시 분기.
describe("AW-9 오류 매핑 (§6 표 전 행)", () => {
  it("AW-9 gist 404 / 비서비스 gist → 홈 링크", () => {
    const e = toDisplayError({ source: "worker", status: 404, body: { code: "not-found" } });
    expect(e.action).toEqual({ kind: "home" });
    expect(e.title).toContain("찾을 수 없");
  });

  it("AW-9 sha256 불일치 / gunzip 실패 → 손상 안내", () => {
    expect(toDisplayError({ source: "integrity" }).title).toContain("손상");
    const worker = toDisplayError({
      source: "worker",
      status: 422,
      body: { code: "integrity-mismatch" },
    });
    expect(worker.title).toContain("손상");
  });

  it("AW-9 재생 엔진 오류(버전 초과 추정) → 지원 버전 안내", () => {
    const e = toDisplayError({ source: "playback" });
    expect(e.title).toContain("1.7.8");
    expect(e.title).toContain("triangle");
  });

  it("AW-9 403 edit-key-mismatch → 편집 키 안내", () => {
    const e = toDisplayError({ source: "worker", status: 403, body: { code: "edit-key-mismatch" } });
    expect(e.title).toContain("편집 키");
    expect(e.action).toEqual({ kind: "none" });
  });

  it("AW-9 413/422 limit-exceeded → 초과 항목 명시", () => {
    const detail = [{ message: "노트당 페이지 100개 초과 (101)" }];
    const e = toDisplayError({
      source: "worker",
      status: 422,
      body: { code: "limit-exceeded", detail },
    });
    expect(e.detailText).toContain("페이지 100개 초과");
    const e413 = toDisplayError({
      source: "worker",
      status: 413,
      body: { code: "payload-too-large" },
    });
    expect(e413.title).toBeTruthy();
  });

  it("AW-9 429/503 → 재시도 안내 + Retry-After 반영", () => {
    const e = toDisplayError({
      source: "worker",
      status: 429,
      body: { code: "rate-limited" },
      retryAfterMs: 5000,
    });
    expect(e.action).toEqual({ kind: "retry", retryAfterMs: 5000 });
    const e503 = toDisplayError({
      source: "worker",
      status: 503,
      body: { code: "upstream-rate-limited" },
      retryAfterMs: 30000,
    });
    expect(e503.action).toEqual({ kind: "retry", retryAfterMs: 30000 });
  });

  it("AW-9 writes-disabled → 저장 중지 안내", () => {
    const e = toDisplayError({ source: "worker", status: 503, body: { code: "writes-disabled" } });
    expect(e.title).toContain("일시 중지");
    expect(e.action).toEqual({ kind: "none" });
  });

  it("AW-9 Worker의 message(한국어)를 기본 표시하되 행동을 덧붙인다", () => {
    const e = toDisplayError({
      source: "worker",
      status: 404,
      body: { code: "not-found", message: "커스텀 메시지" },
    });
    expect(e.title).toBe("커스텀 메시지");
    expect(e.action).toEqual({ kind: "home" });
  });

  it("AW-9 origin-forbidden / bad-request 분기", () => {
    expect(
      toDisplayError({ source: "worker", status: 403, body: { code: "origin-forbidden" } }).title,
    ).toContain("출처");
    expect(
      toDisplayError({ source: "worker", status: 400, body: { code: "bad-request" } }).title,
    ).toBeTruthy();
  });

  it("AW-9 upstream-error(502) → 재시도, 네트워크 실패 → 재시도", () => {
    expect(
      toDisplayError({ source: "worker", status: 502, body: { code: "upstream-error" } }).action.kind,
    ).toBe("retry");
    expect(toDisplayError({ source: "network" }).action.kind).toBe("retry");
  });
});

describe("AW-9 보조 파서", () => {
  it("AW-9 Retry-After 초 단위 → ms", () => {
    expect(parseRetryAfter("5")).toBe(5000);
  });
  it("AW-9 Retry-After HTTP-date → ms(현재 기준)", () => {
    const now = Date.parse("2026-07-12T00:00:00Z");
    expect(parseRetryAfter("Sun, 12 Jul 2026 00:00:30 GMT", now)).toBe(30000);
  });
  it("AW-9 Retry-After 부재·파싱 불가 → null", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("garbage")).toBeNull();
  });
  it("AW-9 limit detail 요약", () => {
    expect(summarizeLimitDetail([{ message: "a" }, { message: "b" }])).toBe("a; b");
    expect(summarizeLimitDetail(undefined)).toBeUndefined();
  });
});
