// cloudflare:test의 env를 이 Worker의 Env로 타입 지정 (테스트 전용).
import type { Env } from "./env.js";

declare module "cloudflare:test" {
  // ProvidedEnv를 이 Worker의 Env로 확장 — 빈 확장이 관례라 규칙만 비활성화.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends Env {}
}
