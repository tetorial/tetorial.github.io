// 페이지 fork 진입 결정 (m6c-page-fork §3 — AW-41). NoteViewer의 "이 페이지에서 시뮬레이션"이
// 이 순수 판정으로 진입 여부를 정한다 — UI 무관(프레임워크 비종속), ReplayIsland가 결과를 소비한다.
//
// fork = 참조가 아니라 복사(D-8). deriveSnapshotFromPage(@tetorial/sim)를 현 형상 그대로 소비해
// 원본 노트를 무수정으로 두고, 파생 스냅샷·origin(원본 노트 origin의 깊은 복사)으로 새 노트 저작
// 세션을 연다. 노트 id는 웹이 CSPRNG로 주입하므로(D-20) 여기서는 다루지 않는다 — createSimulator 몫.
import { deriveSnapshotFromPage } from "@tetorial/sim";
import type { Note } from "@tetorial/types";
import { noteLimitReason } from "./note-limit.js";
import type { SimEntry } from "../components/SimulatorPanel.tsx";

/** queue-exhausted(진입 페이지의 current === null) 인라인 안내 문구(AW-22 — alert·모달 금지). */
export const FORK_QUEUE_EXHAUSTED_NOTICE =
  "이 페이지는 넥스트 큐를 모두 소진해(다음 미노 없음) 시뮬레이션을 시작할 수 없습니다.";

/** fork 진입에 성공한 SimEntry(신규 노트) — snapshot·origin은 파생 복사분이다. */
export type ForkEntry = Extract<SimEntry, { kind: "fork" }>;

/**
 * fork 진입 계획.
 *   enter   — 파생 성공. entry로 새 노트 저작 세션을 연다.
 *   blocked — 한도 도달 또는 queue-exhausted. reason은 인라인 안내 문구(진입하지 않는다).
 */
export type ForkOutcome =
  | { kind: "enter"; entry: ForkEntry }
  | { kind: "blocked"; reason: string };

/**
 * 노트 페이지에서 fork 진입을 계획한다(AW-41). 내·타인 노트 모두 대상 — 타인 노트에서 시작하는
 * 것이 fork의 본질이다(D-8). 새 노트 생성이므로 노트 생성 한도 차단이 분기 진입과 동일하게 적용된다
 * (한도 도달이 우선 — 큐 상태와 무관하게 새 노트를 만들 수 없다). 한도 통과 후 파생을 시도한다.
 */
export function planFork(
  note: Note,
  pageId: string,
  notesFiles: readonly { notes: readonly unknown[] }[],
): ForkOutcome {
  const limit = noteLimitReason(notesFiles);
  if (limit !== null) return { kind: "blocked", reason: limit };

  const derived = deriveSnapshotFromPage(note, pageId);
  if ("error" in derived) return { kind: "blocked", reason: FORK_QUEUE_EXHAUSTED_NOTICE };

  return { kind: "enter", entry: { kind: "fork", snapshot: derived.snapshot, origin: derived.origin } };
}
