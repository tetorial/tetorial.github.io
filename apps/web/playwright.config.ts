// Playwright 스모크 E2E 구성 (apps-web §7). Worker·rawUrl은 라우트 mock, fixture 리플레이 사용.
// PUBLIC_WORKER_URL을 mock 호스트로 주입하고, 각 스펙이 page.route로 응답을 가로챈다.
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
    // 정적 빌드 산출물을 서빙(프로덕션 유사 — client:only 아일랜드 하이드레이션 검증).
    command: "pnpm build && pnpm preview --port " + PORT,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PUBLIC_WORKER_URL: WORKER_URL },
  },
});
