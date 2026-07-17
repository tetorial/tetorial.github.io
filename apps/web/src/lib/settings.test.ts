import { describe, it, expect } from "vitest";
import { DEFAULT_HANDLING, DEFAULT_KEYS } from "@tetorial/input";
import { Storage, MemoryStorage } from "./storage.js";
import {
  resolveHandling,
  resolveKeys,
  loadSettings,
  resetSettings,
  DEFAULT_META_BINDINGS,
  WEB_DEFAULT_GAME_KEYS,
} from "./settings.js";

// AW-8 설정: 핸들링·키 변경 즉시 반영 + 영속, 리셋.
describe("AW-8 핸들링 해석", () => {
  it("AW-8 저장값 없으면 input 기본 핸들링", () => {
    expect(resolveHandling(null)).toEqual(DEFAULT_HANDLING);
  });

  it("AW-8 부분 저장값 병합", () => {
    expect(resolveHandling({ arr: 0 })).toEqual({ ...DEFAULT_HANDLING, arr: 0 });
  });

  it("AW-8 sdf Infinity가 JSON null로 저장돼도 기본(Infinity)으로 복원", () => {
    // JSON.stringify(Infinity) === "null" → 읽으면 sdf가 null
    const restored = resolveHandling({ sdf: null as unknown as number });
    expect(restored.sdf).toBe(Infinity);
  });
});

describe("AW-8 키 바인딩 해석", () => {
  it("AW-8 게임 기본 + 메타 기본 병합(메타 기본은 apps/web 주입)", () => {
    const keys = resolveKeys(null);
    expect(keys.moveLeft).toEqual(DEFAULT_KEYS.moveLeft);
    // input DEFAULT_KEYS는 메타 액션이 비어 있고, apps/web이 기본 조합을 채운다.
    expect(DEFAULT_KEYS.undo).toEqual([]);
    expect(keys.undo).toEqual(DEFAULT_META_BINDINGS.undo);
    expect(keys.redo).toEqual(DEFAULT_META_BINDINGS.redo);
    expect(keys.addPage).toEqual(DEFAULT_META_BINDINGS.addPage);
  });

  it("AW-8 메타 기본 바인딩은 모디파이어 인코딩 규약(Ctrl+ 접두)", () => {
    expect(DEFAULT_META_BINDINGS.undo[0]).toMatch(/^Ctrl\+/);
  });

  it("AW-8 사용자 오버라이드가 기본을 대체", () => {
    const keys = resolveKeys({ moveLeft: ["KeyA", "KeyH"] });
    expect(keys.moveLeft).toEqual(["KeyA", "KeyH"]);
    expect(keys.moveRight).toEqual(DEFAULT_KEYS.moveRight);
  });
});

describe("M1d-7 키 기본값 웹 오버라이드 (apps-web-m1d §5)", () => {
  it("M1d-7 홀드 ShiftLeft·시계 회전 ArrowUp이 기본 적용된다", () => {
    const keys = resolveKeys(null);
    expect(keys.hold).toEqual(["ShiftLeft"]);
    expect(keys.rotateCW).toEqual(["ArrowUp"]);
    expect(WEB_DEFAULT_GAME_KEYS).toEqual({ hold: ["ShiftLeft"], rotateCW: ["ArrowUp"] });
  });

  it("M1d-7 나머지 게임 키는 input DEFAULT_KEYS 상속 (라이브러리 기본값 무수정)", () => {
    const keys = resolveKeys(null);
    expect(keys.moveLeft).toEqual(DEFAULT_KEYS.moveLeft);
    expect(keys.hardDrop).toEqual(DEFAULT_KEYS.hardDrop);
    expect(keys.rotateCCW).toEqual(DEFAULT_KEYS.rotateCCW);
    // input의 기본값 자체는 그대로다 — 오버라이드는 웹 병합 지점에서만.
    expect(DEFAULT_KEYS.hold).toEqual(["KeyC"]);
    expect(DEFAULT_KEYS.rotateCW).toEqual(["KeyX"]);
  });

  it("M1d-7 기존 사용자 저장 설정이 있으면 그것이 우선(마이그레이션 없음)", () => {
    const keys = resolveKeys({ hold: ["KeyC"], rotateCW: ["KeyX"] });
    expect(keys.hold).toEqual(["KeyC"]);
    expect(keys.rotateCW).toEqual(["KeyX"]);
  });

  it("M1d-7 리셋 후에도 웹 오버라이드가 기본이다", () => {
    const storage = new Storage(new MemoryStorage());
    storage.setKeys({ hold: ["KeyC"] });
    const reset = resetSettings(storage);
    expect(reset.keys.hold).toEqual(["ShiftLeft"]);
    expect(reset.keys.rotateCW).toEqual(["ArrowUp"]);
  });
});

describe("AW-8 영속·리셋", () => {
  it("AW-8 저장 후 재로드 시 변경 반영(영속)", () => {
    const storage = new Storage(new MemoryStorage());
    storage.setHandling({ arr: 0, das: 100 });
    storage.setKeys({ hardDrop: ["Space", "KeyK"] });
    const loaded = loadSettings(storage);
    expect(loaded.handling.arr).toBe(0);
    expect(loaded.handling.das).toBe(100);
    expect(loaded.keys.hardDrop).toEqual(["Space", "KeyK"]);
  });

  it("AW-8 리셋 시 저장 삭제 + 기본값 반환", () => {
    const storage = new Storage(new MemoryStorage());
    storage.setHandling({ arr: 0 });
    const reset = resetSettings(storage);
    expect(reset.handling).toEqual(DEFAULT_HANDLING);
    expect(storage.getHandling()).toBeNull();
    expect(loadSettings(storage).handling).toEqual(DEFAULT_HANDLING);
  });
});
