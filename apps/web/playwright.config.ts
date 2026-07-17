// Playwright 스모크 E2E 구성 (apps-web §7, apps-web-m1d §6). Worker·rawUrl은 라우트 mock,
// fixture 리플레이 사용. PUBLIC_WORKER_URL을 mock 호스트로 주입하고, 각 스펙이 page.route로
// 응답을 가로챈다.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;
const WORKER_URL = "https://worker.test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // 빌드 산출물을 wrangler pages dev로 서빙(프로덕션 파리티 — 명세 §6 필수).
    // astro preview는 public/_redirects를 처리하지 않아 경로형 딥링크 /replays/*가
    // 404가 된다 — wrangler pages dev는 프로덕션(Cloudflare Pages)과 동일하게
    // 200 리라이트를 적용하고 브라우저 URL을 원형 유지한다(D-19, 2026-07-17 실측).
    // compatibility-date는 gist-proxy(workers/gist-proxy/wrangler.toml)와 동일 고정값 —
    // Pages 정적 서빙(리라이트만)이라 실질 영향은 없지만 매일 바뀌는 "오늘 날짜" 경고를 피한다.
    command: `pnpm build && pnpm exec wrangler pages dev dist --port=${PORT} --compatibility-date=2024-09-23`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PUBLIC_WORKER_URL: WORKER_URL, WRANGLER_SEND_METRICS: "false" },
  },
});
