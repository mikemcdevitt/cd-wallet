import { useMemo, useState } from "react";
import { FlatList, Linking, Pressable, Text, View } from "react-native";
import { noTextNote, textsFor, type LicenseData, type LicensePackage } from "../src/licenses/data";
import { colors, spacing } from "../src/ui/theme";

// Loaded when this screen opens, so the ~450 KB file doesn't slow down app start.
const load = (): LicenseData => require("../src/licenses/licenses.generated.json") as LicenseData;

export default function Licenses() {
  const data = useMemo(load, []);
  const [open, setOpen] = useState<string | undefined>();

  return (
    <FlatList
      data={data.packages}
      keyExtractor={(p) => `${p.name}@${p.version}`}
      initialNumToRender={20}
      ListHeaderComponent={
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={{ color: colors.text, fontSize: 18 }}>CD Wallet</Text>
          <Text style={{ color: colors.textDim, fontSize: 13 }}>{data.appLicense}</Text>
          <Text style={{ color: colors.text, fontSize: 18, marginTop: spacing.lg }}>Open-source software</Text>
          <Text style={{ color: colors.textDim, fontSize: 13 }}>CD Wallet is built with the following open-source packages. Tap one to read its license.</Text>
        </View>
      }
      renderItem={({ item }) => <PackageRow pkg={item} data={data} expanded={open === `${item.name}@${item.version}`} onToggle={(id) => setOpen((cur) => (cur === id ? undefined : id))} />}
    />
  );
}

function PackageRow({ pkg, data, expanded, onToggle }: { pkg: LicensePackage; data: LicenseData; expanded: boolean; onToggle: (id: string) => void }) {
  const id = `${pkg.name}@${pkg.version}`;
  const texts = textsFor(data, pkg);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
      <Pressable onPress={() => onToggle(id)} accessibilityRole="button" accessibilityState={{ expanded }} style={{ padding: spacing.lg }}>
        <Text style={{ color: colors.text, fontSize: 15 }}>{pkg.name}</Text>
        <Text style={{ color: colors.textDim, fontSize: 12 }}>
          {pkg.version} · {pkg.license}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>
          {texts.length === 0 ? <Text style={{ color: colors.textDim, fontSize: 12 }}>{noTextNote(pkg)}</Text> : null}
          {texts.map((t, i) => (
            <Text key={i} selectable style={{ color: colors.textDim, fontSize: 12 }}>
              {t}
            </Text>
          ))}
          {pkg.homepage ? (
            <Pressable onPress={() => void Linking.openURL(pkg.homepage!)} accessibilityRole="link">
              <Text style={{ color: colors.accent, fontSize: 12 }}>{pkg.homepage}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
