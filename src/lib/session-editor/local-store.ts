import { parseBody } from '@/lib/session-body';

import type { LocalRecord, LocalStore } from './autosave';
import type { SessionSnapshot } from './snapshot';

/*
 * Cópia local do rascunho no IndexedDB, a reserva para quando o iOS descarta o app em segundo
 * plano. É só uma reserva: a fonte da verdade é o servidor. Toda função aqui engole a falha (modo
 * privado, cota, navegador sem IndexedDB) e devolve "não há cópia": o editor continua funcionando.
 *
 * A chave é `session:<id>` ou, para uma sessão que ainda não virou linha no banco, `new:<bookId>`.
 */

const DB_NAME = 'entre-capitulos-editor';
const STORE = 'drafts';
const VERSION = 1;

export const sessionKey = (id: string) => `session:${id}`;
export const newSessionKey = (bookId: string) => `new:${bookId}`;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('indexeddb'));
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function isRecord(value: unknown): value is LocalRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<LocalRecord>;
  return (
    (v.baseUpdatedAt === null || typeof v.baseUpdatedAt === 'string') &&
    typeof v.dirty === 'boolean' &&
    typeof v.snapshot === 'object' &&
    v.snapshot !== null
  );
}

/** Lê a cópia; o corpo passa pelo esquema de novo (a cópia pode ser de uma versão antiga). */
export async function readLocal(key: string): Promise<LocalRecord | null> {
  try {
    const value = await withStore('readonly', (store) => store.get(key));
    if (!isRecord(value)) return null;
    const body = parseBody(value.snapshot.body);
    if (!body.ok) return null;
    const snapshot: SessionSnapshot = { ...value.snapshot, body: body.doc };
    return { baseUpdatedAt: value.baseUpdatedAt, dirty: value.dirty, snapshot };
  } catch {
    return null;
  }
}

/** A chave pode mudar (sessão nova que vira linha no banco): `rekey` troca sem perder a cópia. */
export class IndexedDbStore implements LocalStore {
  constructor(public key: string) {}

  async write(record: LocalRecord): Promise<void> {
    await withStore('readwrite', (store) =>
      store.put({ ...record, savedAt: Date.now() }, this.key),
    );
  }

  async remove(): Promise<void> {
    await withStore('readwrite', (store) => store.delete(this.key));
  }

  rekey(key: string): void {
    this.key = key;
  }
}

/** Apaga uma cópia por chave (a da sessão nova, depois de criada). Nunca lança. */
export async function removeLocal(key: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(key));
  } catch {
    // sem IndexedDB: nada a apagar
  }
}
