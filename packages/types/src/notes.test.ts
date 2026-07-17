import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  notesFileSchema,
  originSchema,
  NOTES_LIMITS,
  NOTE_ID_PATTERN,
  type NotesFile,
  type Note,
  type Origin,
} from "./index.js";

// 구명세 notes-schema §5 전체 예시 — 자구 그대로 (수정 금지)
const specExampleJson = `{
  "schema": "tetorial.notes/1",
  "clientId": "k3XmP9qLwR2v",
  "editKeyHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "author": { "name": "corun" },
  "createdAt": "2026-07-10T04:12:00Z",
  "updatedAt": "2026-07-10T04:31:07Z",
  "notes": [
    {
      "id": "aB3dE5fG",
      "origin": { "type": "replay", "round": 1, "player": 0, "frame": 841 },
      "snapshot": {
        "ruleset": { "preset": "srs+", "spinBonuses": "all-mini+" },
        "board": { "width": 10, "rows": ["JJJGGGGGG_", "J_SSGGGGG_", "__SS______"] },
        "current": "T",
        "hold": "I",
        "holdLocked": false,
        "queue": "LOSZJITSZL",
        "counters": { "b2b": 2, "combo": 0 }
      },
      "pages": [
        {
          "id": "p1Q2w3E4",
          "state": {
            "board": { "width": 10, "rows": ["J_SSGGGGG_", "__SS______"] },
            "current": "L", "hold": "I", "holdLocked": false,
            "queueUsed": 1,
            "counters": { "b2b": 3, "combo": 1 }
          },
          "comment": "여기서 TSD가 가능했음. 좌측 단차를 먼저 보세요"
        },
        {
          "id": "r5T6y7U8",
          "state": {
            "board": { "width": 10, "rows": ["GJ_SSGGGGG", "___SS____G"] },
            "current": "L", "hold": "I", "holdLocked": false,
            "queueUsed": 1,
            "counters": { "b2b": 3, "combo": 1 }
          },
          "comment": "만약 쓰레기가 우측에 한 줄 더 왔다면 이렇게 됐을 것 (셀 그리기)"
        }
      ],
      "createdAt": "2026-07-10T04:12:00Z",
      "updatedAt": "2026-07-10T04:31:07Z"
    }
  ]
}`;

/** 명세 예시를 기반으로 한 유효 파일 (경계 테스트의 출발점) */
function validFile(): NotesFile {
  return notesFileSchema.parse(JSON.parse(specExampleJson));
}

/** validFile을 복제해 mutate를 적용한 뒤 통과 여부를 검사 */
function checkMutated(mutate: (file: NotesFile) => void): boolean {
  const file = structuredClone(validFile());
  mutate(file);
  return notesFileSchema.safeParse(file).success;
}

function firstNote(file: NotesFile): Note {
  const note = file.notes[0];
  if (!note) throw new Error("예시 파일에 노트가 없다");
  return note;
}

/** 예시 노트를 복제해 notes 배열을 n개로 늘린다 (한도 경계 검증용 — W0b-2·M1a-3 공용) */
function growNotes(n: number) {
  return (file: NotesFile) => {
    const proto = firstNote(file);
    file.notes = Array.from({ length: n }, (_, i) => ({
      ...structuredClone(proto),
      id: `n${String(i).padStart(7, "0")}`,
    }));
  };
}

// 타입 레벨 검증: 손 선언 타입(명세 §4 자구)과 zod 추론 타입의 상호 할당성
type MutualExtends<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const notesTypeMatches: MutualExtends<NotesFile, z.infer<typeof notesFileSchema>> = true;

describe("W0b-1 명세 예시 JSON 왕복 (notes-schema §5)", () => {
  it("예시 JSON이 그대로 파싱 통과한다", () => {
    const result = notesFileSchema.safeParse(JSON.parse(specExampleJson));
    expect(result.success).toBe(true);
  });

  it("파싱 결과가 입력과 deep-equal (왕복 무손실)", () => {
    const input: unknown = JSON.parse(specExampleJson);
    expect(notesFileSchema.parse(input)).toEqual(input);
  });

  it("TS 타입과 zod 추론 타입이 상호 할당 가능하다", () => {
    expect(notesTypeMatches).toBe(true);
  });
});

