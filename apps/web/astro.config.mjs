// @ts-check
import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";

// 배포는 Cloudflare Pages 직접 업로드(D-19): site = https://tetorial.pages.dev, base = "/"(기본값).
// 내부 링크·에셋은 import.meta.env.BASE_URL 헬퍼 경유 의무(하위 경로 이전 대비 — 계속 유지).
// 루트 절대 경로 하드코딩 금지(AW-1 스캔 검증).
const BASE = "/";

/**
 * astro dev용 경로형 딥링크 리라이트 (apps-web-m1d §6 선택 항목 — 로컬 개발 DX).
 * 프로덕션·E2E는 public/_redirects의 200 리라이트가 담당한다(wrangler pages dev 포함).
 * dev 서버에서만 /replays/*의 HTML을 /replay/로 서빙한다 — 브라우저 URL은 원형 유지.
 * @param {string} base
 * @returns {import("vite").Plugin}
 */
function devReplaysRewrite(base) {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return {
    name: "tetorial:dev-replays-rewrite",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith(`${prefix}replays/`)) req.url = `${prefix}replay/`;
        next();
      });
    },
  };
}

export default defineConfig({
  site: "https://tetorial.pages.dev",
  base: BASE,
  trailingSlash: "ignore",
  integrations: [preact()],
  // Worker URL은 PUBLIC_WORKER_URL 환경변수로 주입(conventions §7). rawUrl 손조립 금지.
  vite: {
    define: {},
    plugins: [devReplaysRewrite(BASE)],
  },
});
