// 테스트 전용 헬퍼 — 유효한 Snapshot·NotesFile·Response를 손으로 조립한다(fixture 비의존).
// 공개 API가 아니다(이 파일은 apps/web 내부 테스트 보조).
import type { NotesFile, Note, Snapshot } from "@tetorial/types";

export function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    ruleset: { preset: "srs" },
    board: { width: 10, rows: [] },
    current: "T",
    hold: null,
    holdLocked: false,
    queue: "IJLOSTZIJLOSTZ",
    counters: { b2b: -1, combo: -1 },
    ...overrides,
  };
}

export function makeNote(id: string, frame: number, comment?: string): Note {
  return {
    id,
    origin: { type: "replay", round: 0, player: 0, frame },
    snapshot: makeSnapshot(),
    pages: [
      {
        id: `${id}pg`.slice(0, 8).padEnd(8, "0"),
        state: {
          board: { width: 10, rows: ["G_________"] },
          current: "T",
          hold: null,
          holdLocked: false,
          queueUsed: 0,
          counters: { b2b: -1, combo: -1 },
        },
        ...(comment ? { comment } : {}),
      },
    ],
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  };
}

export function makeNotesFile(clientId: string, notes: Note[], authorName?: string): NotesFile {
  return {
    schema: "tetorial.notes/1",
    clientId,
    editKeyHash: "0".repeat(64),
    ...(authorName ? { author: { name: authorName } } : {}),
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    notes,
  };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}