describe("W0b-2 한도 경계 매트릭스 (notes-schema §4·§6)", () => {
  it("notes 10개 통과 / 11개 거부 (M1a 한도 개정)", () => {
    expect(checkMutated(growNotes(10))).toBe(true);
    expect(checkMutated(growNotes(11))).toBe(false);
  });

  it("pages 100개 통과 / 101개 거부 / 0개 거부 (최소 1개)", () => {
    const grow = (n: number) => (file: NotesFile) => {
      const note = firstNote(file);
      const proto = structuredClone(note.pages[0]);
      if (!proto) throw new Error("예시에 페이지가 없다");
      note.pages = Array.from({ length: n }, (_, i) => ({
        ...structuredClone(proto),
        id: `p${String(i).padStart(7, "0")}`,
      }));
    };
    expect(checkMutated(grow(100))).toBe(true);
    expect(checkMutated(grow(101))).toBe(false);
    expect(checkMutated(grow(0))).toBe(false);
  });

  it("comment 500 코드포인트 통과 / 501 거부 (아스트랄 문자로 코드포인트 기준 검증)", () => {
    // "😀"는 1 코드포인트 = UTF-16 2단위. .length 기준이었다면 500개(길이 1000)가 거부됐을 것
    const setComment = (s: string) => (file: NotesFile) => {
      const page = firstNote(file).pages[0];
      if (!page) throw new Error("예시에 페이지가 없다");
      page.comment = s;
    };
    expect(checkMutated(setComment("😀".repeat(500)))).toBe(true);
    expect(checkMutated(setComment("😀".repeat(501)))).toBe(false);
  });

  it("queue 1000자 통과 / 1001자 거부 / 미노 외 문자 거부 / 빈 문자열 통과", () => {
    const setQueue = (q: string) => (file: NotesFile) => {
      const note = firstNote(file);
      note.snapshot.queue = q;
      for (const p of note.pages) p.state.queueUsed = 0;
    };
    expect(checkMutated(setQueue("IJLOSTZ".repeat(142).concat("IJLOST")))).toBe(true); // 1000
    expect(checkMutated(setQueue("I".repeat(1001)))).toBe(false);
    expect(checkMutated(setQueue("IJLX"))).toBe(false);
    expect(checkMutated(setQueue(""))).toBe(true);
  });

  it("board rows 40행 통과 / 41행 거부", () => {
    const setRows = (n: number) => (file: NotesFile) => {
      firstNote(file).snapshot.board.rows = Array.from({ length: n }, () => "G".repeat(10));
    };
    expect(checkMutated(setRows(40))).toBe(true);
    expect(checkMutated(setRows(41))).toBe(false);
  });

  it("행 길이 ≠ width(10) 거부 / 허용 외 문자 거부 / width ≠ 10 거부", () => {
    const setRow = (row: string) => (file: NotesFile) => {
      firstNote(file).snapshot.board.rows = [row];
    };
    expect(checkMutated(setRow("_".repeat(9)))).toBe(false);
    expect(checkMutated(setRow("_".repeat(11)))).toBe(false);
    expect(checkMutated(setRow("X".repeat(10)))).toBe(false);
    expect(
      checkMutated((file) => {
        // width 리터럴 10 위반
        (firstNote(file).snapshot.board as { width: number }).width = 9;
      }),
    ).toBe(false);
  });

  it("queueUsed == queue 길이 통과 / +1 거부 / 음수 거부 (산술 경계 refine)", () => {
    const setUsed = (n: number) => (file: NotesFile) => {
      const page = firstNote(file).pages[0];
      if (!page) throw new Error("예시에 페이지가 없다");
      page.state.queueUsed = n;
    };
    const queueLen = firstNote(validFile()).snapshot.queue.length; // 10
    expect(checkMutated(setUsed(queueLen))).toBe(true);
    expect(checkMutated(setUsed(queueLen + 1))).toBe(false);
    expect(checkMutated(setUsed(-1))).toBe(false);
  });

  it("counters -1 통과 (tetr.io 원값 규약 D-9) / -2 거부 / 소수 거부", () => {
    const setB2b = (n: number) => (file: NotesFile) => {
      firstNote(file).snapshot.counters.b2b = n;
    };
    expect(checkMutated(setB2b(-1))).toBe(true);
    expect(checkMutated(setB2b(-2))).toBe(false);
    expect(checkMutated(setB2b(1.5))).toBe(false);
  });

  it("clientId 12자만 통과 / editKeyHash hex 64자만 통과", () => {
    expect(checkMutated((f) => void (f.clientId = "a".repeat(11)))).toBe(false);
    expect(checkMutated((f) => void (f.clientId = "a".repeat(13)))).toBe(false);
    expect(checkMutated((f) => void (f.clientId = "한글은안된다12"))).toBe(false);
    expect(checkMutated((f) => void (f.editKeyHash = "9f".repeat(31) + "9"))).toBe(false); // 63자
    expect(checkMutated((f) => void (f.editKeyHash = "9f".repeat(32) + "9f"))).toBe(false); // 66자
    expect(checkMutated((f) => void (f.editKeyHash = "9F".repeat(32)))).toBe(false); // 대문자
    expect(checkMutated((f) => void (f.editKeyHash = "zz".repeat(32)))).toBe(false); // 비hex
  });

  it("id는 [A-Za-z0-9_-]{8} / note.id 파일 내 유일 / page.id 노트 내 유일", () => {
    expect(checkMutated((f) => void (firstNote(f).id = "7자리아이디"))).toBe(false);
    expect(
      checkMutated((f) => {
        f.notes = [firstNote(f), structuredClone(firstNote(f))]; // id 중복
      }),
    ).toBe(false);
    expect(
      checkMutated((f) => {
        const note = firstNote(f);
        const page = note.pages[0];
        if (!page) throw new Error("예시에 페이지가 없다");
        note.pages = [page, structuredClone(page)]; // id 중복
      }),
    ).toBe(false);
  });

  it("일시는 ISO 8601 UTC(Z)만 통과", () => {
    expect(checkMutated((f) => void (f.createdAt = "2026-07-10T04:12:00"))).toBe(false);
    expect(checkMutated((f) => void (f.createdAt = "2026-07-10T04:12:00+09:00"))).toBe(false);
    expect(checkMutated((f) => void (f.createdAt = "어제"))).toBe(false);
  });

  it("origin: 미지의 type 거부 / 음수 frame 거부 (note 변형 케이스는 M1c-2로 재배치)", () => {
    expect(
      checkMutated((f) => {
        (firstNote(f) as { origin: unknown }).origin = { type: "fumen", page: 1 };
      }),
    ).toBe(false);
    expect(
      checkMutated((f) => {
        firstNote(f).origin = { type: "replay", round: 0, player: 0, frame: -1 };
      }),
    ).toBe(false);
  });

  it("snapshot.current는 null 불가, page.state.current는 null 허용 (큐 소진)", () => {
    expect(
      checkMutated((f) => {
        (firstNote(f).snapshot as { current: unknown }).current = null;
      }),
    ).toBe(false);
    expect(
      checkMutated((f) => {
        const page = firstNote(f).pages[0];
        if (!page) throw new Error("예시에 페이지가 없다");
        page.state.current = null;
      }),
    ).toBe(true);
  });

  it("ruleset.preset은 srs | srs+만", () => {
    expect(
      checkMutated((f) => {
        (firstNote(f).snapshot.ruleset as { preset: string }).preset = "ars";
      }),
    ).toBe(false);
  });
});

