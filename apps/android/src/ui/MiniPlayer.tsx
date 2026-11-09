import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { usePlayer } from "../player/player";
import { Cover } from "./Cover";
import { colors, spacing } from "./theme";

export function MiniPlayer() {
  const p = usePlayer();
  const router = useRouter();
  if (!p.current) return null;
  const progress = p.durationSec > 0 ? Math.min(1, p.positionSec / p.durationSec) : 0;
  return (
    <Pressable
      onPress={() => router.push("/player")}
      accessibilityRole="button"
      accessibilityLabel={`Now playing ${p.current.title}. Open player`}
      style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}
    >
      <View style={{ height: 2, backgroundColor: colors.border }}>
        <View style={{ height: 2, width: `${progress * 100}%`, backgroundColor: colors.accent }} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md }}>
        <Cover artHash={p.current.artHash} size={40} label={p.current.album} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15 }}>
            {p.current.title}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.textDim, fontSize: 12 }}>
            {p.current.artist}
          </Text>
        </View>
        <Pressable onPress={p.toggle} hitSlop={12} accessibilityRole="button" accessibilityLabel={p.playing ? "Pause" : "Play"}>
          <Text style={{ color: colors.text, fontSize: 26, width: 36, textAlign: "center" }}>{p.playing ? "❚❚" : "▶"}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}
