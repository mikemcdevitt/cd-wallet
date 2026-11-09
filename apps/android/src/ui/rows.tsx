import { Pressable, Text, View } from "react-native";
import { formatDuration, type AlbumSummary, type ArtistSummary, type LibraryTrack } from "../core/library";
import { Cover } from "./Cover";
import { colors, spacing } from "./theme";

const row = { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm } as const;

export function TrackRow({ track, onPress, active }: { track: LibraryTrack; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={row} accessibilityRole="button" accessibilityLabel={`Play ${track.title} by ${track.artist}`}>
      <Cover artHash={track.artHash} size={44} label={track.album} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: active ? colors.accent : colors.text, fontSize: 16 }}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textDim, fontSize: 13 }}>
          {track.artist} · {track.album}
        </Text>
      </View>
      <Text style={{ color: colors.textDim, fontSize: 13 }}>{formatDuration(track.durationSec)}</Text>
    </Pressable>
  );
}

export function AlbumRow({ album, onPress }: { album: AlbumSummary; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={row} accessibilityRole="button">
      <Cover artHash={album.artHash} size={56} label={album.album} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16 }}>
          {album.album}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textDim, fontSize: 13 }}>
          {album.artist}
          {album.year ? ` · ${album.year}` : ""} · {album.trackCount} {album.trackCount === 1 ? "song" : "songs"}
        </Text>
      </View>
    </Pressable>
  );
}

export function ArtistRow({ artist, onPress }: { artist: ArtistSummary; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={row} accessibilityRole="button">
      <Cover size={44} label={artist.artist} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16 }}>
          {artist.artist}
        </Text>
        <Text style={{ color: colors.textDim, fontSize: 13 }}>
          {artist.albumCount} {artist.albumCount === 1 ? "album" : "albums"} · {artist.trackCount} songs
        </Text>
      </View>
    </Pressable>
  );
}

export function EmptyNote({ children }: { children: string }) {
  return <Text style={{ color: colors.textDim, textAlign: "center", padding: spacing.xl, fontSize: 15 }}>{children}</Text>;
}
