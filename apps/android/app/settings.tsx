import { Alert, Pressable, Text, View } from "react-native";
import { useApp } from "../src/data/app-context";
import { usePlayer } from "../src/player/player";
import { colors, spacing } from "../src/ui/theme";

export default function Settings() {
  const { session, syncNow, unpair, sync } = useApp();
  const player = usePlayer();
  const button = { padding: spacing.md, borderRadius: 8, backgroundColor: colors.surface, marginTop: spacing.md } as const;
  return (
    <View style={{ flex: 1, padding: spacing.lg }}>
      <Text style={{ color: colors.textDim }}>Connected to</Text>
      <Text selectable style={{ color: colors.text, marginBottom: spacing.lg }}>
        {session?.credentials.apiUrl}
      </Text>
      <Pressable style={button} onPress={() => void syncNow()} accessibilityRole="button">
        <Text style={{ color: colors.text }}>{sync.status === "syncing" ? "Updating…" : "Update library now"}</Text>
      </Pressable>
      <Pressable
        style={button}
        accessibilityRole="button"
        onPress={() =>
          Alert.alert("Unpair this phone?", "The downloaded library list is removed from this phone. Your music in AWS is untouched, and you can pair again any time.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Unpair",
              style: "destructive",
              onPress: () => {
                player.stop();
                void unpair();
              },
            },
          ])
        }
      >
        <Text style={{ color: colors.danger }}>Unpair this phone</Text>
      </Pressable>
    </View>
  );
}
