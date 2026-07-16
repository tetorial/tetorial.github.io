// 테마 적용 — data-theme 속성으로 토큰 오버라이드를 구동한다(tokens.css). system = 속성 제거.
import type { ThemePref } from "./storage.js";

export function applyTheme(pref: ThemePref): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}
