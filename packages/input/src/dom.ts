// @tetorial/input DOM 어댑터 — keydown/keyup/blur를 코어로 중계하는 소형 래퍼 (명세 §1·§4).
// 코어는 순수(주입식 시각)이므로 실시각(performance.now)은 어댑터가 공급한다.
//
// 모디파이어 인코딩 규약 (명세 §2 — 어댑터가 소유):
// - 비수식키 keydown에 ctrlKey/metaKey가 눌려 있으면 "Ctrl+"·"Meta+"(이 순서)를 접두해 전달.
//   예: Ctrl+Z → press("Ctrl+KeyZ"). Alt·Shift는 접두하지 않는다 — 테트리스에서 게임 키로
//   흔히 바인딩되므로 수식키 취급 시 조작이 깨진다.
// - 수식키 자체(Control*/Meta*/Alt*/Shift*)의 keydown은 bare code로 전달 (게임 키 바인딩 허용).
// - keyup 짝맞춤: 발화한 문자열을 물리 code별로 기억해 두었다가 그 문자열로 release한다 —
//   수식키를 먼저 떼도 스턱 키가 생기지 않는다.
import type { InputCore } from "./types.js";

/** keydown/keyup 이벤트에서 읽는 최소 형태 (Event → KeyboardEvent 구조적 접근) */
type KeyEventLike = Event & {
  readonly code?: string;
  readonly repeat?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
};

const MODIFIER_CODE = /^(Control|Meta|Alt|Shift)(Left|Right)?$/;

/** 명세 §2의 정규 인코딩: Ctrl+ → Meta+ 접두 (수식키 자체는 bare) */
function encodeKey(ke: KeyEventLike, code: string): string {
  if (MODIFIER_CODE.test(code)) return code;
  let out = code;
  if (ke.metaKey) out = `Meta+${out}`;
  if (ke.ctrlKey) out = `Ctrl+${out}`;
  return out;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * 코어를 DOM 이벤트 타깃에 배선한다. 반환값 호출로 해제.
 * - keydown: `event.repeat`(OS 키 반복) 필터 후 인코딩해 `press` (§3-2·§2)
 * - keyup: 같은 물리 code로 발화했던 문자열로 `release` (짝맞춤)
 * - blur: `reset` — 탭 전환/포커스 이탈 시 스턱 키 방지 (§3-4)
 */
export function attachDom(core: InputCore, el: EventTarget): () => void {
  const emitted = new Map<string, string>(); // 물리 code → 발화 문자열

  const onKeyDown = (e: Event): void => {
    const ke = e as KeyEventLike;
    if (ke.repeat) return; // OS 키 반복 무시
    if (typeof ke.code !== "string") return;
    const encoded = encodeKey(ke, ke.code);
    emitted.set(ke.code, encoded);
    core.press(encoded, nowMs());
  };
  const onKeyUp = (e: Event): void => {
    const ke = e as KeyEventLike;
    if (typeof ke.code !== "string") return;
    const encoded = emitted.get(ke.code) ?? ke.code;
    emitted.delete(ke.code);
    core.release(encoded, nowMs());
  };
  const onBlur = (): void => {
    emitted.clear();
    core.reset();
  };

  el.addEventListener("keydown", onKeyDown);
  el.addEventListener("keyup", onKeyUp);
  el.addEventListener("blur", onBlur);

  return () => {
    el.removeEventListener("keydown", onKeyDown);
    el.removeEventListener("keyup", onKeyUp);
    el.removeEventListener("blur", onBlur);
  };
}
