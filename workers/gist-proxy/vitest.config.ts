// gist-proxy 테스트 설정 — @cloudflare/vitest-pool-workers로 실제 workerd 런타임에서 실행.
// 루트 vitest.config.ts의 projects: ["workers/*"] 가 이 설정을 하위 프로젝트로 로드한다.
// GitHub API는 fetchMock(cloudflare:test)으로 대체 — 실 호출 금지 (명세 §8).
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    name: "gist-proxy",
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // 테스트 전용 바인딩. 실제 시크릿이 아닌 더미 — W-6이 응답·로그에 부재를 검증한다.
          bindings: {
            GIST_PAT: "TEST_PAT_MUST_NOT_LEAK",
            GIST_OWNER: "tetorial-bot",
            ALLOWED_ORIGINS: "https://tetorial.example,http://localhost:4321",
            WRITE_ENABLED: "true",
          },
        },
      },
    },
  },
});
