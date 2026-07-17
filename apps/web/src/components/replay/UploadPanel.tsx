// 리플레이 업로드 패널 + 공유 배너 (ReplayIsland 분해 — M4-C AW-23, #46. 분리 1순위).
import { useState, useMemo } from "preact/hooks";
import { buildDeepLink } from "../../lib/deeplink.ts";
import { originalRound, type LoadedReplay } from "../../lib/open-replay.ts";
import {
  allRoundIndices,
  estimateUploadSize,
  buildUploadPayload,
  UPLOAD_WARN_BYTES,
} from "../../lib/upload.ts";
import { WorkerError } from "../../lib/worker-client.ts";
import { toDisplayError } from "../../lib/errors.ts";
import { getWorkerClient } from "../../lib/worker-client-factory.ts";

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// 공유 배너는 조건부 렌더 — 스타일은 컴포넌트 자신의 <style>로 동반한다(m4c §3 <style> 누락 함정 주의).
export function ShareBanner({ gistId, onClose }: { gistId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  // 공유 링크는 경로형 정규형만 발신한다(M1d-1 — §2).
  const shareUrl = `${window.location.origin}${buildDeepLink({ gistId })}`;
  return (
    <div class="share-banner" data-testid="share-banner">
      <span>업로드 완료 — 공유 링크가 생성되었습니다.</span>
      <button
        class="btn"
        data-testid="copy-share"
        onClick={() => {
          void navigator.clipboard?.writeText(shareUrl);
          setCopied(true);
        }}
      >
        {copied ? "복사됨" : "공유 링크 복사"}
      </button>
      <button class="btn" onClick={onClose} aria-label="닫기">✕</button>
      <style>{`
        .share-banner { display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap;
          padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
          background: var(--color-surface-2); border: 1px solid var(--color-success); font-size: var(--text-sm); }
      `}</style>
    </div>
  );
}

/** 업로드 플로우 (§3-B) — 라운드 발췌 다중 선택·용량 표시 → MetaFile 조립 → POST /g. */
export function UploadPanel({
  doc,
  roundMap,
  onCancel,
  onUploaded,
}: {
  doc: LoadedReplay["doc"];
  roundMap: number[];
  onCancel: () => void;
  onUploaded: (gistId: string) => void;
}) {
  const [selected, setSelected] = useState<number[]>(() => allRoundIndices(doc));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const multi = doc.rounds.length > 1;

  // 용량은 실제 gzip+base64로 산출(§3-B). 선택이 비면 계산용으로 첫 라운드를 임시 사용.
  const est = useMemo(
    () => estimateUploadSize(doc, selected.length ? selected : [0]),
    [doc, selected],
  );

  const toggle = (i: number): void => {
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i].sort((a, b) => a - b)));
  };

  const submit = async (): Promise<void> => {
    if (selected.length === 0) {
      setError("최소 한 라운드를 선택하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = await buildUploadPayload({
        doc,
        selectedRounds: selected,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(nickname ? { nickname } : {}),
      });
      const worker = getWorkerClient();
      const res = await worker.createReplay({ meta: payload.meta, replayBody: payload.replayBody });
      onUploaded(res.gistId);
    } catch (e) {
      if (e instanceof WorkerError) {
        setError(
          toDisplayError({ source: "worker", status: e.status, body: e.body, retryAfterMs: e.retryAfterMs }).title,
        );
      } else {
        setError("업로드에 실패했습니다. 저장 기능이 설정되지 않았을 수 있습니다.");
      }
      setBusy(false);
    }
  };

  return (
    <div class="upload-modal" role="dialog" aria-label="리플레이 업로드" data-testid="upload-panel">
      <div class="um-inner">
        <div class="um-head">
          <h2>리플레이 업로드</h2>
          <button class="btn" onClick={onCancel} aria-label="닫기">✕</button>
        </div>

        {multi && (
          <fieldset class="round-select" data-testid="upload-rounds">
            <legend>라운드 선택 (기본 전체)</legend>
            {doc.rounds.map((_, i) => (
              <label>
                <input type="checkbox" checked={selected.includes(i)} onChange={() => toggle(i)} />
                R{originalRound(roundMap, i) + 1}
                <span class="rs-size">{formatKB(est.perRoundRawBytes[i] ?? 0)}</span>
              </label>
            ))}
          </fieldset>
        )}

        <p class="upload-size" data-testid="upload-size">
          업로드 크기 약 <strong>{formatKB(est.replayBodyBytes)}</strong>
          {est.overWarn && (
            <span class="warn"> — {formatKB(UPLOAD_WARN_BYTES)} 초과, 라운드를 줄이는 것을 권장합니다.</span>
          )}
        </p>

        <label class="um-field">
          제목
          <input
            type="text"
            value={title}
            data-testid="upload-title"
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="um-field">
          설명
          <input type="text" value={description} onInput={(e) => setDescription((e.target as HTMLInputElement).value)} />
        </label>
        <label class="um-field">
          닉네임
          <input type="text" value={nickname} onInput={(e) => setNickname((e.target as HTMLInputElement).value)} />
        </label>
        <p class="hint">닉네임은 인증되지 않습니다.</p>

        {error && <p class="error-detail" data-testid="upload-error">{error}</p>}

        <div class="um-actions">
          <button class="btn primary" data-testid="upload-submit" onClick={() => void submit()} disabled={busy}>
            {busy ? "업로드 중…" : "업로드"}
          </button>
          <button class="btn" onClick={onCancel} disabled={busy}>취소</button>
        </div>
      </div>
      <style>{`
        .upload-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 55;
          display: flex; align-items: center; justify-content: center; }
        .um-inner { background: var(--color-surface); border-radius: var(--radius); padding: var(--space-5);
          max-width: 32rem; width: 92%; max-height: 92vh; overflow: auto; box-shadow: var(--shadow);
          display: grid; gap: var(--space-3); }
        .um-head { display: flex; justify-content: space-between; align-items: center; }
        .um-head h2 { margin: 0; }
        .round-select { border: 1px solid var(--color-border); border-radius: var(--radius-sm);
          display: grid; gap: var(--space-1); padding: var(--space-2) var(--space-3); }
        .round-select label { display: flex; gap: var(--space-2); align-items: center; }
        .rs-size { color: var(--color-text-muted); font-size: var(--text-sm); margin-left: auto; }
        .um-field { display: grid; gap: var(--space-1); }
        .um-actions { display: flex; gap: var(--space-2); }
      `}</style>
    </div>
  );
}
