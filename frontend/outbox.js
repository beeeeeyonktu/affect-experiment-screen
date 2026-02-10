const DB_NAME = "affect_experiment";
const DB_VERSION = 1;
const STORE = "outbox";

let dbPromise;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.createObjectStore(STORE, {
        keyPath: ["session_id", "run_id", "client_event_seq"]
      });
      store.createIndex("by_sent", "sent");
      store.createIndex("by_session", "session_id");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const done = () => resolve(undefined);
    t.oncomplete = done;
    t.onerror = () => reject(t.error);
    fn(store, resolve, reject);
  });
}

export async function putOutboxEvent(event) {
  if (!event) return;
  if (typeof event.session_id !== "string" || event.session_id.length === 0) return;
  if (typeof event.run_id !== "string" || event.run_id.length === 0) return;
  if (typeof event.client_event_seq !== "number" || !Number.isFinite(event.client_event_seq)) return;

  await tx("readwrite", (store) => {
    store.put({ ...event, sent: 0 });
  });
}

export async function getUnsentEvents(session_id, limit = 50) {
  const items = [];
  await tx("readonly", (store, resolve) => {
    const idx = store.index("by_sent");
    const req = idx.openCursor(IDBKeyRange.only(0));
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur || items.length >= limit) return resolve(items);
      const row = cur.value;
      if (row.session_id === session_id) items.push(row);
      cur.continue();
    };
  });
  return items.sort((a, b) => a.client_event_seq - b.client_event_seq);
}

export async function markSent(session_id, run_id, seqs) {
  const seqSet = new Set(seqs);
  await tx("readwrite", (store, resolve) => {
    const range = IDBKeyRange.bound([session_id, run_id, 0], [session_id, run_id, Number.MAX_SAFE_INTEGER]);
    const req = store.openCursor(range);
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(undefined);
      const row = cur.value;
      if (seqSet.has(row.client_event_seq)) {
        store.delete(cur.primaryKey);
      }
      cur.continue();
    };
  });
}
