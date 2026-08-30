/**
 * Briques de formulaire de la souscription.
 *
 * React Native n'a ni `<select>` ni `<input type="date">` : les deux sont
 * reconstruits ici. `@react-native-picker/picker` et
 * `@react-native-community/datetimepicker` auraient fait l'affaire, mais aucun
 * des deux n'est embarqué dans Expo Go — les ajouter obligerait à passer par un
 * build de développement pour la moindre vérification sur téléphone.
 */
import Feather from "@expo/vector-icons/Feather";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, radius, spacing } from "@/lib/theme";

/* ── Champ générique ─────────────────────────────────────────────────────── */

export function Field({
  children,
  hint,
  label,
  required = false,
}: {
  children: ReactNode;
  hint?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {required ? `${label} *` : label}
      </Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/* ── Saisie texte ────────────────────────────────────────────────────────── */

export function TextField({
  autoCapitalize = "sentences",
  keyboardType = "default",
  onChangeText,
  placeholder,
  value,
}: {
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "numeric" | "phone-pad" | "email-address";
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <TextInput
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      keyboardType={keyboardType}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      style={styles.input}
      value={value}
    />
  );
}

/* ── Liste déroulante ────────────────────────────────────────────────────── */

export type Choice = { value: string; label: string };

/**
 * Sélecteur en plein écran plutôt qu'une roue compacte : les libellés du
 * référentiel ASS sont longs (« C7 - Tourisme / Auto Ecole / Side-cars ») et une
 * roue les tronquerait — précisément le défaut corrigé partout ailleurs.
 *
 * `onSearch` bascule la liste en mode serveur : la liste des marques dépasse
 * deux mille entrées, elle ne descend pas en entier sur le téléphone.
 */
export function SelectField({
  disabled = false,
  emptyMessage = "Aucun résultat.",
  onChange,
  onSearch,
  options,
  placeholder = "Choisir…",
  searchable = false,
  title,
  value,
}: {
  disabled?: boolean;
  emptyMessage?: string;
  onChange: (value: string) => void;
  onSearch?: (search: string) => Promise<Choice[]>;
  options?: Choice[];
  placeholder?: string;
  searchable?: boolean;
  title: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [remote, setRemote] = useState<Choice[]>([]);
  const [loading, setLoading] = useState(false);

  const selected = useMemo(
    () => (options ?? remote).find((option) => option.value === value),
    [options, remote, value]
  );

  // Recherche serveur : la frappe est amortie, sinon chaque lettre part en
  // requête et la liste clignote sur un réseau mobile.
  useEffect(() => {
    if (!open || !onSearch) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await onSearch(search.trim());
        if (!cancelled) {
          setRemote(results);
        }
      } catch {
        if (!cancelled) {
          setRemote([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onSearch, open, search]);

  const visible = onSearch
    ? remote
    : (options ?? []).filter((option) =>
        search.trim()
          ? option.label.toLowerCase().includes(search.trim().toLowerCase())
          : true
      );

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => {
          setSearch("");
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.input,
          styles.select,
          disabled && styles.selectDisabled,
          pressed && !disabled && styles.selectPressed,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.selectLabel, !selected && styles.selectPlaceholder]}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Feather color={colors.textFaint} name="chevron-down" size={16} />
      </Pressable>

      <Modal animationType="slide" onRequestClose={() => setOpen(false)} visible={open}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable
              accessibilityLabel="Fermer"
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={styles.sheetClose}
            >
              <Feather color={colors.textBody} name="x" size={18} />
            </Pressable>
          </View>

          {searchable || onSearch ? (
            <TextInput
              autoCapitalize="characters"
              autoCorrect={false}
              onChangeText={setSearch}
              placeholder="Rechercher…"
              placeholderTextColor={colors.textFaint}
              style={[styles.input, styles.sheetSearch]}
              value={search}
            />
          ) : null}

          {loading ? <ActivityIndicator color={colors.primary} style={styles.sheetSpinner} /> : null}

          <FlatList
            contentContainerStyle={styles.sheetList}
            data={visible}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.value}
            ListEmptyComponent={
              loading ? null : <Text style={styles.sheetEmpty}>{emptyMessage}</Text>
            }
            renderItem={({ item }) => {
              const active = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.sheetRow,
                    pressed && styles.sheetRowPressed,
                  ]}
                >
                  <Text style={[styles.sheetRowLabel, active && styles.sheetRowActive]}>
                    {item.label}
                  </Text>
                  {active ? <Feather color={colors.primary} name="check" size={16} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

/* ── Date ────────────────────────────────────────────────────────────────── */

/**
 * Saisie JJ/MM/AAAA, convertie en ISO pour le backend.
 *
 * Les séparateurs sont posés à la frappe : sur un pavé numérique, le « / » est
 * derrière une bascule de clavier, et le demander à chaque date coûterait deux
 * gestes par champ à un apporteur qui en saisit vingt par jour.
 */
export function DateField({
  onChange,
  value,
}: {
  /** Valeur ISO `AAAA-MM-JJ`, ou chaîne vide. */
  onChange: (isoDate: string) => void;
  value: string;
}) {
  const [text, setText] = useState(() => isoToDisplay(value));

  // La valeur peut changer sans passer par la frappe (reprise d'un brouillon,
  // raccourci « Aujourd'hui »).
  useEffect(() => {
    setText((current) => (displayToIso(current) === value ? current : isoToDisplay(value)));
  }, [value]);

  function handleChange(next: string) {
    const digits = next.replace(/\D/g, "").slice(0, 8);
    const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
    const formatted = parts.join("/");
    setText(formatted);
    onChange(displayToIso(formatted));
  }

  return (
    <View style={styles.dateRow}>
      <TextInput
        keyboardType="numeric"
        onChangeText={handleChange}
        placeholder="JJ/MM/AAAA"
        placeholderTextColor={colors.textFaint}
        style={[styles.input, styles.dateInput]}
        value={text}
      />
      <Pressable
        onPress={() => onChange(todayIso())}
        style={({ pressed }) => [styles.dateToday, pressed && styles.dateTodayPressed]}
      >
        <Text style={styles.dateTodayLabel}>Aujourd'hui</Text>
      </Pressable>
    </View>
  );
}

export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function isoToDisplay(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** Rend "" tant que la date est incomplète ou impossible (31/02 par exemple). */
function displayToIso(display: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) {
    return "";
  }
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const valid =
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day);
  return valid ? `${year}-${month}-${day}` : "";
}

/* ── Case à cocher ───────────────────────────────────────────────────────── */

export function CheckRow({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={({ pressed }) => [styles.checkRow, pressed && styles.checkRowPressed]}
    >
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
        {checked ? <Feather color="#ffffff" name="check" size={12} /> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

/* ── Bouton principal ────────────────────────────────────────────────────── */

export function PrimaryButton({
  disabled = false,
  label,
  loading = false,
  onPress,
  tone = "primary",
}: {
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onPress: () => void;
  tone?: "primary" | "ghost";
}) {
  const ghost = tone === "ghost";
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        ghost && styles.buttonGhost,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={ghost ? colors.primary : "#ffffff"} />
      ) : (
        <Text style={[styles.buttonLabel, ghost && styles.buttonLabelGhost]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    flexGrow: 1,
    height: 48,
    justifyContent: "center",
  },
  buttonDisabled: { backgroundColor: colors.borderStrong, borderColor: colors.borderStrong },
  buttonGhost: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  buttonLabel: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  buttonLabelGhost: { color: colors.primary },
  buttonPressed: { opacity: 0.85 },
  checkBox: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  checkBoxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkLabel: { color: colors.textBody, flex: 1, fontSize: 14, fontWeight: "600" },
  checkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  checkRowPressed: { opacity: 0.7 },
  dateInput: { flex: 1 },
  dateRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  dateToday: {
    backgroundColor: colors.primarySubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dateTodayLabel: { color: colors.primaryStrong, fontSize: 12, fontWeight: "800" },
  dateTodayPressed: { backgroundColor: colors.primaryMuted },
  field: { marginTop: spacing.lg },
  hint: { color: colors.textFaint, fontSize: 11, marginTop: spacing.xs },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textStrong,
    fontSize: 15,
    justifyContent: "center",
    marginTop: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  label: { color: colors.textBody, fontSize: 13, fontWeight: "700" },
  select: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  selectDisabled: { backgroundColor: colors.muted },
  selectLabel: { color: colors.textStrong, flex: 1, fontSize: 15 },
  selectPlaceholder: { color: colors.textFaint },
  selectPressed: { backgroundColor: colors.primarySubtle },
  sheet: { backgroundColor: colors.background, flex: 1, paddingTop: spacing.xxl },
  sheetClose: {
    alignItems: "center",
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  sheetEmpty: {
    alignSelf: "stretch",
    color: colors.textMuted,
    fontSize: 13,
    padding: spacing.lg,
    textAlign: "center",
  },
  sheetHead: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sheetList: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  sheetRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingVertical: spacing.lg,
  },
  sheetRowActive: { color: colors.primary, fontWeight: "800" },
  sheetRowLabel: { color: colors.textBody, flex: 1, fontSize: 15 },
  sheetRowPressed: { backgroundColor: colors.primarySubtle },
  sheetSearch: { marginHorizontal: spacing.lg },
  sheetSpinner: { marginTop: spacing.lg },
  sheetTitle: { color: colors.textStrong, flex: 1, fontSize: 18, fontWeight: "900" },
});
