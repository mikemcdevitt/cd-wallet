import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createApiClient, isAuthRevoked, type ApiClient } from "../core/api-client";
import {
  claimAndStore,
  clearCredentials,
  loadCredentials,
  type Credentials,
  type PairingInput,
} from "../core/pairing-flow";
import { SqlLibrary } from "../core/sql-library";
import { StreamUrlResolver } from "../core/stream-urls";
import { syncLibrary } from "../core/sync";
import { createArtCache, deleteLibraryDb, openLibraryDb, secretStore, type ArtCache } from "./platform";

export interface Session {
  credentials: Credentials;
  client: ApiClient;
  library: SqlLibrary;
  urls: StreamUrlResolver;
  art: ArtCache;
}

export type SyncState = { status: "idle" | "syncing" } | { status: "error"; message: string };

interface AppContextValue {
  /** "loading" until the keystore has been read. */
  phase: "loading" | "unpaired" | "ready";
  session?: Session;
  sync: SyncState;
  /** Bumps whenever the local library changed, so lists know to reload. */
  libraryRevision: number;
  pair(input: PairingInput, deviceName: string): Promise<void>;
  unpair(): Promise<void>;
  syncNow(): Promise<void>;
}

const Ctx = createContext<AppContextValue | undefined>(undefined);

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}

export function useSession(): Session {
  const { session } = useApp();
  if (!session) throw new Error("Not paired");
  return session;
}

async function buildSession(credentials: Credentials): Promise<Session> {
  const client = createApiClient({ apiUrl: credentials.apiUrl, token: credentials.deviceToken });
  const library = await SqlLibrary.open(await openLibraryDb());
  return { credentials, client, library, urls: new StreamUrlResolver(client), art: createArtCache(client) };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AppContextValue["phase"]>("loading");
  const [session, setSession] = useState<Session>();
  const [sync, setSync] = useState<SyncState>({ status: "idle" });
  const [libraryRevision, setRevision] = useState(0);
  const syncing = useRef(false);

  useEffect(() => {
    (async () => {
      const credentials = await loadCredentials(secretStore);
      if (!credentials) return setPhase("unpaired");
      setSession(await buildSession(credentials));
      setPhase("ready");
    })().catch(() => setPhase("unpaired"));
  }, []);

  const unpair = useCallback(async () => {
    session?.art.clear();
    await clearCredentials(secretStore);
    await deleteLibraryDb().catch(() => undefined);
    setSession(undefined);
    setPhase("unpaired");
  }, [session]);

  const syncNow = useCallback(async () => {
    if (!session || syncing.current) return;
    syncing.current = true;
    setSync({ status: "syncing" });
    try {
      await syncLibrary(session.client, session.library, () => setRevision((r) => r + 1));
      setRevision((r) => r + 1);
      setSync({ status: "idle" });
    } catch (err) {
      if (isAuthRevoked(err)) {
        await unpair();
        return;
      }
      setSync({ status: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      syncing.current = false;
    }
  }, [session, unpair]);

  // Sync whenever the app opens or a new session starts.
  useEffect(() => {
    if (phase === "ready") void syncNow();
  }, [phase, syncNow]);

  const pair = useCallback(async (input: PairingInput, deviceName: string) => {
    const credentials = await claimAndStore(input, deviceName, secretStore);
    setSession(await buildSession(credentials));
    setPhase("ready");
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({ phase, session, sync, libraryRevision, pair, unpair, syncNow }),
    [phase, session, sync, libraryRevision, pair, unpair, syncNow],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
