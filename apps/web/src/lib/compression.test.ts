import { describe, it, expect } from "vitest";
import { gzipBase64, gunzipBase64, bytesToBase64, base64ToBytes } from "./compression.js";
import { sha256Hex, replayIntegrity } from "./integrity.js";

// 압축·무결성 유틸 — AW-3(업로드 인코딩)·AW-4(gist 열기 무결성 대조) 기반.
describe("압축 왕복(gzip+base64)", () => {
  it("텍스트 gzip→base64→gunzip 왕복 무손실", () => {
    const text = JSON.stringify({ hello: "세계", arr: [1, 2, 3], nested: { a: true } });
    expect(gunzipBase64(gzipBase64(text))).toBe(text);
  });

  it("유니코드·큰 페이로드 왕복", () => {
    const text = "🎮".repeat(50_000);
    expect(gunzipBase64(gzipBase64(text))).toBe(text);
  });

  it("손상된 gzip은 throw(무결성 분기 근거)", () => {
    expect(() => gunzipBase64(bytesToBase64(new Uint8Array([1, 2, 3, 4])))).toThrow();
  });

  it("바이트 base64 왕복", () => {
    const bytes = new Uint8Array([0, 1, 254, 255, 128, 127]);
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
  });
});

describe("무결성(sha256)", () => {
  it("빈 문자열의 SHA-256 알려진 값", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("replayIntegrity가 sha256과 UTF-8 바이트 수를 함께 반환", async () => {
    const json = '{"a":1}';
    const r = await replayIntegrity(json);
    expect(r.bytes).toBe(new TextEncoder().encode(json).length);
    expect(r.sha256).toBe(await sha256Hex(json));
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
