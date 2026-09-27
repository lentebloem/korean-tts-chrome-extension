// IndexedDB cache of generated clips. Shared by the service worker, the
// offscreen player and the options page (all run on the extension origin).

const DB_NAME = 'fish-korean-tts';
const STORE = 'clips';

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('createdAt', 'createdAt');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getClip = (key) => run('readonly', (s) => s.get(key));
export const putClip = (clip) => run('readwrite', (s) => s.put(clip));
export const deleteClip = (key) => run('readwrite', (s) => s.delete(key));
export const clearClips = () => run('readwrite', (s) => s.clear());
export const listClips = () => run('readonly', (s) => s.getAll());

export function normalizeText(text) {
  return (text || '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

// The cache key covers everything that changes the resulting audio, so
// switching voice/model/speed produces a fresh clip instead of a stale one.
export async function cacheKey({ text, voiceId, model, speed }) {
  const payload = JSON.stringify([text, voiceId || '', model || '', Number(speed) || 1]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
