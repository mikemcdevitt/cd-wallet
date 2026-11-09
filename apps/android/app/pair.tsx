import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { describeApiError } from "../src/core/api-client";
import { parsePairingText, validateManualPairing, type PairingInput } from "../src/core/pairing-flow";
import { useApp } from "../src/data/app-context";
import { colors, spacing } from "../src/ui/theme";

const DEVICE_NAME = "Android phone";

export default function Pair() {
  const { pair } = useApp();
  const params = useLocalSearchParams<{ api?: string; code?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const claiming = useRef(false);

  const claim = useCallback(
    async (input: PairingInput) => {
      if (claiming.current) return;
      claiming.current = true;
      setBusy(true);
      setError(undefined);
      try {
        await pair(input, DEVICE_NAME);
      } catch (err) {
        setError(describeApiError(err));
        claiming.current = false;
        setBusy(false);
      }
    },
    [pair],
  );

  // Opened from the QR code with the phone's camera app: cdwallet://pair?api=...&code=...
  useEffect(() => {
    if (params.api && params.code) {
      const parsed = parsePairingText(`cdwallet://pair?${new URLSearchParams({ api: params.api, code: params.code }).toString()}`);
      if (parsed) void claim(parsed);
      else setError("That pairing link isn't valid.");
    }
  }, [params.api, params.code, claim]);

  const onScan = useCallback(
    (data: string) => {
      const parsed = parsePairingText(data);
      if (!parsed) return setError("That QR code isn't a CD Wallet pairing code.");
      setScanning(false);
      void claim(parsed);
    },
    [claim],
  );

  const submitManual = () => {
    const v = validateManualPairing(apiUrl, code);
    if (typeof v === "string") return setError(v);
    void claim(v);
  };

  const field = { backgroundColor: colors.surface, color: colors.text, borderRadius: 8, padding: spacing.md, fontSize: 16 } as const;
  const primary = { padding: spacing.md, borderRadius: 8, backgroundColor: colors.accent, alignItems: "center" } as const;

  if (scanning && permission?.granted) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={(r) => onScan(r.data)}
        />
        <Pressable onPress={() => setScanning(false)} style={{ ...primary, margin: spacing.lg }} accessibilityRole="button">
          <Text style={{ color: colors.bg, fontWeight: "600" }}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: colors.text, fontSize: 18 }}>Connect to your library</Text>
      <Text style={{ color: colors.textDim }}>
        On your computer, run <Text style={{ color: colors.text }}>pnpm cdwallet pair</Text>. It shows a QR code and a short code.
      </Text>

      <Pressable
        style={primary}
        accessibilityRole="button"
        onPress={async () => {
          const res = permission?.granted ? permission : await requestPermission();
          if (res.granted) setScanning(true);
          else setError("Camera access was declined. You can type the code below instead.");
        }}
      >
        <Text style={{ color: colors.bg, fontWeight: "600", fontSize: 16 }}>Scan QR code</Text>
      </Pressable>

      <Text style={{ color: colors.textDim, textAlign: "center" }}>or type them in</Text>
      <TextInput
        style={field}
        value={apiUrl}
        onChangeText={setApiUrl}
        placeholder="API address (https://…)"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <TextInput
        style={field}
        value={code}
        onChangeText={setCode}
        placeholder="Pairing code (ABCD-EFGH-JKMN)"
        placeholderTextColor={colors.textDim}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Pressable style={{ ...primary, backgroundColor: colors.surfaceHigh }} onPress={submitManual} accessibilityRole="button" disabled={busy}>
        {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={{ color: colors.text, fontSize: 16 }}>Pair</Text>}
      </Pressable>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </ScrollView>
  );
}
