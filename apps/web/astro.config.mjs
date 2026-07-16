// @ts-check
import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";

// 배포는 조직 루트 사이트(D-18): site = https://tetorial.github.io, base = "/"(기본값).
// 내부 링크·에셋은 import.meta.env.BASE_URL 헬퍼 경유 의무(D-18 — 하위 경로 이전 대비).
// 루트 절대 경로 하드코딩 금지(AW-1 스캔 검증).
export default defineConfig({
  site: "https://tetorial.github.io",
  base: "/",
  trailingSlash: "ignore",
  integrations: [preact()],
  // Worker URL은 PUBLIC_WORKER_URL 환경변수로 주입(conventions §7). rawUrl 손조립 금지.
  vite: {
    define: {},
  },
});
