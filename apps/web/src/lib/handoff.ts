// 홈 → 리플레이 페이지 로컬 파일 핸드오프 (IndexedDB 경유 1회성 전달, 페이지 전환에서 생존).
// 영속 storage 유틸과 별개다(드래프트·설정이 아닌 세션 전환용 임시 값).
//
// sessionStorage는 오리진당 ~5MB(UTF-16이라 char당 2B) 한도라 대용량(~6MB) 리플레이 텍스트에서
// setItem이 QuotaExceededError로 무음 실패했다(W4 결함5 — 드롭이 조용히 안 열림). IndexedDB는
// 한도가 훨씬 크고 문자열/Blob을 효율 저장하므로 대용량을 안전히 넘긴다.
const DB_NAME = "tetorial:handoff";
const STORE = "pending";
const PENDING_KEY = "replay";

export interface PendingReplay {
  filename: string;
  text: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (): void => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error);
  });
}

/** 대기 리플레이를 저장한다(페이지 전환 전). 비영속·IDB 부재 환경에서는 조용히 실패한다. */
export async function stashPendingReplay(pending: PendingReplay): Promise<void> {
  try {
    if (typeof indexedDB === "undefined") return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(pending, PENDING_KEY);
      tx.oncomplete = (): void => resolve();
      tx.onerror = (): void => reject(tx.error);
      tx.onabort = (): void => reject(tx.error);
    });
    db.close();
  } catch {
    /* 비영속 환경 — 무시(핸드오프 실패 시 리플레이 페이지의 파일 입력 사용) */
  }
}

/** 대기 리플레이를 읽고 즉시 삭제한다(1회성). 없으면 null. */
export async function takePendingReplay(): Promise<PendingReplay | null> {
  try {
    if (typeof indexedDB === "undefined") return null;
    const db = await openDb();
    const value = await new Promise<PendingReplay | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const getReq = store.get(PENDING_KEY);
      getReq.onsuccess = (): void => {
        store.delete(PENDING_KEY);
        resolve((getReq.result as PendingReplay | undefined) ?? null);
      };
      getReq.onerror = (): void => reject(getReq.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

/** 공유 링크 또는 gist id 문자열에서 gistId를 추출한다. */
export function extractGistId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // 전체 URL이면 쿼리에서 gist 추출
  const gistMatch = trimmed.match(/[?&]gist=([^&\s]+)/);
  if (gistMatch) return decodeURIComponent(gistMatch[1] ?? "");
  // gist API/웹 URL의 마지막 경로 세그먼트
  const urlMatch = trimmed.match(/gist(?:\.github)?\.com\/(?:[^/]+\/)?([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1] ?? null;
  // 순수 id로 간주 (영숫자만)
  if (/^[A-Za-z0-9]+$/.test(trimmed)) return trimmed;
  return null;
}
