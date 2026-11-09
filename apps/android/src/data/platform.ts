import { Directory, File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import type { ApiClient } from "../core/api-client";
import type { SecretStore } from "../core/pairing-flow";
import type { SqlDb } from "../core/sql-library";

/** Credentials live in the Android keystore. */
export const secretStore: SecretStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
};

/** The on-phone library index, a SQLite file the app can rebuild from the server at any time. */
export async function openLibraryDb(): Promise<SqlDb> {
  const db = await SQLite.openDatabaseAsync("cdwallet-library.db");
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => void (await db.runAsync(sql, params)),
    all: <T>(sql: string, params: Array<string | number | null> = []) => db.getAllAsync<T>(sql, params),
    transaction: (fn) => db.withTransactionAsync(fn),
  };
}

export async function deleteLibraryDb(): Promise<void> {
  await SQLite.deleteDatabaseAsync("cdwallet-library.db");
}

/**
 * Cover art is fetched once per image and kept in the app's cache folder. The server answers
 * with a redirect to a signed link, so the token is sent only to our own API.
 */
export function createArtCache(client: Pick<ApiClient, "artUrl" | "authHeaders">) {
  const dir = new Directory(Paths.cache, "art");
  const inFlight = new Map<string, Promise<string | undefined>>();

  async function load(hash: string): Promise<string | undefined> {
    const file = new File(dir, `${hash}.jpg`);
    if (file.exists) return file.uri;
    try {
      dir.create({ idempotent: true, intermediates: true });
      const saved = await File.downloadFileAsync(client.artUrl(hash), file, { headers: client.authHeaders(), idempotent: true });
      return saved.uri;
    } catch {
      return undefined; // no cover is not an error worth showing
    }
  }

  return {
    get(hash: string): Promise<string | undefined> {
      let p = inFlight.get(hash);
      if (!p) {
        p = load(hash).finally(() => inFlight.delete(hash));
        inFlight.set(hash, p);
      }
      return p;
    },
    clear() {
      try {
        if (dir.exists) dir.delete();
      } catch {
        // best effort
      }
    },
  };
}

export type ArtCache = ReturnType<typeof createArtCache>;
