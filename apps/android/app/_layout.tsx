import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { AppProvider, useApp } from "../src/data/app-context";
import { PlayerProvider } from "../src/player/player";
import { MiniPlayer } from "../src/ui/MiniPlayer";
import { colors } from "../src/ui/theme";

function Gate() {
  const { phase } = useApp();
  const router = useRouter();
  const segments = useSegments();
  const onPair = segments[0] === "pair";

  useEffect(() => {
    if (phase === "unpaired" && !onPair) router.replace("/pair");
    if (phase === "ready" && onPair) router.replace("/");
  }, [phase, onPair, router]);

  if (phase === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "CD Wallet" }} />
        <Stack.Screen name="pair" options={{ title: "Pair this phone", headerBackVisible: false }} />
        <Stack.Screen name="collection" options={{ title: "" }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
        <Stack.Screen name="player" options={{ title: "Now playing", presentation: "modal" }} />
      </Stack>
      {phase === "ready" ? <MiniPlayer /> : null}
      <StatusBar style="light" />
    </View>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <PlayerProvider>
        <Gate />
      </PlayerProvider>
    </AppProvider>
  );
}
