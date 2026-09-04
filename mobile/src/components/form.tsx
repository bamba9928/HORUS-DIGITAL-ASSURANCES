/**
 * Briques de formulaire de la souscription.
 *
 * React Native n'a ni `<select>` ni `<input type="date">` : les deux sont
 * reconstruits ici. `@react-native-picker/picker` et
 * `@react-native-community/datetimepicker` auraient fait l'affaire, mais aucun
 * des deux n'est embarqué dans Expo Go — les ajouter obligerait à passer par un
 * build de développement pour la moindre vérification sur téléphone.
 *
 * L'habillage suit celui du web (`SelectSearch.tsx`, `DatePicker.tsx`) : libellé
 * violet en capitales, champ à choix teinté de violet — face au champ de saisie
 * libre, resté neutre — et liste déroulante en aplat violet, texte blanc. Un
 * apporteur qui passe d'un écran à l'autre doit reconnaître ce sur quoi il peut
 * appuyer.
 */
import Feather from "@expo/vector-icons/Feather";
import { StatusBar } from "expo-status-bar";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/lib/theme";

/** Blancs translucides du panneau violet. Repris des `white/xx` du web. */
const ON_PRIMARY = {
  strong: "#ffffff",
  text: "rgba(255, 255, 255, 0.85)",
  faint: "rgba(255, 255, 255, 0.55)",
  line: "rgba(255, 255, 255, 0.15)",
  wash: "rgba(255, 255, 255, 0.12)",
  active: "rgba(255, 255, 255, 0.2)",
} as const;

