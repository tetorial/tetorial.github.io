// 시뮬레이터 패널 (apps-web §3-D) — 저작 세션 조작(키+포인터) + 페이지·주석 + 업로드.
// 주석 입력 포커스 ↔ input.suspend 배선. 키보드는 attachDom(input, window)로 배선.
import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import { attachDom } from "@tetorial/input";
import BoardCanvas from "./BoardCanvas.tsx";
import { createSimulator, uploadNotes, type SimulatorController } from "../lib/simulator.ts";
import { branchOrigin, type LoadedReplay } from "../lib/open-replay.ts";
import { workFrame } from "../lib/view-frame.ts";
import { toDisplayError } from "../lib/errors.ts";
import { WorkerError } from "../lib/worker-client.ts";
import { getWorkerClient } from "../lib/worker-client-factory.ts";
import type { Storage } from "../lib/storage.ts";
import type { HandlingConfig, KeyBindings } from "@tetorial/input";
import type { CaptureResult } from "@tetorial/adapter-tetrio";
import type { Tool, WorkView } from "@tetorial/sim";

interface Props {
  storage: Storage;
  loaded: LoadedReplay;
  round: number;
  player: number;
  branch: CaptureResult;
  frame: number;
  settings: { handling: HandlingConfig; keys: KeyBindings };
  onExit: () => void;
}

