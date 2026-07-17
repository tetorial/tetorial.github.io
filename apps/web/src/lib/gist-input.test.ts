import { describe, it, expect } from "vitest";
import { resolveGistInput, GIST_INPUT_ERROR } from "./gist-input.js";
import { buildDeepLink, encodeReplayId } from "./deeplink.js";

// AW-20: 공유 링크·gist URL·순수 id → 정규형 이동 URL, 형식 오류 → 홈과 동일 오류 문구.
describe("AW-20 gist 입력 정규화 (OpenIsland·EmptyState 공용 헬퍼)", () => {
  const HEX_ID = "0123456789abcdef0123456789abcdef";
  const SEG = encodeReplayId(HEX_ID); // 32-hex → base64url 22자

  it("AW-20 경로형 공유 링크 → 정규형 이동 URL", () => {
    const res = resolveGistInput(`https://tetorial.pages.dev/replays/${SEG}`);
    expect(res).toEqual({ ok: true, url: buildDeepLink({ gistId: HEX_ID }) });
  });

  it("AW-20 gist 웹 URL → 정규형 이동 URL", () => {
    const web = resolveGistInput(`https://gist.github.com/someone/${HEX_ID}`);
    expect(web).toEqual({ ok: true, url: buildDeepLink({ gistId: HEX_ID }) });
  });

  it("AW-20 순수 gist id → 정규형 이동 URL (비-hex id는 원문 통과 fallback)", () => {
    expect(resolveGistInput(HEX_ID)).toEqual({ ok: true, url: buildDeepLink({ gistId: HEX_ID }) });
    // 인코딩 세그먼트(22자)를 그대로 붙여넣어도 복원된다
    expect(resolveGistInput(SEG)).toEqual({ ok: true, url: buildDeepLink({ gistId: HEX_ID }) });
    // GitHub id 체계 변경 대비 — 판별 불가 형식은 원문 통과(fallback이 규범)
    expect(resolveGistInput("abc123")).toEqual({ ok: true, url: buildDeepLink({ gistId: "abc123" }) });
  });

  it("AW-20 앞뒤 공백은 무시한다", () => {
    expect(resolveGistInput(`  ${HEX_ID}  `)).toEqual({
      ok: true,
      url: buildDeepLink({ gistId: HEX_ID }),
    });
  });

  it("AW-20 형식 오류 → 홈과 동일한 오류 문구", () => {
    for (const bad of ["", "   ", "not a gist!!", "https://example.com/foo"]) {
      expect(resolveGistInput(bad)).toEqual({ ok: false, message: GIST_INPUT_ERROR });
    }
    expect(GIST_INPUT_ERROR).toBe("공유 링크 또는 gist ID 형식이 올바르지 않습니다.");
  });
});
