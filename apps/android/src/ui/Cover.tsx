import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { useApp } from "../data/app-context";
import { colors } from "./theme";

/** Album art if the server has it, otherwise a plain tile with the first letter. */
export function Cover({ artHash, size, label }: { artHash?: string; size: number; label?: string }) {
  const { session } = useApp();
  const [uri, setUri] = useState<string>();

  useEffect(() => {
    let alive = true;
    setUri(undefined);
    if (artHash && session) void session.art.get(artHash).then((u) => alive && setUri(u));
    return () => {
      alive = false;
    };
  }, [artHash, session]);

  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 6, backgroundColor: colors.surface }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: 6, backgroundColor: colors.surfaceHigh, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.textDim, fontSize: size / 2.5 }}>{(label ?? "♪").trim().charAt(0).toUpperCase() || "♪"}</Text>
    </View>
  );
}
