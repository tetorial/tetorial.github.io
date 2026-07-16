// 홈 진입 아일랜드 (apps-web §2 OpenIsland) — 파일 드롭/선택 + gist URL 입력.
import { useState, useCallback, useRef } from "preact/hooks";
import { withBase } from "../lib/base-url.ts";
import { stashPendingReplay, extractGistId } from "../lib/handoff.ts";

function goToReplay(query = ""): void {
  window.location.href = withBase("/replay") + query;
}

export default function OpenIsland() {
  const [dragOver, setDragOver] = useState(false);
  const [gistInput, setGistInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFile = useCallback(async (file: File) => {
    setError(null);
    const text = await file.text();
    await stashPendingReplay({ filename: file.name, text });
    goToReplay();
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void openFile(file);
    },
    [openFile],
  );

  const onGistOpen = useCallback(() => {
    const id = extractGistId(gistInput);
    if (id === null) {
      setError("공유 링크 또는 gist ID 형식이 올바르지 않습니다.");
      return;
    }
    goToReplay(`?gist=${encodeURIComponent(id)}`);
  }, [gistInput]);

  return (
    <div class="open-island">
      <section
        class={`dropzone${dragOver ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        data-testid="dropzone"
      >
        <p class="dz-title">리플레이 파일 열기</p>
        <p class="dz-hint">.ttrm / .ttr 파일을 여기에 끌어다 놓거나 선택하세요.</p>
        <button
          class="btn primary"
          onClick={() => fileInputRef.current?.click()}
          data-testid="pick-file"
        >
          파일 선택
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ttrm,.ttr,application/json"
          class="visually-hidden"
          onChange={(e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) void openFile(file);
          }}
          data-testid="file-input"
        />
      </section>

      <section class="gist-open">
        <p class="dz-title">공유 링크 열기</p>
        <div class="gist-row">
          <input
            type="text"
            placeholder="공유 링크 또는 gist ID"
            value={gistInput}
            onInput={(e) => setGistInput((e.target as HTMLInputElement).value)}
            data-testid="gist-input"
          />
          <button class="btn" onClick={onGistOpen} data-testid="gist-open">
            열기
          </button>
        </div>
      </section>

      {error && (
        <p class="error" role="alert" data-testid="open-error">
          {error}
        </p>
      )}

      <style>{`
        .open-island { display: grid; gap: var(--space-5); max-width: 40rem; }
        .dropzone {
          border: 2px dashed var(--color-border);
          border-radius: var(--radius);
          padding: var(--space-6);
          text-align: center;
          background: var(--color-surface);
          transition: border-color 0.15s, background 0.15s;
        }
        .dropzone.over { border-color: var(--color-accent); background: var(--color-surface-2); }
        .dz-title { font-size: var(--text-lg); font-weight: 600; margin: 0 0 var(--space-2); }
        .dz-hint { color: var(--color-text-muted); margin: 0 0 var(--space-4); }
        .gist-open { background: var(--color-surface); border: 1px solid var(--color-border);
          border-radius: var(--radius); padding: var(--space-5); }
        .gist-row { display: flex; gap: var(--space-2); }
        .gist-row input { flex: 1; padding: var(--space-2) var(--space-3);
          border: 1px solid var(--color-border); border-radius: var(--radius-sm);
          background: var(--color-bg); color: var(--color-text); }
        .btn { padding: var(--space-2) var(--space-4); border: 1px solid var(--color-border);
          border-radius: var(--radius-sm); background: var(--color-surface-2); color: var(--color-text); }
        .btn.primary { background: var(--color-accent); color: var(--color-accent-contrast); border-color: transparent; }
        .error { color: var(--color-danger); }
        .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      `}</style>
    </div>
  );
}
