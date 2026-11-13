import { RULE_VERSION } from "../simulation/config";
import type { LifeRun } from "../simulation/types";

export interface SavedLife {
  id: string;
  run: LifeRun;
  cursor: number;
  savedAt: string;
}
const DATABASE = "gamex-mbti-lives";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("lives", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("浏览器未允许打开本地档案库，请检查隐私设置。"));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("lives", mode);
    const request = execute(tx.objectStore("lives"));
    tx.oncomplete = () => {
      resolve(request.result);
      db.close();
    };
    tx.onerror = () => {
      reject(new Error("本地档案读写失败，可能是浏览器存储空间不足。"));
      db.close();
    };
    tx.onabort = () => {
      reject(new Error("本地档案写入未完成，请重试。"));
      db.close();
    };
  });
}
export async function loadLives(): Promise<SavedLife[]> {
  const entries = await transaction<SavedLife[]>("readonly", (store) =>
    store.getAll(),
  );
  return entries
    .filter(
      (entry) =>
        entry.run.version === RULE_VERSION &&
        entry.run.snapshots.length === 541,
    )
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export async function saveLife(run: LifeRun, cursor: number): Promise<void> {
  const entries = await loadLives();
  if (entries.length >= 16 && !entries.some((entry) => entry.id === run.id))
    throw new Error("本地档案最多保存十六名人物，请先移除一份档案。");
  await transaction("readwrite", (store) =>
    store.put({
      id: run.id,
      run,
      cursor,
      savedAt: new Date().toISOString(),
    } satisfies SavedLife),
  );
}
export async function deleteLife(id: string): Promise<void> {
  await transaction("readwrite", (store) => store.delete(id));
}
