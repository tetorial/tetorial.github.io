// 클라이언트 storage 유틸 — localStorage 직접 접근 금지(conventions §5-6). 키는 tetorial: 네임스페이스(§7).
// 백엔드는 주입 가능(테스트에서 fake 주입) — 기본은 globalThis.localStorage.
import type { HandlingConfig, KeyBindings } from "@tetorial/input";

/** 최소 Storage 계약(테스트 fake·localStorage 공통). */
export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const NS = "tetorial:";
const K = {
  clientId: `${NS}clientId`,
  handling: `${NS}handling`,
  keys: `${NS}keys`,
  theme: `${NS}theme`,
  editKey: (gistId: string) => `${NS}editKey:${gistId}`,
} as const;

export type ThemePref = "light" | "dark" | "system";

/** URL-safe 알파벳( [A-Za-z0-9_-] 64자 ) — clientId 문자 규약과 일치. */
const URLSAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

function randomToken(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += URLSAFE[b & 63];
  return out;
}

function defaultBackend(): StorageBackend | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Safari 프라이빗 모드 등에서 접근 시 throw — null로 처리(비영속 폴백은 호출자 몫).
  }
  return null;
}

export class Storage {
  readonly #backend: StorageBackend | null;

  constructor(backend: StorageBackend | null = defaultBackend()) {
    this.#backend = backend;
  }

  #get(key: string): string | null {
    try {
      return this.#backend?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  #set(key: string, value: string): void {
    try {
      this.#backend?.setItem(key, value);
    } catch {
      /* 용량 초과·비영속 환경 — 무시 */
    }
  }
  #remove(key: string): void {
    try {
      this.#backend?.removeItem(key);
    } catch {
      /* 무시 */
    }
  }

  /** clientId 조회, 없으면 최초 방문으로 간주해 생성·보관([A-Za-z0-9_-]{12}). */
  getOrCreateClientId(): string {
    const existing = this.#get(K.clientId);
    if (existing && /^[A-Za-z0-9_-]{12}$/.test(existing)) return existing;
    const id = randomToken(12);
    this.#set(K.clientId, id);
    return id;
  }

  /** 이미 저장된 clientId(없으면 null) — 생성하지 않는다. */
  peekClientId(): string | null {
    const v = this.#get(K.clientId);
    return v && /^[A-Za-z0-9_-]{12}$/.test(v) ? v : null;
  }

  /* ── editKey(gist별 클라이언트 시크릿) ─────────────────────── */

  /** gist의 editKey 조회(없으면 null). */
  getEditKey(gistId: string): string | null {
    return this.#get(K.editKey(gistId));
  }

  /**
   * gist의 editKey를 조회하되 없으면 생성·보관하고 `created: true`를 반환한다.
   * created=true일 때 호출자는 "이 브라우저에 저장됨, 잃으면 수정 불가" 1회 고지를 띄운다(§4·AW-7).
   */
  getOrCreateEditKey(gistId: string): { editKey: string; created: boolean } {
    const existing = this.getEditKey(gistId);
    if (existing) return { editKey: existing, created: false };
    const editKey = randomToken(32);
    this.#set(K.editKey(gistId), editKey);
    return { editKey, created: true };
  }

  hasEditKey(gistId: string): boolean {
    return this.getEditKey(gistId) !== null;
  }

  /* ── 핸들링·키 바인딩 ──────────────────────────────────────── */

  getHandling(): Partial<HandlingConfig> | null {
    return parseJson<Partial<HandlingConfig>>(this.#get(K.handling));
  }
  setHandling(handling: Partial<HandlingConfig>): void {
    this.#set(K.handling, JSON.stringify(handling));
  }
  clearHandling(): void {
    this.#remove(K.handling);
  }

  getKeys(): Partial<KeyBindings> | null {
    return parseJson<Partial<KeyBindings>>(this.#get(K.keys));
  }
  setKeys(keys: Partial<KeyBindings>): void {
    this.#set(K.keys, JSON.stringify(keys));
  }
  clearKeys(): void {
    this.#remove(K.keys);
  }

  /* ── 테마 선호(라이트/다크/시스템) ─────────────────────────── */

  getTheme(): ThemePref {
    const v = this.#get(K.theme);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  }
  setTheme(theme: ThemePref): void {
    this.#set(K.theme, theme);
  }
}

function parseJson<T>(raw: string | null): T | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 메모리 백엔드 — 테스트·비영속 폴백용. */
export class MemoryStorage implements StorageBackend {
  readonly #map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.#map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.#map.set(key, value);
  }
  removeItem(key: string): void {
    this.#map.delete(key);
  }
}
