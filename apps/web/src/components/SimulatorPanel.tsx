// 시뮬레이터 패널 (apps-web §3-D, m3b §2·§5) — 저작 세션 조작(키+포인터) + 페이지·주석 + 노트 완성.
// 업로드는 여기 없다: "노트 완성"이 세션을 노트로 확정해 아일랜드의 메모리 수집함에 넘기고(AW-15),
// 묶음 업로드는 시뮬레이터 밖에서 일어난다(AW-16).
// 주석 입력 포커스 ↔ input.suspend 배선. 키보드는 attachDom(input, window)로 배선.
import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import { attachDom } from "@tetorial/input";
import BoardCanvas from "./BoardCanvas.tsx";
import GameHud from "./GameHud.tsx";
import {
  createSimulator,
  type CreateSimulatorParams,
  type SimulatorController,
} from "../lib/simulator.ts";
import { finishNote } from "../lib/note-collection.ts";
import { branchOrigin, type LoadedReplay } from "../lib/open-replay.ts";
import { workFrame } from "../lib/view-frame.ts";
import { workHud } from "../lib/game-hud.ts";
import type { Storage } from "../lib/storage.ts";
import type { HandlingConfig, KeyBindings } from "@tetorial/input";
import type { CaptureResult } from "@tetorial/adapter-tetrio";
import type { Tool } from "@tetorial/sim";
import type { Note } from "@tetorial/types";

/** 시뮬레이터 진입 경로 — 리플레이 분기(신규 노트) 또는 내 노트 이어서 편집(AW-13).
    분기 실패는 진입 전에 인라인 안내로 소화된다(AW-22) — 성공 변형만 도달할 수 있다. */
export type SimEntry =
  | {
      kind: "branch";
      branch: Extract<CaptureResult, { ok: true }>;
      frame: number;
      round: number;
      player: number;
    }
  | { kind: "existing"; note: Note };

interface Props {
  storage: Storage;
  loaded: LoadedReplay;
  entry: SimEntry;
  /** 이미 수집함에 있는 노트 id — 신규 노트 id 충돌 대조(파일의 id와 함께 sim에 넘긴다). */
  collectedNoteIds: string[];
  settings: { handling: HandlingConfig; keys: KeyBindings };
  /** 노트 완성 → 메모리 수집함으로. 업로드하지 않는다(AW-15). */
  onCollect: (note: Note) => void;
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

  // 세션 생성 + input 배선 (분기 스냅샷 또는 기존 노트에서 진입)
  useEffect(() => {
    const entry = props.entry;
    let init: CreateSimulatorParams["init"];
    if (entry.kind === "existing") {
      // 재편집은 { existing }만 넘긴다 — id·origin·snapshot 전부 노트에서 온다(M1b-5).
      init = { existing: entry.note };
    } else {
      const clientId = props.storage.getOrCreateClientId();
      const myFile = props.loaded.notesFiles.find((f) => f.clientId === clientId);
      init = {
        origin: branchOrigin(props.loaded, entry.round, entry.player, entry.frame),
        snapshot: entry.branch.snapshot,
        // 파일의 기존 노트 + 아직 안 올린 수집 노트 모두와 id가 겹치지 않아야 한다.
        existingNoteIds: [...(myFile?.notes.map((n) => n.id) ?? []), ...props.collectedNoteIds],
      };
    }
    const sim = createSimulator({
      handling: props.settings.handling,
      keys: props.settings.keys,
      init,
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
    // 진입 시 1회만 세션을 만든다(props.entry는 진입 시점 고정 캡처).
  }, []);

  // 시뮬레이터는 무전환 동시 조작(D-14)이라 게임 키가 항상 활성이다. 버튼에 포커스가 잔류하면
  // Space(하드드롭) 등 게임 키가 그 버튼을 재클릭한다(§5 포커스 함정, 결함7). 모달 내 버튼 클릭이
  // 버블링되면 그 버튼을 blur해 포커스를 문서로 돌린다(주석 textarea는 버튼이 아니므로 유지 — suspend 대칭).
  const blurClickedButton = (e: Event): void => {
    const btn = (e.target as HTMLElement | null)?.closest("button");
    if (btn) btn.blur();
  };

  const sim = simRef.current;
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

  /** 노트 완성 — 수집함에 넣고 시뮬레이터를 닫는다. 노트 단위 한도 위반은 여기서 표시(AW-15). */
  const doFinish = (): void => {
    const res = finishNote(sim.session);
    if (!res.ok) {
      setStatus(`노트 한도 초과: ${res.violations.map((v) => v.message).join("; ")}`);
      return;
    }
    props.onCollect(res.note);
    props.onExit();
  };

  const isEdit = props.entry.kind === "existing";

  return (
    <div class="sim-modal" role="dialog" aria-label="시뮬레이터" data-testid="sim-panel">
      <div class="sim-inner" onClick={blurClickedButton}>
        <div class="sim-head">
          <h2>{isEdit ? "노트 이어서 편집" : "시뮬레이터"}</h2>
          <button class="btn" data-testid="sim-exit" onClick={props.onExit}>
            나가기
          </button>
        </div>

        <div class="sim-body">
          <div class="sim-board">
            {/* 공통 HUD(AW-26) — Hold/Next/카운터. 표시 계산은 workHud, 레이아웃 규범은 GameHud. */}
            <GameHud model={workHud(sim.session.work)}>
              <BoardCanvas frame={workFrame(sim.session.work)} onCellPointer={onCellPointer} />
            </GameHud>
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

            <button
              class="btn primary"
              data-testid="sim-finish"
              onClick={doFinish}
              disabled={sim.session.pages.length === 0}
            >
              노트 완성
            </button>
            <p class="hint">
              완성한 노트는 아래 수집함에 모입니다 — 공유는 수집함에서 한 번에 올립니다.
            </p>
            {status && <p class="status" data-testid="sim-status">{status}</p>}
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
        .tool-row { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); }
        .sim-side { display: grid; gap: var(--space-3); align-content: start; }
        .comment-label { display: grid; gap: var(--space-1); }
        textarea { width: 100%; padding: var(--space-2); border: 1px solid var(--color-border);
          border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text); font: inherit; }
        .page-list { display: grid; gap: var(--space-1); font-size: var(--text-sm); padding-left: var(--space-4); }
        .hint { margin: 0; }
        .status { color: var(--color-warn); font-size: var(--text-sm); }
        @media (max-width: 48rem) { .sim-body { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
