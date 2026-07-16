// Turnstile 검증 (§5-4, v1 선택). TURNSTILE_SECRET이 설정된 경우에만 활성화 —
// 미설정이면 통과(개발·초기 운영 편의). 어뷰징 시 배포만으로 켤 수 있다.
import { ApiError } from "./errors.js";
import type { Env } from "./env.js";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** 활성 시 turnstileToken을 검증. 실패하면 429 rate-limited (§6 표). */
export async function verifyTurnstile(env: Env, token: unknown): Promise<void> {
  if (env.TURNSTILE_SECRET === undefined || env.TURNSTILE_SECRET === "") return; // 비활성
  if (typeof token !== "string" || token.length === 0) {
    throw new ApiError("rate-limited", { message: "봇 방지 확인이 필요합니다." });
  }
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET);
  form.set("response", token);
  const res = await fetch(SITEVERIFY, { method: "POST", body: form });
  const data = (await res.json().catch(() => ({ success: false }))) as { success?: boolean };
  if (data.success !== true) {
    throw new ApiError("rate-limited", { message: "봇 방지 확인에 실패했습니다." });
  }
}
