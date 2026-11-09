import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import type { AlbumSummary, ArtistSummary, LibraryTrack } from "../src/core/library";
import { useApp } from "../src/data/app-context";
import { usePlayer } from "../src/player/player";
import { AlbumRow, ArtistRow, EmptyNote, TrackRow } from "../src/ui/rows";
import { colors, spacing } from "../src/ui/theme";

type Tab = "songs" | "albums" | "artists";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "songs", label: "Songs" },
  { id: "albums", label: "Albums" },
  { id: "artists", label: "Artists" },
];

export default function Library() {
  const { session, sync, syncNow, libraryRevision } = useApp();
  const player = usePlayer();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("albums");
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [total, setTotal] = useState<number>();

  useEffect(() => {
    if (!session) return;
    let alive = true;
    const q = query.trim();
    const timer = setTimeout(async () => {
      const lib = session.library;
      const [count, data] = await Promise.all([
        lib.count(),
        tab === "songs" ? lib.tracks({ query: q }) : tab === "albums" ? lib.albums({ query: q }) : lib.artists({ query: q }),
      ]);
      if (!alive) return;
      setTotal(count);
      if (tab === "songs") setTracks(data as LibraryTrack[]);
      else if (tab === "albums") setAlbums(data as AlbumSummary[]);
      else setArtists(data as ArtistSummary[]);
    }, 120);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [session, tab, query, libraryRevision]);

  const open = useCallback(
    (kind: "album" | "artist", key: string, title: string) => router.push({ pathname: "/collection", params: { kind, key, title } }),
    [router],
  );

  const refreshing = sync.status === "syncing";
  const empty =
    total === 0 ? (refreshing ? "Loading your library…" : "Your library is empty. Import some music with the cdwallet command on your computer.") : "Nothing matches that search.";

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push("/settings")} hitSlop={12} accessibilityRole="button" accessibilityLabel="Settings">
              <Text style={{ color: colors.text, fontSize: 22 }}>⚙</Text>
            </Pressable>
          ),
        }}
      />
      <View style={{ padding: spacing.md, gap: spacing.md }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search songs, artists, albums"
          placeholderTextColor={colors.textDim}
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={{ backgroundColor: colors.surface, color: colors.text, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16 }}
        />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {TABS.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.id }}
              style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 16, backgroundColor: tab === t.id ? colors.accent : colors.surface }}
            >
              <Text style={{ color: tab === t.id ? colors.bg : colors.text }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        {sync.status === "error" ? (
          <Text style={{ color: colors.danger }}>Couldn't update your library: {sync.message}. Pull down to try again.</Text>
        ) : null}
      </View>
      {tab === "songs" ? (
        <FlatList
          data={tracks}
          keyExtractor={(t) => t.id}
          renderItem={({ item, index }) => (
            <TrackRow track={item} active={player.current?.id === item.id} onPress={() => void player.playQueue(tracks, index)} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void syncNow()} tintColor={colors.accent} />}
          ListEmptyComponent={<EmptyNote>{empty}</EmptyNote>}
          keyboardShouldPersistTaps="handled"
        />
      ) : tab === "albums" ? (
        <FlatList
          data={albums}
          keyExtractor={(a) => a.key}
          renderItem={({ item }) => <AlbumRow album={item} onPress={() => open("album", item.key, item.album)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void syncNow()} tintColor={colors.accent} />}
          ListEmptyComponent={<EmptyNote>{empty}</EmptyNote>}
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <FlatList
          data={artists}
          keyExtractor={(a) => a.key}
          renderItem={({ item }) => <ArtistRow artist={item} onPress={() => open("artist", item.key, item.artist)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void syncNow()} tintColor={colors.accent} />}
          ListEmptyComponent={<EmptyNote>{empty}</EmptyNote>}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}