export default function SimulatorPanel(props: Props) {
  const simRef = useRef<SimulatorController | null>(null);
  const drawing = useRef(false);
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const [comment, setComment] = useState("");
  const [tool, setTool] = useState<Tool["kind"]>("cell");
  const [status, setStatus] = useState<string | null>(null);
  const [editKeyNotice, setEditKeyNotice] = useState(false);

  // 세션 생성 + input 배선 (분기 스냅샷에서 진입)
  useEffect(() => {
    if (!props.branch.ok) return;
    const clientId = props.storage.getOrCreateClientId();
    const myFile = props.loaded.notesFiles.find((f) => f.clientId === clientId);
    const sim = createSimulator({
      handling: props.settings.handling,
      keys: props.settings.keys,
      init: {
        origin: branchOrigin(props.loaded, props.round, props.player, props.frame),
        snapshot: props.branch.snapshot,
        existingNoteIds: myFile?.notes.map((n) => n.id),
      },
      onLockError: () => setStatus("스폰 위치가 막혀 있습니다 — 셀을 지우고 다시 시도하세요."),
    });
    simRef.current = sim;
    const detachKeys = attachDom(sim.input, window);
    const unsub = sim.subscribe(rerender);
    // input 코어는 주입식 시각의 순수 상태 머신 — 앱이 매 프레임 tick(t)을 호출해야 DAS/ARR/SDF의
    // 반복이 진행된다(input README). 이 배선이 없으면 keydown 1회 이동 후 정지하고, release 시
    // 코어의 지연 정산으로 최종 위치만 튄다(W4 결함1). rAF 루프로 실시각을 공급한다.
    let raf = 0;
    const loop = (t: number): void => {
      sim.input.tick(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    rerender();
    return () => {
      cancelAnimationFrame(raf);
      detachKeys();
      unsub();
      sim.dispose();
      simRef.current = null;
    };
    // 분기 진입 시 1회만 세션을 만든다(props.branch는 진입 시점 고정 캡처).
  }, []);

  // 시뮬레이터는 무전환 동시 조작(D-14)이라 게임 키가 항상 활성이다. 버튼에 포커스가 잔류하면
  // Space(하드드롭) 등 게임 키가 그 버튼을 재클릭한다(§5 포커스 함정, 결함7). 모달 내 버튼 클릭이
  // 버블링되면 그 버튼을 blur해 포커스를 문서로 돌린다(주석 textarea는 버튼이 아니므로 유지 — suspend 대칭).
  const blurClickedButton = (e: Event): void => {
    const btn = (e.target as HTMLElement | null)?.closest("button");
    if (btn) btn.blur();
  };

  const sim = simRef.current;
  if (!props.branch.ok) {
    return (
      <div class="sim-modal" data-testid="sim-blocked">
        <p>이 지점은 분기할 수 없습니다: {props.branch.reason}</p>
        <button class="btn" onClick={props.onExit}>닫기</button>
      </div>
    );
  }
  if (!sim) return null;

  const onCellPointer = (cell: { x: number; y: number }, phase: "down" | "move" | "up"): void => {
    if (phase === "down") {
      const t: Tool = tool === "cell" ? { kind: "cell", v: "G" } : tool === "erase" ? { kind: "erase" } : { kind: "highlight" };
      sim.session.beginStroke(t);
      sim.session.strokeTo(cell);
      drawing.current = true;
    } else if (phase === "move" && drawing.current) {
      sim.session.strokeTo(cell);
    } else if (phase === "up" && drawing.current) {
      sim.session.endStroke();
      drawing.current = false;
    }
  };

  const doUpload = async (): Promise<void> => {
    const source = props.loaded.source;
    if (typeof source === "string") {
      setStatus("먼저 리플레이를 업로드해야 노트를 공유할 수 있습니다.");
      return;
    }
    setStatus("업로드 중…");
    const clientId = props.storage.getOrCreateClientId();
    const myFile = props.loaded.notesFiles.find((f) => f.clientId === clientId);
    try {
      const res = await uploadNotes({
        worker: getWorkerClient(),
        storage: props.storage,
        gistId: source.gistId,
        session: sim.session,
        currentFile: myFile?.file ?? null,
        clientId,
        authorName: myFile?.authorName,
      });
      if (!res.ok) {
        setStatus(`업로드 한도 초과: ${res.violations.map((v) => v.message).join("; ")}`);
        return;
      }
      if (res.editKeyCreated) setEditKeyNotice(true);
      setStatus("업로드 완료 — 사이드바가 갱신되었습니다.");
    } catch (e) {
      if (e instanceof WorkerError) {
        setStatus(toDisplayError({ source: "worker", status: e.status, body: e.body, retryAfterMs: e.retryAfterMs }).title);
      } else {
        setStatus("업로드에 실패했습니다.");
      }
    }
  };

  return (
    <div class="sim-modal" role="dialog" aria-label="시뮬레이터" data-testid="sim-panel">
      <div class="sim-inner" onClick={blurClickedButton}>
        <div class="sim-head">
          <h2>시뮬레이터</h2>
          <button class="btn" data-testid="sim-exit" onClick={props.onExit}>
            나가기
          </button>
        </div>

        <div class="sim-body">
          <div class="sim-board">
            <PieceBar work={sim.session.work} />
            <BoardCanvas frame={workFrame(sim.session.work)} onCellPointer={onCellPointer} />
            <div class="tool-row">
              {(["cell", "erase", "highlight"] as Tool["kind"][]).map((k) => (
                <button
                  class={`btn${tool === k ? " primary" : ""}`}
                  data-testid={`tool-${k}`}
                  onClick={() => setTool(k)}
                >
                  {k === "cell" ? "그리기" : k === "erase" ? "지우개" : "하이라이트"}
                </button>
              ))}
              <button class="btn" data-testid="sim-undo" onClick={() => sim.session.undo()} disabled={!sim.session.canUndo}>
                실행 취소
              </button>
              <button class="btn" data-testid="sim-redo" onClick={() => sim.session.redo()} disabled={!sim.session.canRedo}>
                다시 실행
              </button>
            </div>
          </div>

          <div class="sim-side">
            <label class="comment-label">
              주석
              <textarea
                data-testid="comment-input"
                value={comment}
                onFocus={() => sim.setCommentFocus(true)}
                onBlur={() => sim.setCommentFocus(false)}
                onInput={(e) => setComment((e.target as HTMLTextAreaElement).value)}
                rows={3}
              />
            </label>
            <button
              class="btn primary"
              data-testid="add-page"
              onClick={() => {
                sim.session.addPage(comment);
                setComment("");
              }}
            >
              페이지 추가
            </button>

            <ol class="page-list" data-testid="page-list">
              {sim.session.pages.map((p, i) => (
                <li>
                  {i + 1}. {p.comment ?? "(주석 없음)"}
                  <button class="link" onClick={() => sim.session.loadPageIntoWork(p.id)}>불러오기</button>
                  <button class="link" onClick={() => sim.session.deletePage(p.id)}>삭제</button>
                </li>
              ))}
            </ol>

            <button class="btn" data-testid="sim-upload" onClick={() => void doUpload()}>
              노트 업로드
            </button>
            {status && <p class="status" data-testid="sim-status">{status}</p>}
            {editKeyNotice && (
              <p class="notice" data-testid="editkey-notice">
                편집 키가 이 브라우저에 저장되었습니다. 잃어버리면 이 노트를 수정할 수 없습니다.
              </p>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .sim-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 60;
          display: flex; align-items: center; justify-content: center; }
        .sim-inner { background: var(--color-surface); border-radius: var(--radius);
          padding: var(--space-5); max-width: 60rem; width: 95%; max-height: 92vh; overflow: auto;
          box-shadow: var(--shadow); }
        .sim-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
        .sim-head h2 { margin: 0; }
        .sim-body { display: grid; grid-template-columns: auto 1fr; gap: var(--space-5); }
        .piece-bar { display: flex; gap: var(--space-4); margin-bottom: var(--space-2);
          font-size: var(--text-sm); color: var(--color-text-muted); font-family: var(--font-mono); }
        .piece-bar strong { color: var(--color-text); font-weight: 600; }
        .tool-row { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); }
        .sim-side { display: grid; gap: var(--space-3); align-content: start; }
        .comment-label { display: grid; gap: var(--space-1); }
        textarea { width: 100%; padding: var(--space-2); border: 1px solid var(--color-border);
          border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text); font: inherit; }
        .page-list { display: grid; gap: var(--space-1); font-size: var(--text-sm); padding-left: var(--space-4); }
        .page-list .link { background: none; border: none; color: var(--color-accent); margin-left: var(--space-2); }
        .notice { color: var(--color-warn); font-size: var(--text-sm); }
        .status { color: var(--color-text-muted); font-size: var(--text-sm); }
        .btn { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border);
          border-radius: var(--radius-sm); background: var(--color-surface-2); color: var(--color-text); }
        .btn.primary { background: var(--color-accent); color: var(--color-accent-contrast); border-color: transparent; }
        .btn:disabled { opacity: 0.5; }
        @media (max-width: 48rem) { .sim-body { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

/** 시뮬레이터 홀드·넥스트 표시 (WorkView 바인딩 — 결함2). 그래픽 렌더는 UI/UX 개편 백로그(계층 C). */
function PieceBar({ work }: { work: WorkView }) {
  return (
    <div class="piece-bar">
      <span data-testid="sim-hold">
        홀드: <strong>{work.hold.piece ?? "—"}</strong>
        {work.hold.piece && work.hold.locked ? " (잠김)" : ""}
      </span>
      <span data-testid="sim-next">
        다음: <strong>{work.next.length > 0 ? work.next.slice(0, 5).join(" ") : "—"}</strong>
      </span>
    </div>
  );
}