describe("W0b-3 v1 예약 요소 — D 셀·overlays (notes-schema 결정 로그 5)", () => {
  it('"D"(더미 블록) 셀이 포함된 행이 통과한다', () => {
    expect(
      checkMutated((f) => {
        firstNote(f).snapshot.board.rows = ["DDGG______", "__DD______"];
      }),
    ).toBe(true);
  });

  it("overlays.highlights가 통과한다 (_/H 인코딩, 행 길이 = width)", () => {
    const setHighlights = (rows: string[]) => (file: NotesFile) => {
      const page = firstNote(file).pages[0];
      if (!page) throw new Error("예시에 페이지가 없다");
      page.state.overlays = { highlights: rows };
    };
    expect(checkMutated(setHighlights(["HH________", "____HHHH__"]))).toBe(true);
    expect(checkMutated(setHighlights([]))).toBe(true);
    expect(checkMutated(setHighlights(["H_"]))).toBe(false); // 행 길이 위반
    expect(checkMutated(setHighlights(["HX________"]))).toBe(false); // 허용 외 문자
    expect(checkMutated(setHighlights(Array.from({ length: 41 }, () => "H".repeat(10))))).toBe(
      false,
    ); // 40행 초과
  });
});

// ---------------------------------------------------------------------------
// M1a 개정 — 노트 한도 10.
// ---------------------------------------------------------------------------

