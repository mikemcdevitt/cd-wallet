import { createAudioPlaylist, setAudioModeAsync, type AudioPlaylist } from "expo-audio";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LibraryTrack } from "../core/library";
import { initialWindow, tracksToLoadNext } from "../core/queue";
import { useApp } from "../data/app-context";

export interface PlayerState {
  queue: LibraryTrack[];
  /** Position in `queue` of the current track, or -1 when nothing is loaded. */
  index: number;
  current?: LibraryTrack;
  playing: boolean;
  buffering: boolean;
  positionSec: number;
  durationSec: number;
  error?: string;
}

interface PlayerApi extends PlayerState {
  playQueue(tracks: LibraryTrack[], startIndex: number): Promise<void>;
  toggle(): void;
  next(): void;
  previous(): void;
  seekTo(seconds: number): void;
  stop(): void;
}

const EMPTY: PlayerState = { queue: [], index: -1, playing: false, buffering: false, positionSec: 0, durationSec: 0 };
const Ctx = createContext<PlayerApi | undefined>(undefined);

export function usePlayer(): PlayerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlayer must be used inside PlayerProvider");
  return v;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { session } = useApp();
  const [state, setState] = useState<PlayerState>(EMPTY);
  const playlist = useRef<AudioPlaylist | undefined>(undefined);
  // Which part of the queue the playlist currently holds.
  const window = useRef({ start: 0, loaded: 0 });
  const queueRef = useRef<LibraryTrack[]>([]);
  const extending = useRef(false);

  useEffect(() => {
    // doNotMix is required for the notification/lock-screen controls.
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
  }, []);

  const teardown = useCallback(() => {
    const p = playlist.current;
    playlist.current = undefined;
    if (p) {
      try {
        p.clearLockScreenControls();
        p.pause();
        p.destroy?.();
      } catch {
        // already gone
      }
    }
  }, []);

  useEffect(() => teardown, [teardown]);
  // Signing out must stop the music.
  useEffect(() => {
    if (!session) {
      teardown();
      queueRef.current = [];
      setState(EMPTY);
    }
  }, [session, teardown]);

  const publishLockScreen = useCallback((p: AudioPlaylist, track: LibraryTrack) => {
    p.setActiveForLockScreen(true, { title: track.title, artist: track.artist, albumTitle: track.album }, { showNextTrack: true, showPreviousTrack: true });
  }, []);

  const extendIfNeeded = useCallback(
    async (p: AudioPlaylist) => {
      if (!session || extending.current) return;
      const w = window.current;
      const queue = queueRef.current;
      const count = tracksToLoadNext({ queueLength: queue.length, windowStart: w.start, loadedCount: w.loaded, playingOffset: p.currentIndex });
      if (!count) return;
      extending.current = true;
      try {
        const batch = queue.slice(w.start + w.loaded, w.start + w.loaded + count);
        const urls = await session.urls.resolve(batch.map((t) => t.id));
        if (playlist.current !== p) return; // queue was replaced meanwhile
        urls.forEach((uri) => p.add({ uri }));
        w.loaded += batch.length;
      } catch {
        // try again on the next track change
      } finally {
        extending.current = false;
      }
    },
    [session],
  );

  const playQueue = useCallback(
    async (tracks: LibraryTrack[], startIndex: number) => {
      if (!session || tracks.length === 0) return;
      teardown();
      queueRef.current = tracks;
      const { start, end } = initialWindow(tracks.length, startIndex);
      setState({ ...EMPTY, queue: tracks, index: start, current: tracks[start], buffering: true });
      try {
        const urls = await session.urls.resolve(tracks.slice(start, end).map((t) => t.id));
        const p = createAudioPlaylist({ sources: urls.map((uri) => ({ uri })), updateInterval: 500, loop: "none" });
        playlist.current = p;
        window.current = { start, loaded: urls.length };
        p.addListener("playlistStatusUpdate", (s) => {
          if (playlist.current !== p) return;
          const index = window.current.start + s.currentIndex;
          const current = queueRef.current[index];
          setState((prev) => ({
            ...prev,
            index,
            current,
            playing: s.playing,
            buffering: s.isBuffering,
            positionSec: s.currentTime,
            durationSec: s.duration,
          }));
        });
        p.addListener("trackChanged", ({ currentIndex }) => {
          if (playlist.current !== p) return;
          const track = queueRef.current[window.current.start + currentIndex];
          if (track) publishLockScreen(p, track);
          void extendIfNeeded(p);
        });
        const first = tracks[start];
        if (first) publishLockScreen(p, first);
        p.play();
      } catch (err) {
        setState((prev) => ({ ...prev, buffering: false, error: err instanceof Error ? err.message : String(err) }));
      }
    },
    [session, teardown, publishLockScreen, extendIfNeeded],
  );

  const api = useMemo<PlayerApi>(
    () => ({
      ...state,
      playQueue,
      toggle: () => {
        const p = playlist.current;
        if (p) (p.playing ? p.pause() : p.play());
      },
      next: () => playlist.current?.next(),
      previous: () => {
        const p = playlist.current;
        if (!p) return;
        // Like most players: restart the track if we're past the first few seconds.
        if (p.currentTime > 3 || p.currentIndex === 0) void p.seekTo(0);
        else p.previous();
      },
      seekTo: (s) => void playlist.current?.seekTo(s),
      stop: () => {
        teardown();
        queueRef.current = [];
        setState(EMPTY);
      },
    }),
    [state, playQueue, teardown],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