/** Violet atténué du texte d'invite, pendant du `text-primary/55` du web. */
const PRIMARY_FAINT = "rgba(150, 0, 192, 0.55)";

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
      {/* L'astérisque est un `<Text>` FRÈRE, pas un enfant du libellé : un
          `<Text>` à plusieurs enfants perd son dernier fragment quand il doit
          se replier (voir README, « Le texte coupé sans ellipse »), et
          « Puissance fiscale (CV) » se replie sur un écran étroit. */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {required ? <Text style={styles.labelRequired}>*</Text> : null}
      </View>
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

/**
 * `enabled: false` : option annoncée mais pas encore ouverte côté ASS. Elle
 * reste VISIBLE, suffixée « À venir » et non sélectionnable — comme sur le web.
 * La masquer laisserait croire que le produit n'existe pas.
 */
export type Choice = { value: string; label: string; enabled?: boolean };

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
  const insets = useSafeAreaInsets();
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
    // Le voyant s'allume au DÉPART de la requête, pas à la frappe : pendant les
    // 300 ms d'amortissement, la liste précédente reste la bonne réponse à ce
    // qui est affiché.
    const timer = setTimeout(async () => {
      setLoading(true);
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
        {/* Repli sur la valeur BRUTE quand son libellé n'est pas encore connu.
            Le référentiel arrive du réseau, et les marques ne descendent même
            qu'à la recherche : à la reprise d'un brouillon, le champ affichait
            « Choisir… » sur un véhicule dont la marque et le genre étaient
            pourtant renseignés — soit exactement le contraire de la vérité. Un
            code (« C1 ») le temps que le libellé arrive vaut mieux qu'une
            invitation à ressaisir ce qui est déjà là. */}
        <Text
          numberOfLines={1}
          style={[styles.selectLabel, !selected && !value && styles.selectPlaceholder]}
        >
          {selected?.label || value || placeholder}
        </Text>
        <Feather
          color={disabled ? colors.textFaint : colors.primary}
          name="chevron-down"
          size={16}
        />
      </Pressable>

      <Modal animationType="slide" onRequestClose={() => setOpen(false)} visible={open}>
        {/* Aplat violet jusque sous la barre d'état : en style « dark », ses
            icônes deviendraient illisibles. */}
        <StatusBar style="light" />
        <View style={[styles.sheet, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable
              accessibilityLabel="Fermer"
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={styles.sheetClose}
            >
              <Feather color={ON_PRIMARY.strong} name="x" size={18} />
            </Pressable>
          </View>

          {searchable || onSearch ? (
            <TextInput
              autoCapitalize="characters"
              autoCorrect={false}
              onChangeText={setSearch}
              placeholder="Filtrer la liste"
              placeholderTextColor={ON_PRIMARY.faint}
              style={styles.sheetSearch}
              value={search}
            />
          ) : null}

          {loading ? (
            <ActivityIndicator color={ON_PRIMARY.strong} style={styles.sheetSpinner} />
          ) : null}

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
              const unavailable = item.enabled === false;
              return (
                <Pressable
                  disabled={unavailable}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.sheetRow,
                    active && styles.sheetRowSelected,
                    unavailable && styles.sheetRowUnavailable,
                    pressed && !unavailable && styles.sheetRowPressed,
                  ]}
                >
                  <Text style={[styles.sheetRowLabel, active && styles.sheetRowActive]}>
                    {unavailable ? `${item.label} — À venir` : item.label}
                  </Text>
                  {active ? (
                    <Feather color={ON_PRIMARY.strong} name="check" size={16} />
                  ) : null}
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
  minIsoDate,
  onChange,
  value,
}: {
  /** Borne basse INCLUSE, au format ISO. En deçà, les jours sont barrés. */
  minIsoDate?: string;
  /** Valeur ISO `AAAA-MM-JJ`, ou chaîne vide. */
  onChange: (isoDate: string) => void;
  value: string;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const floor = minIsoDate ? parseIso(minIsoDate) : undefined;
  const [month, setMonth] = useState(() =>
    startOfMonth(selected ?? floor ?? new Date())
  );

  function openPicker() {
    // Le mois se recale À L'OUVERTURE, et non par un effet sur `value` :
    // rouvrir le calendrier sur le mois où l'utilisateur avait navigué la fois
    // précédente serait déroutant.
    setMonth(startOfMonth(parseIso(value) ?? floor ?? new Date()));
    setOpen(true);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={openPicker}
        style={({ pressed }) => [
          styles.input,
          styles.select,
          pressed && styles.selectPressed,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.selectLabel, !selected && styles.selectPlaceholder]}
        >
          {selected ? formatLongDate(selected) : "Sélectionner une date"}
        </Text>
        <Feather color={colors.primary} name="calendar" size={16} />
      </Pressable>

      <Modal animationType="slide" onRequestClose={() => setOpen(false)} visible={open}>
        <StatusBar style="light" />
        <View style={[styles.sheet, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{"Date d'effet"}</Text>
            <Pressable
              accessibilityLabel="Fermer"
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={styles.sheetClose}
            >
              <Feather color={ON_PRIMARY.strong} name="x" size={18} />
            </Pressable>
          </View>

          <View style={styles.calendar}>
            <View style={styles.monthRow}>
              <Pressable
                accessibilityLabel="Mois précédent"
                accessibilityRole="button"
                onPress={() => setMonth((current) => addMonths(current, -1))}
                style={({ pressed }) => [styles.monthNav, pressed && styles.monthNavPressed]}
              >
                <Feather color={ON_PRIMARY.strong} name="chevron-left" size={18} />
              </Pressable>
              <Text style={styles.monthLabel}>{formatMonth(month)}</Text>
              <Pressable
                accessibilityLabel="Mois suivant"
                accessibilityRole="button"
                onPress={() => setMonth((current) => addMonths(current, 1))}
                style={({ pressed }) => [styles.monthNav, pressed && styles.monthNavPressed]}
              >
                <Feather color={ON_PRIMARY.strong} name="chevron-right" size={18} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((weekday, index) => (
                <Text key={index} style={styles.weekday}>
                  {weekday}
                </Text>
              ))}
            </View>

            <View style={styles.dayGrid}>
              {buildMonthCells(month).map((day, index) => {
                if (day === null) {
                  return <View key={`blank-${index}`} style={styles.day} />;
                }
                const iso = toIso(day);
                const isSelected = iso === value;
                // Repère du jour, comme l'anneau du calendrier web : sans lui,
                // rien ne situe le mois affiché quand on a navigué de plusieurs
                // mois en arrière ou en avant.
                const isToday = iso === todayIso();
                // Antidaté : une couverture ne peut pas commencer hier.
                const blocked = Boolean(floor && day < floor);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: blocked, selected: isSelected }}
                    disabled={blocked}
                    key={iso}
                    onPress={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.day,
                      isToday && !isSelected && styles.dayToday,
                      isSelected && styles.daySelected,
                      pressed && !blocked && !isSelected && styles.dayPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayLabel,
                        blocked && styles.dayBlocked,
                        isSelected && styles.dayLabelSelected,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ── Dates ──────────────────────────────────────────────────────────── */

// Semaine commençant le lundi, comme le calendrier du web.
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"] as const;

// Écrits ici plutôt que tirés d'`Intl` : le rendu du calendrier ne doit pas
// dépendre des données de locale embarquées dans le moteur JS, qui varient d'un
// appareil à l'autre. Un mois affiché en anglais sur un téléphone et en
// français sur un autre serait un défaut pénible à reproduire.
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/**
 * Analyse une date ISO en date LOCALE.
 *
 * `new Date("2026-06-05")` serait interprété en UTC : à l'ouest de Greenwich,
 * la date rendue serait le 4 juin. Les composants sont donc passés un par un.
 */
function parseIso(iso: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

function toIso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function formatMonth(date: Date) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function formatLongDate(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Cases du mois, précédées des vides qui alignent le 1er sur son jour. */
function buildMonthCells(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  // `getDay()` compte à partir de dimanche ; la grille commence lundi.
  const offset = (first.getDay() + 6) % 7;
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= total; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  return cells;
}

export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
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
  calendar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  day: {
    alignItems: "center",
    borderRadius: radius.sm,
    height: 44,
    justifyContent: "center",
    // Sept colonnes exactement. Un pourcentage plutôt qu'une largeur fixe : la
    // grille doit tenir aussi bien sur 320 dp que sur une tablette.
    width: "14.28%",
  },
  dayBlocked: { color: ON_PRIMARY.faint, textDecorationLine: "line-through" },
  dayGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayLabel: { color: ON_PRIMARY.text, fontSize: 15, fontWeight: "700" },
  dayLabelSelected: { color: colors.primary, fontWeight: "900" },
  dayPressed: { backgroundColor: ON_PRIMARY.wash },
  daySelected: { backgroundColor: ON_PRIMARY.strong },
  dayToday: { borderColor: ON_PRIMARY.faint, borderWidth: 1 },
  monthLabel: {
    color: ON_PRIMARY.strong,
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "capitalize",
  },
  monthNav: {
    alignItems: "center",
    backgroundColor: ON_PRIMARY.wash,
    borderRadius: radius.md,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  monthNavPressed: { backgroundColor: ON_PRIMARY.active },
  monthRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  weekRow: { flexDirection: "row", marginBottom: spacing.xs },
  weekday: {
    color: ON_PRIMARY.faint,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    width: "14.28%",
  },
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
  label: {
    color: colors.primary,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  labelRequired: { color: colors.danger, fontSize: 11, fontWeight: "800" },
  labelRow: { alignItems: "flex-start", flexDirection: "row", gap: 3 },
  select: {
    alignItems: "center",
    backgroundColor: colors.primarySubtle,
    borderColor: colors.primaryMuted,
    flexDirection: "row",
    gap: spacing.sm,
  },
  selectDisabled: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
  },
  selectLabel: { color: colors.primary, flex: 1, fontSize: 15, fontWeight: "700" },
  selectPlaceholder: { color: PRIMARY_FAINT, fontWeight: "600" },
  selectPressed: { backgroundColor: colors.primaryMuted },
  sheet: { backgroundColor: colors.primary, flex: 1 },
  sheetClose: {
    alignItems: "center",
    backgroundColor: ON_PRIMARY.wash,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  sheetEmpty: {
    alignSelf: "stretch",
    color: ON_PRIMARY.faint,
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
    borderBottomColor: ON_PRIMARY.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  sheetRowActive: { color: ON_PRIMARY.strong, fontWeight: "900" },
  sheetRowLabel: { color: ON_PRIMARY.text, flex: 1, fontSize: 15, fontWeight: "700" },
  sheetRowPressed: { backgroundColor: ON_PRIMARY.wash },
  sheetRowSelected: { backgroundColor: ON_PRIMARY.active },
  sheetRowUnavailable: { opacity: 0.4 },
  sheetSearch: {
    backgroundColor: ON_PRIMARY.wash,
    borderColor: ON_PRIMARY.line,
    borderRadius: radius.md,
    borderWidth: 1,
    color: ON_PRIMARY.strong,
    fontSize: 15,
    fontWeight: "700",
    marginHorizontal: spacing.lg,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  sheetSpinner: { marginTop: spacing.lg },
  sheetTitle: { color: ON_PRIMARY.strong, flex: 1, fontSize: 18, fontWeight: "900" },
});