describe("M1a-3 노트 한도 10 (types-m1a §3)", () => {
  it("M1a-3 notes 10개 파일은 통과하고 11개는 거부된다", () => {
    expect(checkMutated(growNotes(10))).toBe(true);
    expect(checkMutated(growNotes(11))).toBe(false);
  });

  it("M1a-3 NOTES_LIMITS.maxNotesPerReplay === 10이 공개 상수로 노출된다", () => {
    expect(NOTES_LIMITS.maxNotesPerReplay).toBe(10);
    // maxNotes(파일당)는 합산 한도의 따름 상한 — 두 값이 같다 (types-m1a §3)
    expect(NOTES_LIMITS.maxNotes).toBe(NOTES_LIMITS.maxNotesPerReplay);
  });
});

// ---------------------------------------------------------------------------
// M1c 개정 — Origin 리플레이 단일형 확정(#2/S-1 이행) + note id 규격 공개 상수 승격.
// ---------------------------------------------------------------------------

// 타입 레벨 검증: Origin 손 선언 타입(단일형)과 zod 추론 타입의 상호 할당성
const originTypeMatches: MutualExtends<Origin, z.infer<typeof originSchema>> = true;

describe("M1c-1 Origin 단일화 (types-m1c §2)", () => {
  it("M1c-1 유효한 replay origin이 파싱·직렬화 왕복을 통과한다", () => {
    const origin = { type: "replay", round: 1, player: 0, frame: 841 };
    const parsed = originSchema.parse(JSON.parse(JSON.stringify(origin)));
    expect(parsed).toEqual(origin);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(origin);
  });

  it("M1c-1 Origin 타입과 originSchema 추론 타입이 상호 할당 가능하다 (note 변형 부재)", () => {
    expect(originTypeMatches).toBe(true);
  });
});

describe("M1c-2 구형 note origin 거부 (types-m1c §2)", () => {
  const legacyNoteOrigin = {
    type: "note",
    clientId: "k3XmP9qLwR2v",
    noteId: "aB3dE5fG",
    pageId: "p1Q2w3E4",
  };

  it("M1c-2 originSchema가 { type: 'note', … } 입력을 거부한다", () => {
    expect(originSchema.safeParse(legacyNoteOrigin).success).toBe(false);
  });

  it("M1c-2 notesFileSchema가 note origin을 담은 노트를 거부한다", () => {
    expect(
      checkMutated((f) => {
        (firstNote(f) as { origin: unknown }).origin = legacyNoteOrigin;
      }),
    ).toBe(false);
  });
});

describe("M1c-4 note id 규격 공개 상수 (types-m1c §3)", () => {
  it("M1c-4 NOTE_ID_PATTERN이 공개 API로 노출되고 [A-Za-z0-9_-]{8}을 강제한다", () => {
    expect(NOTE_ID_PATTERN).toBeInstanceOf(RegExp);
    expect(NOTE_ID_PATTERN.test("aB3dE5fG")).toBe(true);
    expect(NOTE_ID_PATTERN.test("_-_-_-_-")).toBe(true);
    expect(NOTE_ID_PATTERN.test("aB3dE5f")).toBe(false); // 7자
    expect(NOTE_ID_PATTERN.test("aB3dE5fG9")).toBe(false); // 9자
    expect(NOTE_ID_PATTERN.test("aB3dE5f!")).toBe(false); // 허용 외 문자
    expect(NOTE_ID_PATTERN.test("한글아이디아님")).toBe(false);
  });

  it("M1c-4 내부 idSchema(note.id·page.id)가 동일 규격을 강제한다 (단일 출처)", () => {
    expect(checkMutated((f) => void (firstNote(f).id = "aB3dE5fG"))).toBe(true);
    expect(checkMutated((f) => void (firstNote(f).id = "aB3dE5f"))).toBe(false);
    expect(
      checkMutated((f) => {
        const page = firstNote(f).pages[0];
        if (!page) throw new Error("예시에 페이지가 없다");
        page.id = "8자초과아이디임!";
      }),
    ).toBe(false);
  });
});
