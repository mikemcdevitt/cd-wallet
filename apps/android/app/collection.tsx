import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import type { AlbumSummary, LibraryTrack } from "../src/core/library";
import { useApp } from "../src/data/app-context";
import { usePlayer } from "../src/player/player";
import { AlbumRow, EmptyNote, TrackRow } from "../src/ui/rows";
import { colors, spacing } from "../src/ui/theme";

/** One album's songs, or one artist's albums. */
export default function Collection() {
  const { kind, key, title } = useLocalSearchParams<{ kind: "album" | "artist"; key: string; title: string }>();
  const { session } = useApp();
  const player = usePlayer();
  const router = useRouter();
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);

  useEffect(() => {
    if (!session || !key) return;
    if (kind === "album") void session.library.tracks({ albumKey: key }).then(setTracks);
    else void session.library.albums({ artistKey: key }).then(setAlbums);
  }, [session, kind, key]);

  if (kind === "artist") {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: title ?? "Artist" }} />
        <FlatList
          data={albums}
          keyExtractor={(a) => a.key}
          renderItem={({ item }) => (
            <AlbumRow album={item} onPress={() => router.push({ pathname: "/collection", params: { kind: "album", key: item.key, title: item.album } })} />
          )}
          ListEmptyComponent={<EmptyNote>No albums.</EmptyNote>}
        />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: title ?? "Album" }} />
      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={
          tracks.length ? (
            <Pressable
              onPress={() => void player.playQueue(tracks, 0)}
              accessibilityRole="button"
              style={{ margin: spacing.lg, padding: spacing.md, borderRadius: 8, backgroundColor: colors.accent, alignItems: "center" }}
            >
              <Text style={{ color: colors.bg, fontSize: 16, fontWeight: "600" }}>Play album</Text>
            </Pressable>
          ) : undefined
        }
        renderItem={({ item, index }) => (
          <TrackRow track={item} active={player.current?.id === item.id} onPress={() => void player.playQueue(tracks, index)} />
        )}
        ListEmptyComponent={<EmptyNote>No songs.</EmptyNote>}
      />
    </View>
  );
}
