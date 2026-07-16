// 설정 해석 — 핸들링·키 바인딩의 기본값 병합·정규화·영속(apps-web §1·§4, AW-8).
// input의 DEFAULT_HANDLING·DEFAULT_KEYS를 활용하고(수치 재정의 금지 — 총괄공지),
// 메타 액션 기본 조합만 apps/web이 주입한다(input 명세 §2: 메타 기본 바인딩은 비어 있음).
import { DEFAULT_HANDLING, DEFAULT_KEYS } from "@tetorial/input";
import type { HandlingConfig, KeyBindings } from "@tetorial/input";
import type { Storage } from "./storage.js";

/**
 * 메타 액션 기본 조합(apps/web UI 기본값). DOM 어댑터 인코딩 규약을 따른다(input 명세 §2):
 * Ctrl/Meta만 접두, Shift/Alt는 게임 키로 쓰이므로 접두하지 않는다.
 */
export const DEFAULT_META_BINDINGS: Pick<KeyBindings, "undo" | "redo" | "addPage"> = {
  undo: ["Ctrl+KeyZ"],
  redo: ["Ctrl+KeyY"],
  addPage: ["Ctrl+Enter"],
};

/** 저장된 부분 핸들링 → 완전한 HandlingConfig(기본값 병합). */
export function resolveHandling(stored: Partial<HandlingConfig> | null): HandlingConfig {
  const s = stored ?? {};
  return {
    das: numberOr(s.das, DEFAULT_HANDLING.das),
    arr: numberOr(s.arr, DEFAULT_HANDLING.arr),
    // sdf Infinity는 JSON에서 null로 직렬화되므로, 값이 없으면 기본(Infinity)으로 되돌린다.
    sdf: numberOr(s.sdf, DEFAULT_HANDLING.sdf),
  };
}

/** 저장된 부분 바인딩 → 완전한 KeyBindings(게임 기본 + 메타 기본 + 사용자 오버라이드). */
export function resolveKeys(stored: Partial<KeyBindings> | null): KeyBindings {
  const merged: KeyBindings = { ...DEFAULT_KEYS, ...DEFAULT_META_BINDINGS };
  if (stored) {
    for (const action of Object.keys(merged) as (keyof KeyBindings)[]) {
      const v = stored[action];
      if (Array.isArray(v)) merged[action] = [...v];
    }
  }
  return merged;
}

/** 저장소에서 완전한 설정을 읽어 온다(초기화 시점). */
export function loadSettings(storage: Storage): { handling: HandlingConfig; keys: KeyBindings } {
  return {
    handling: resolveHandling(storage.getHandling()),
    keys: resolveKeys(storage.getKeys()),
  };
}

/** 기본값으로 리셋(저장 삭제)하고 완전한 기본 설정을 반환한다(AW-8 리셋). */
export function resetSettings(storage: Storage): { handling: HandlingConfig; keys: KeyBindings } {
  storage.clearHandling();
  storage.clearKeys();
  return { handling: resolveHandling(null), keys: resolveKeys(null) };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && !Number.isNaN(value) ? value : fallback;
}
