// 설정 패널 (apps-web §1·§2 SettingsPanel) — 핸들링·키·테마. input.configure/rebind 연결 + 영속.
import { useState } from "preact/hooks";
import type { HandlingConfig, KeyBindings } from "@tetorial/input";
import type { ThemePref } from "../lib/storage.ts";

interface Props {
  handling: HandlingConfig;
  keys: KeyBindings;
  theme: ThemePref;
  onHandlingChange: (patch: Partial<HandlingConfig>) => void;
  onThemeChange: (theme: ThemePref) => void;
  onReset: () => void;
  onClose: () => void;
}

const ACTION_LABELS: Record<keyof KeyBindings, string> = {
  moveLeft: "왼쪽 이동",
  moveRight: "오른쪽 이동",
  softDrop: "소프트드롭",
  hardDrop: "하드드롭",
  rotateCW: "시계 회전",
  rotateCCW: "반시계 회전",
  rotate180: "180 회전",
  hold: "홀드",
  undo: "실행 취소",
  redo: "다시 실행",
  addPage: "페이지 추가",
};

export default function SettingsPanel(props: Props) {
  const [sdfInfinite, setSdfInfinite] = useState(props.handling.sdf === Infinity);

  return (
    <div class="settings-panel" role="dialog" aria-label="설정" data-testid="settings-panel">
      <div class="sp-head">
        <h2>설정</h2>
        <button class="btn" onClick={props.onClose} aria-label="닫기">
          ✕
        </button>
      </div>

      <fieldset>
        <legend>핸들링</legend>
        <label>
          DAS (ms)
          <input
            type="number"
            min={0}
            value={props.handling.das}
            data-testid="handling-das"
            onInput={(e) =>
              props.onHandlingChange({ das: Number((e.target as HTMLInputElement).value) })
            }
          />
        </label>
        <label>
          ARR (ms, 0=즉시 벽까지)
          <input
            type="number"
            min={0}
            value={props.handling.arr}
            data-testid="handling-arr"
            onInput={(e) =>
              props.onHandlingChange({ arr: Number((e.target as HTMLInputElement).value) })
            }
          />
        </label>
        <label class="checkbox">
          <input
            type="checkbox"
            checked={sdfInfinite}
            onChange={(e) => {
              const inf = (e.target as HTMLInputElement).checked;
              setSdfInfinite(inf);
              props.onHandlingChange({ sdf: inf ? Infinity : 20 });
            }}
          />
          SDF 무한(바닥까지 즉시)
        </label>
        {!sdfInfinite && (
          <label>
            SDF 배율
            <input
              type="number"
              min={1}
              value={props.handling.sdf === Infinity ? 20 : props.handling.sdf}
              onInput={(e) =>
                props.onHandlingChange({ sdf: Number((e.target as HTMLInputElement).value) })
              }
            />
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend>테마</legend>
        <div class="theme-row">
          {(["system", "light", "dark"] as ThemePref[]).map((t) => (
            <label class="radio">
              <input
                type="radio"
                name="theme"
                checked={props.theme === t}
                onChange={() => props.onThemeChange(t)}
                data-testid={`theme-${t}`}
              />
              {t === "system" ? "시스템" : t === "light" ? "라이트" : "다크"}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>키 바인딩</legend>
        <ul class="key-list">
          {(Object.keys(ACTION_LABELS) as (keyof KeyBindings)[]).map((action) => (
            <li>
              <span>{ACTION_LABELS[action]}</span>
              <code>{props.keys[action].join(", ") || "—"}</code>
            </li>
          ))}
        </ul>
        <p class="hint">키 재바인딩 UI는 다음 마일스톤. 현재는 기본 바인딩을 표시합니다.</p>
      </fieldset>

      <button class="btn" onClick={props.onReset} data-testid="settings-reset">
        기본값으로 리셋
      </button>

      <style>{`
        .settings-panel { background: var(--color-surface); border: 1px solid var(--color-border);
          border-radius: var(--radius); padding: var(--space-4); display: grid; gap: var(--space-4);
          max-width: 24rem; box-shadow: var(--shadow); }
        .sp-head { display: flex; justify-content: space-between; align-items: center; }
        .sp-head h2 { margin: 0; font-size: var(--text-lg); }
        fieldset { border: 1px solid var(--color-border); border-radius: var(--radius-sm);
          display: grid; gap: var(--space-2); padding: var(--space-3); }
        legend { padding: 0 var(--space-2); color: var(--color-text-muted); }
        label { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
        label.checkbox, label.radio { justify-content: flex-start; }
        input[type="number"] { width: 6rem; padding: var(--space-1) var(--space-2);
          border: 1px solid var(--color-border); border-radius: var(--radius-sm);
          background: var(--color-bg); color: var(--color-text); }
        .theme-row { display: flex; gap: var(--space-3); }
        .key-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); font-size: var(--text-sm); }
        .key-list li { display: flex; justify-content: space-between; }
        .key-list code { font-family: var(--font-mono); color: var(--color-text-muted); }
        .hint { margin: 0; }
      `}</style>
    </div>
  );
}
