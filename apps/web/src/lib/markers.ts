// 타임라인 노트 마커 배치·클러스터링 (apps-web §3-C, AW-10).
//
// 로드된 모든 노트 파일의 각 노트를 origin.frame 위치에 마커로 표시하되 현재 라운드·플레이어
// 것만 대상으로 한다. ±60프레임 내 다수 마커는 개수 배지 클러스터로 묶는다.
import type { Note } from "@tetorial/types";

/** 한 노트 파일(notes-<clientId>.json) 참조 — clientId와 파싱된 노트 목록. */
export interface NoteFileRef {
  clientId: string;
  authorName?: string;
  notes: Note[];
}

/** 타임라인 마커 1개(replay 진입 노트만). */
export interface NoteMarker {
  clientId: string;
  noteId: string;
  frame: number; // origin.frame (doc 내부 재생 프레임)
  authorName?: string;
  firstComment?: string; // 첫 페이지 주석 미리보기(팝오버)
}

/** 마커 클러스터(±threshold 내 마커 묶음). markers.length === 1이면 단일 마커. */
export interface MarkerCluster {
  frame: number; // 표시 위치(묶인 마커 프레임의 평균, 반올림)
  markers: NoteMarker[];
}

/** 현재 (원본 라운드, 플레이어)에 해당하는 replay 진입 노트만 마커로 수집(프레임 오름차순). */
export function collectMarkers(
  files: readonly NoteFileRef[],
  target: { round: number; player: number },
): NoteMarker[] {
  const markers: NoteMarker[] = [];
  for (const file of files) {
    for (const note of file.notes) {
      const o = note.origin;
      if (o.type !== "replay") continue; // note 진입(다른 노트 페이지)은 타임라인 마커 대상 아님
      if (o.round !== target.round || o.player !== target.player) continue;
      markers.push({
        clientId: file.clientId,
        noteId: note.id,
        frame: o.frame,
        authorName: file.authorName,
        firstComment: note.pages[0]?.comment,
      });
    }
  }
  markers.sort((a, b) => a.frame - b.frame || cmp(a.clientId, b.clientId) || cmp(a.noteId, b.noteId));
  return markers;
}

/**
 * 여러 플레이어(양보드 재생 — M6-B AW-40)의 replay 진입 노트를 한 타임라인에 모은다.
 * 각 플레이어는 자기 origin.player로 필터되므로(collectMarkers), 스왑 상태와 무관하게 노트는
 * 항상 실제 플레이어 인덱스 기준으로 귀속된다 — 마커·사이드바는 한 벌이되 어느 보드의 노트든
 * 깨지지 않는다(명세 §3·§4). 합친 뒤 프레임·clientId·noteId 순으로 재정렬해 클러스터 전제를 만족한다.
 */
export function collectMarkersForPlayers(
  files: readonly NoteFileRef[],
  round: number,
  players: readonly number[],
): NoteMarker[] {
  const all = players.flatMap((player) => collectMarkers(files, { round, player }));
  all.sort((a, b) => a.frame - b.frame || cmp(a.clientId, b.clientId) || cmp(a.noteId, b.noteId));
  return all;
}

/**
 * 인접 마커 간 프레임 간격이 threshold(기본 60) 이하면 같은 클러스터로 묶는다.
 * 정렬된 마커를 전제로 하며, 클러스터 표시 프레임은 구성 마커 프레임의 평균(반올림)이다.
 */
export function clusterMarkers(
  markers: readonly NoteMarker[],
  threshold = 60,
): MarkerCluster[] {
  const clusters: MarkerCluster[] = [];
  let current: NoteMarker[] = [];
  let lastFrame = 0;
  for (const m of markers) {
    if (current.length === 0 || m.frame - lastFrame <= threshold) {
      current.push(m);
    } else {
      clusters.push(finishCluster(current));
      current = [m];
    }
    lastFrame = m.frame;
  }
  if (current.length > 0) clusters.push(finishCluster(current));
  return clusters;
}

/** 프레임 → 타임라인 비율(0~1, 클램프). 스크러버 위 마커 위치 산출용. */
export function markerRatio(frame: number, totalFrames: number): number {
  if (totalFrames <= 0) return 0;
  return Math.min(1, Math.max(0, frame / totalFrames));
}

/** 마커 1개의 표시 라벨(드롭다운 항목·접근성 라벨) — 첫 페이지 주석 우선, 없으면 noteId (AW-43·44). */
export function markerLabel(m: NoteMarker): string {
  return m.firstComment ?? m.noteId;
}

/**
 * 클러스터의 상호작용 모드(AW-44) — 노트 1개는 클릭 즉시 열기(`single`), 2개 이상은 호버/포커스
 * 드롭다운으로 선택 열기(`dropdown`). **데이터 계산이 아니라 표시·상호작용 결정만** 한다
 * (명세 §1 — clusterMarkers·markerRatio의 의미론은 불변).
 */
export type ClusterInteraction =
  | { readonly mode: "single"; readonly marker: NoteMarker }
  | { readonly mode: "dropdown"; readonly items: readonly NoteMarker[] };

export function clusterInteraction(cluster: MarkerCluster): ClusterInteraction {
  return cluster.markers.length > 1
    ? { mode: "dropdown", items: cluster.markers }
    : { mode: "single", marker: cluster.markers[0]! };
}

function finishCluster(markers: NoteMarker[]): MarkerCluster {
  const sum = markers.reduce((acc, m) => acc + m.frame, 0);
  return { frame: Math.round(sum / markers.length), markers: [...markers] };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
