import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { formatDuration } from "../src/core/library";
import { usePlayer } from "../src/player/player";
import { Cover } from "../src/ui/Cover";
import { colors, spacing } from "../src/ui/theme";

function Button({ label, onPress, big, a11y }: { label: string; onPress: () => void; big?: boolean; a11y: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={a11y}>
      <Text style={{ color: colors.text, fontSize: big ? 44 : 30, width: 72, textAlign: "center" }}>{label}</Text>
    </Pressable>
  );
}

export default function PlayerScreen() {
  const p = usePlayer();
  const [barWidth, setBarWidth] = useState(0);
  if (!p.current) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.textDim }}>Nothing is playing.</Text>
      </View>
    );
  }
  const progress = p.durationSec > 0 ? Math.min(1, p.positionSec / p.durationSec) : 0;
  return (
    <View style={{ flex: 1, padding: spacing.xl, alignItems: "center", gap: spacing.lg }}>
      <Cover artHash={p.current.artHash} size={280} label={p.current.album} />
      <View style={{ alignItems: "center", gap: spacing.xs }}>
        <Text numberOfLines={2} style={{ color: colors.text, fontSize: 22, textAlign: "center" }}>
          {p.current.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textDim, fontSize: 16 }}>
          {p.current.artist}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textDim, fontSize: 14 }}>
          {p.current.album}
        </Text>
      </View>

      <View style={{ alignSelf: "stretch", gap: spacing.xs }}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel="Seek"
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          onPress={(e) => {
            // Tap anywhere on the bar to jump there.
            if (barWidth > 0 && p.durationSec > 0) {
              p.seekTo(Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth)) * p.durationSec);
            }
          }}
          style={{ height: 24, justifyContent: "center" }}
        >
          <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: colors.border }}>
            <View style={{ height: 4, borderRadius: 2, width: `${progress * 100}%`, backgroundColor: colors.accent }} />
          </View>
        </Pressable>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.textDim, fontSize: 12 }}>{formatDuration(p.positionSec)}</Text>
          <Text style={{ color: colors.textDim, fontSize: 12 }}>{formatDuration(p.durationSec || p.current.durationSec)}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Button label="⏮" onPress={p.previous} a11y="Previous track" />
        <Button label={p.playing ? "⏸" : "▶"} onPress={p.toggle} big a11y={p.playing ? "Pause" : "Play"} />
        <Button label="⏭" onPress={p.next} a11y="Next track" />
      </View>
      {p.error ? <Text style={{ color: colors.danger, textAlign: "center" }}>{p.error}</Text> : null}
    </View>
  );
}
