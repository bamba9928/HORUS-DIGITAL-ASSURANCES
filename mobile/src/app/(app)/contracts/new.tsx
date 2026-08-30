/**
 * Souscription — pendant mobile de `web/src/app/contracts/new/page.tsx`, limité
 * au mono-véhicule (auto et moto).
 *
 * La flotte, le garage et le bus école restent sur le web, et ce n'est pas une
 * étape à rattraper : ils demandent de gérer une liste de véhicules et leurs
 * remorques, saisie de tableur qu'un écran de téléphone rend pénible et
 * fautive. Le terrain mobile, c'est le contrat d'un client devant soi.
 *
 * Quatre étapes, la même découpe que le web pour qu'un apporteur qui passe d'un
 * écran à l'autre retrouve ses repères : véhicule, souscripteur, garanties,
 * devis.
 *
 * Aucun calcul de prime ici. Le devis vient d'ASS via le backend : le
 * reproduire côté client donnerait un montant qui finirait par diverger de
 * celui qui engage la compagnie.
 */
import Feather from "@expo/vector-icons/Feather";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBanner } from "@/components/ui";
import {
  CheckRow,
  DateField,
  Field,
  PrimaryButton,
  SelectField,
  TextField,
  todayIso,
  type Choice,
} from "@/components/form";
import {
  calculateContractQuote,
  createContractDraft,
  fetchEnergies,
  fetchGuaranteeOptionReferentials,
  fetchGuarantees,
  fetchMotoUsages,
  fetchPeriodicities,
  fetchVehicleBrands,
  fetchVehicleCategories,
  fetchVehicleSubcategories,
  updateContractDraft,
  type ContractQuote,
  type GuaranteeOptionReferential,
  type SelectOption,
} from "@/lib/api";
import { formatFcfa, joinMeta } from "@/lib/format";
import { colors, radius, spacing } from "@/lib/theme";

/* ── Formulaire ──────────────────────────────────────────────────────────── */

type VehicleForm = {
  brand: string;
  model: string;
  category: string;
  subcategory: string;
  registration: string;
  energy: string;
  fiscalPower: string;
  seats: string;
  cylindree: string;
  motoUsage: string;
  effectDate: string;
  duration: string;
  periodicity: string;
  personType: string;
};

type PersonForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
};

// Repris tel quel du web (`normalizeVehicleForPayload`) : la date de première
// mise en circulation n'est pas saisie et part en dur, le châssis reste vide.
// Les changer ici ferait diverger deux clients du même backend.
const DEFAULT_FIRST_CIRCULATION_DATE = "2000-01-01";

const EMPTY_VEHICLE: VehicleForm = {
  brand: "",
  model: "",
  category: "",
  subcategory: "",
  registration: "",
  energy: "",
  fiscalPower: "",
  seats: "",
  cylindree: "",
  motoUsage: "non_commerciale",
  effectDate: todayIso(),
  duration: "12",
  periodicity: "MOIS",
  personType: "PHYSIQUE",
};

const EMPTY_PERSON: PersonForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  address: "",
};

const STEPS = ["Véhicule", "Souscripteur", "Garanties", "Devis"] as const;

const KINDS: Choice[] = [
  { value: "AUTO_MONO", label: "Auto" },
  { value: "MOTO", label: "Moto" },
];

export default function NewContractScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scroller = useRef<ScrollView>(null);

  const [step, setStep] = useState(0);
  const [contractType, setContractType] = useState("AUTO_MONO");
  const [vehicle, setVehicle] = useState<VehicleForm>(EMPTY_VEHICLE);
  const [policyholder, setPolicyholder] = useState<PersonForm>(EMPTY_PERSON);
  const [insured, setInsured] = useState<PersonForm>(EMPTY_PERSON);
  const [sameAsPolicyholder, setSameAsPolicyholder] = useState(true);
  const [guarantees, setGuarantees] = useState<number[]>([]);
  const [guaranteeOptions, setGuaranteeOptions] = useState<Record<string, string>>({});

  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [subcategories, setSubcategories] = useState<SelectOption[]>([]);
  const [energies, setEnergies] = useState<SelectOption[]>([]);
  const [periodicities, setPeriodicities] = useState<SelectOption[]>([]);
  const [motoUsages, setMotoUsages] = useState<SelectOption[]>([]);
  const [guaranteeList, setGuaranteeList] = useState<SelectOption[]>([]);
  const [optionReferentials, setOptionReferentials] = useState<GuaranteeOptionReferential[]>([]);

  const [draftId, setDraftId] = useState<number | null>(null);
  const [quote, setQuote] = useState<ContractQuote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMoto = contractType === "MOTO";

  // Référentiels stables : chargés une fois, pas à chaque étape.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedEnergies, loadedPeriodicities, loadedUsages, loadedGuarantees, loadedOptions] =
          await Promise.all([
            fetchEnergies(),
            fetchPeriodicities(),
            fetchMotoUsages(),
            fetchGuarantees(),
            fetchGuaranteeOptionReferentials(),
          ]);
        if (cancelled) return;
        setEnergies(loadedEnergies);
        setPeriodicities(loadedPeriodicities);
        setMotoUsages(loadedUsages);
        setGuaranteeList(loadedGuarantees);
        setOptionReferentials(loadedOptions);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Référentiels indisponibles."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Les catégories dépendent du type : auto et moto n'ont aucune catégorie en
  // commun côté ASS (C1…C10 contre C5).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchVehicleCategories(contractType);
        if (!cancelled) setCategories(loaded);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Catégories indisponibles.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contractType]);

  useEffect(() => {
    if (!vehicle.category) {
      setSubcategories([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchVehicleSubcategories(vehicle.category);
        if (!cancelled) setSubcategories(loaded);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Genres indisponibles.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vehicle.category]);

  const setVehicleField = useCallback(
    <K extends keyof VehicleForm>(field: K, value: VehicleForm[K]) => {
      setVehicle((current) => {
        // Un genre appartient à une catégorie : le garder après changement de
        // catégorie enverrait à ASS un couple qu'elle refuse en 400.
        if (field === "category" && value !== current.category) {
          return { ...current, category: value as string, subcategory: "" };
        }
        return { ...current, [field]: value };
      });
    },
    []
  );

  const cylindreeError = isMoto
    ? cylindreeMessage(vehicle.subcategory, vehicle.cylindree)
    : "";

  const durationBounds = useMemo(
    () => periodicities.find((option) => option.value === vehicle.periodicity),
    [periodicities, vehicle.periodicity]
  );
  const durationError = durationMessage(vehicle.duration, durationBounds);

  const vehicleReady = Boolean(
    vehicle.brand &&
      vehicle.model &&
      vehicle.category &&
      vehicle.subcategory &&
      vehicle.registration &&
      vehicle.energy &&
      vehicle.effectDate &&
      vehicle.periodicity &&
      !durationError &&
      (isMoto ? !cylindreeError : vehicle.fiscalPower && seatsValid(vehicle))
  );

  const partiesReady =
    personReady(policyholder) && (sameAsPolicyholder || personReady(insured));

  /**
   * Enregistre le brouillon puis demande le devis.
   *
   * Le brouillon est créé une fois et mis à jour ensuite : sans le `draftId`,
   * revenir sur l'étape garanties pour ajuster une case sèmerait un contrat
   * mort dans la liste de l'apporteur à chaque essai.
   */
  const requestQuote = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        contract_type: contractType,
        draft_payload: buildDraftPayload({
          guaranteeOptions,
          guarantees,
          insured,
          policyholder,
          sameAsPolicyholder,
          vehicle,
        }),
      };
      const draft = draftId
        ? await updateContractDraft(draftId, payload)
        : await createContractDraft(payload);
      setDraftId(draft.id);
      const result = await calculateContractQuote(draft.id);
      setQuote(result.quote);
      setStep(3);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Devis impossible.");
    } finally {
      setSubmitting(false);
    }
  }, [
    contractType,
    draftId,
    guaranteeOptions,
    guarantees,
    insured,
    policyholder,
    sameAsPolicyholder,
    vehicle,
  ]);

  // Une étape se lit depuis son début. Le défilement est celui du ScrollView, pas
  // de l'étape : sans remise à zéro, passer au souscripteur ouvrait l'écran au
  // milieu du formulaire — le titre « Nom » hors champ, et l'impression d'avoir
  // sauté quelque chose.
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  function handleBack() {
    if (step === 0) {
      router.back();
      return;
    }
    setStep(step - 1);
  }

  return (
    <>
      <Stack.Screen options={{ title: "Nouveau contrat" }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
          ref={scroller}
        >
          <StepHeader current={step} />

          {error ? <ErrorBanner message={error} /> : null}

          {step === 0 ? (
            <VehicleStep
              categories={categories}
              contractType={contractType}
              cylindreeError={cylindreeError}
              durationError={durationError}
              energies={energies}
              isMoto={isMoto}
              motoUsages={motoUsages}
              onChangeContractType={(next) => {
                setContractType(next);
                // Les catégories ne se recoupent pas : garder l'ancienne ferait
                // partir « C1 » sur un contrat moto.
                setVehicle((current) => ({ ...current, category: "", subcategory: "" }));
              }}
              onChangeField={setVehicleField}
              periodicities={periodicities}
              subcategories={subcategories}
              vehicle={vehicle}
            />
          ) : null}

          {step === 1 ? (
            <PartiesStep
              insured={insured}
              onChangeInsured={setInsured}
              onChangePolicyholder={setPolicyholder}
              onToggleSame={() => setSameAsPolicyholder((current) => !current)}
              policyholder={policyholder}
              sameAsPolicyholder={sameAsPolicyholder}
            />
          ) : null}

          {step === 2 ? (
            <GuaranteesStep
              guaranteeList={guaranteeList}
              guaranteeOptions={guaranteeOptions}
              guarantees={guarantees}
              onChangeOption={(field, value) =>
                setGuaranteeOptions((current) => ({ ...current, [field]: value }))
              }
              onToggleGuarantee={(id) =>
                setGuarantees((current) =>
                  current.includes(id)
                    ? current.filter((item) => item !== id)
                    : [...current, id]
                )
              }
              optionReferentials={optionReferentials}
            />
          ) : null}

          {step === 3 ? (
            <QuoteStep
              contractType={contractType}
              guaranteeList={guaranteeList}
              guarantees={guarantees}
              policyholder={policyholder}
              quote={quote}
              vehicle={vehicle}
            />
          ) : null}

          <View style={styles.actions}>
            <PrimaryButton label={step === 0 ? "Annuler" : "Retour"} onPress={handleBack} tone="ghost" />
            {step === 0 ? (
              <PrimaryButton
                disabled={!vehicleReady}
                label="Continuer"
                onPress={() => setStep(1)}
              />
            ) : null}
            {step === 1 ? (
              <PrimaryButton
                disabled={!partiesReady}
                label="Continuer"
                onPress={() => setStep(2)}
              />
            ) : null}
            {step === 2 ? (
              <PrimaryButton
                label="Calculer le devis"
                loading={submitting}
                onPress={requestQuote}
              />
            ) : null}
            {step === 3 ? (
              <PrimaryButton
                label="Voir le contrat"
                onPress={() => {
                  if (draftId === null) {
                    return;
                  }
                  // `replace` et non `push` : le bouton retour de la fiche doit
                  // ramener à la liste, pas rouvrir un assistant dont le devis
                  // est déjà calculé.
                  router.replace({
                    pathname: "/contracts/[id]",
                    params: { id: draftId },
                  });
                }}
              />
            ) : null}
          </View>

          {step === 2 ? (
            <Text style={styles.note}>
              Le devis est calculé par ASS. Il reste modifiable : revenez sur cette
              étape pour ajuster les garanties et relancer le calcul.
            </Text>
          ) : null}

          {step === 3 && quote ? (
            <Text style={styles.note}>
              Le paiement et l'émission de l'attestation se font depuis l'espace web.
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

/* ── Fil d'étapes ────────────────────────────────────────────────────────── */

function StepHeader({ current }: { current: number }) {
  return (
    <View style={styles.stepRow}>
      {STEPS.map((label, index) => {
        const state = index === current ? "active" : index < current ? "done" : "todo";
        return (
          <View key={label} style={styles.step}>
            <View
              style={[
                styles.stepDot,
                state === "active" && styles.stepDotActive,
                state === "done" && styles.stepDotDone,
              ]}
            >
              {state === "done" ? (
                <Feather color="#ffffff" name="check" size={11} />
              ) : (
                <Text
                  style={[styles.stepIndex, state === "active" && styles.stepIndexActive]}
                >
                  {index + 1}
                </Text>
              )}
            </View>
            <Text
              numberOfLines={1}
              style={[styles.stepLabel, state === "active" && styles.stepLabelActive]}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/* ── Étape 1 : véhicule ──────────────────────────────────────────────────── */

function VehicleStep({
  categories,
  contractType,
  cylindreeError,
  durationError,
  energies,
  isMoto,
  motoUsages,
  onChangeContractType,
  onChangeField,
  periodicities,
  subcategories,
  vehicle,
}: {
  categories: SelectOption[];
  contractType: string;
  cylindreeError: string;
  durationError: string;
  energies: SelectOption[];
  isMoto: boolean;
  motoUsages: SelectOption[];
  onChangeContractType: (value: string) => void;
  onChangeField: <K extends keyof VehicleForm>(field: K, value: VehicleForm[K]) => void;
  periodicities: SelectOption[];
  subcategories: SelectOption[];
  vehicle: VehicleForm;
}) {
  return (
    <View style={styles.card}>
      <Field label="Type de contrat" required>
        <SelectField
          onChange={onChangeContractType}
          options={KINDS}
          title="Type de contrat"
          value={contractType}
        />
      </Field>

      <Field label="Catégorie" required>
        <SelectField
          onChange={(value) => onChangeField("category", value)}
          options={toChoices(categories)}
          title="Catégorie"
          value={vehicle.category}
        />
      </Field>

      <Field
        hint={vehicle.category ? undefined : "Choisissez d'abord une catégorie."}
        label="Genre"
        required
      >
        <SelectField
          disabled={!vehicle.category}
          onChange={(value) => onChangeField("subcategory", value)}
          options={toChoices(subcategories)}
          title="Genre"
          value={vehicle.subcategory}
        />
      </Field>

      <Field label="Marque" required>
        <SelectField
          onChange={(value) => onChangeField("brand", value)}
          onSearch={async (search) => toChoices(await fetchVehicleBrands(search))}
          title="Marque"
          value={vehicle.brand}
        />
      </Field>

      <Field label="Modèle" required>
        <TextField
          autoCapitalize="characters"
          onChangeText={(value) => onChangeField("model", value)}
          placeholder="YARIS"
          value={vehicle.model}
        />
      </Field>

      <Field label="Immatriculation" required>
        <TextField
          autoCapitalize="characters"
          onChangeText={(value) => onChangeField("registration", value.toUpperCase())}
          placeholder="DK-1234-AB"
          value={vehicle.registration}
        />
      </Field>

      <Field label="Énergie" required>
        <SelectField
          onChange={(value) => onChangeField("energy", value)}
          options={toChoices(energies)}
          title="Énergie"
          value={vehicle.energy}
        />
      </Field>

      {isMoto ? (
        <>
          <Field
            hint={cylindreeError || cylindreeHint(vehicle.subcategory)}
            label="Cylindrée (cm³)"
            required
          >
            <TextField
              keyboardType="numeric"
              onChangeText={(value) => onChangeField("cylindree", value)}
              placeholder="125"
              value={vehicle.cylindree}
            />
          </Field>
          <Field label="Usage">
            <SelectField
              onChange={(value) => onChangeField("motoUsage", value)}
              options={toChoices(motoUsages)}
              title="Usage"
              value={vehicle.motoUsage}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Puissance fiscale (CV)" required>
            <TextField
              keyboardType="numeric"
              onChangeText={(value) => onChangeField("fiscalPower", value)}
              placeholder="7"
              value={vehicle.fiscalPower}
            />
          </Field>
          <Field
            hint={
              vehicle.category === "C1"
                ? "Véhicule particulier : 5 places au minimum."
                : undefined
            }
            label="Nombre de places"
            required
          >
            <TextField
              keyboardType="numeric"
              onChangeText={(value) => onChangeField("seats", value)}
              placeholder="5"
              value={vehicle.seats}
            />
          </Field>
        </>
      )}

      <Field label="Date d'effet" required>
        <DateField
          onChange={(value) => onChangeField("effectDate", value)}
          value={vehicle.effectDate}
        />
      </Field>

      <Field label="Périodicité" required>
        <SelectField
          onChange={(value) => onChangeField("periodicity", value)}
          options={toChoices(periodicities)}
          title="Périodicité"
          value={vehicle.periodicity}
        />
      </Field>

      <Field hint={durationError || undefined} label="Durée" required>
        <TextField
          keyboardType="numeric"
          onChangeText={(value) => onChangeField("duration", value)}
          placeholder="12"
          value={vehicle.duration}
        />
      </Field>
    </View>
  );
}

/* ── Étape 2 : souscripteur et assuré ────────────────────────────────────── */

function PartiesStep({
  insured,
  onChangeInsured,
  onChangePolicyholder,
  onToggleSame,
  policyholder,
  sameAsPolicyholder,
}: {
  insured: PersonForm;
  onChangeInsured: (value: PersonForm) => void;
  onChangePolicyholder: (value: PersonForm) => void;
  onToggleSame: () => void;
  policyholder: PersonForm;
  sameAsPolicyholder: boolean;
}) {
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Souscripteur</Text>
        <PersonFields onChange={onChangePolicyholder} person={policyholder} />
      </View>

      <View style={styles.card}>
        <CheckRow
          checked={sameAsPolicyholder}
          label="L'assuré est le souscripteur"
          onToggle={onToggleSame}
        />
        {sameAsPolicyholder ? null : (
          <>
            <Text style={styles.cardTitle}>Assuré</Text>
            <PersonFields onChange={onChangeInsured} person={insured} />
          </>
        )}
      </View>
    </>
  );
}

function PersonFields({
  onChange,
  person,
}: {
  onChange: (value: PersonForm) => void;
  person: PersonForm;
}) {
  function set<K extends keyof PersonForm>(field: K, value: PersonForm[K]) {
    onChange({ ...person, [field]: value });
  }

  return (
    <>
      <Field label="Nom" required>
        <TextField
          autoCapitalize="characters"
          onChangeText={(value) => set("lastName", value)}
          placeholder="NDIAYE"
          value={person.lastName}
        />
      </Field>
      <Field label="Prénom">
        <TextField
          autoCapitalize="words"
          onChangeText={(value) => set("firstName", value)}
          placeholder="Awa"
          value={person.firstName}
        />
      </Field>
      {/* Le backend refuse tout ce qui ne commence pas par 7 et ne fait pas neuf
          chiffres (`PHONE_PATTERN`). Le dire ici évite un aller-retour réseau
          pour apprendre qu'un indicatif « +221 » n'est pas accepté. */}
      <Field hint="9 chiffres, commence par 7. Sans indicatif." label="Téléphone" required>
        <TextField
          keyboardType="phone-pad"
          onChangeText={(value) => set("phone", value.replace(/\D/g, "").slice(0, 9))}
          placeholder="771234567"
          value={person.phone}
        />
      </Field>
      <Field label="Email">
        <TextField
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={(value) => set("email", value)}
          placeholder="client@example.com"
          value={person.email}
        />
      </Field>
      <Field label="Adresse">
        <TextField
          onChangeText={(value) => set("address", value)}
          placeholder="Dakar"
          value={person.address}
        />
      </Field>
    </>
  );
}

/* ── Étape 3 : garanties ─────────────────────────────────────────────────── */

function GuaranteesStep({
  guaranteeList,
  guaranteeOptions,
  guarantees,
  onChangeOption,
  onToggleGuarantee,
  optionReferentials,
}: {
  guaranteeList: SelectOption[];
  guaranteeOptions: Record<string, string>;
  guarantees: number[];
  onChangeOption: (field: string, value: string) => void;
  onToggleGuarantee: (id: number) => void;
  optionReferentials: GuaranteeOptionReferential[];
}) {
  // Une option ne s'affiche que si sa garantie déclenchante est cochée : ASS
  // rejette `garantiesOptAR` sans la garantie 4, et l'apporteur n'a rien à
  // choisir dans une liste qui ne partira pas.
  const visibleOptions = optionReferentials.filter(
    (referential) =>
      referential.enabled !== false &&
      (referential.trigger_guarantee === null ||
        guarantees.includes(referential.trigger_guarantee))
  );

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Garanties optionnelles</Text>
        <Text style={styles.cardHint}>
          La responsabilité civile est toujours incluse. Ces garanties s'y ajoutent.
        </Text>
        {guaranteeList.map((guarantee) => {
          const id = Number(guarantee.value);
          return (
            <CheckRow
              checked={guarantees.includes(id)}
              key={id}
              label={guarantee.label}
              onToggle={() => onToggleGuarantee(id)}
            />
          );
        })}
      </View>

      {visibleOptions.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Options</Text>
          {visibleOptions.map((referential) => (
            <Field hint={referential.helper} key={referential.field} label={referential.label}>
              <SelectField
                onChange={(value) => onChangeOption(referential.field, value)}
                options={toChoices(referential.options)}
                title={referential.label}
                value={guaranteeOptions[referential.field] ?? ""}
              />
            </Field>
          ))}
        </View>
      ) : null}
    </>
  );
}

/* ── Étape 4 : devis ─────────────────────────────────────────────────────── */

function QuoteStep({
  contractType,
  guaranteeList,
  guarantees,
  policyholder,
  quote,
  vehicle,
}: {
  contractType: string;
  guaranteeList: SelectOption[];
  guarantees: number[];
  policyholder: PersonForm;
  quote: ContractQuote | null;
  vehicle: VehicleForm;
}) {
  if (!quote) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardHint}>Aucun devis calculé.</Text>
      </View>
    );
  }

  const guaranteeLabels = guaranteeList
    .filter((item) => guarantees.includes(Number(item.value)))
    .map((item) => item.label);

  // Le total vient d'ASS quand elle le fournit. Le recalculer par addition
  // donnerait un montant qui diverge dès qu'une taxe change de règle.
  const total = quote.prime_totale ?? quote.prime_rc_ass + quote.policy_fee_ass;

  return (
    <>
      <View style={styles.quoteCard}>
        <Text style={styles.quoteLabel}>Prime totale</Text>
        <Text style={styles.quoteValue}>{formatFcfa(total)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Détail</Text>
        <QuoteRow label="Prime RC" value={formatFcfa(quote.prime_rc_ass)} />
        {quote.prime_ag ? <QuoteRow label="Prime accessoire" value={formatFcfa(quote.prime_ag)} /> : null}
        {quote.taxe ? <QuoteRow label="Taxe" value={formatFcfa(quote.taxe)} /> : null}
        {quote.fonds_garantie ? (
          <QuoteRow label="Fonds de garantie" value={formatFcfa(quote.fonds_garantie)} />
        ) : null}
        {quote.cedeao ? <QuoteRow label="CEDEAO" value={formatFcfa(quote.cedeao)} /> : null}
        {quote.reduction ? <QuoteRow label="Réduction" value={formatFcfa(-quote.reduction)} /> : null}
        <QuoteRow label="Coût de police" value={formatFcfa(quote.cout_police ?? quote.policy_fee_ass)} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contrat</Text>
        <QuoteRow
          label="Véhicule"
          value={joinMeta([vehicle.brand, vehicle.model, vehicle.registration], " ") || "—"}
        />
        <QuoteRow label="Type" value={contractType === "MOTO" ? "Moto" : "Auto"} />
        <QuoteRow
          label="Souscripteur"
          value={joinMeta([policyholder.firstName, policyholder.lastName], " ") || "—"}
        />
        <QuoteRow
          label="Couverture"
          value={joinMeta([
            vehicle.duration,
            vehicle.periodicity === "JOUR" ? "jour(s)" : "mois",
          ], " ")}
        />
        <QuoteRow label="Garanties" value={guaranteeLabels.length ? String(guaranteeLabels.length) : "RC seule"} />
      </View>

      {quote.warnings.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Avertissements ASS</Text>
          {quote.warnings.map((warning) => (
            <Text key={warning} style={styles.warning}>
              {warning}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.quoteRow}>
      <Text style={styles.quoteRowLabel}>{label}</Text>
      <Text style={styles.quoteRowValue}>{value}</Text>
    </View>
  );
}

/* ── Charge utile et payload ─────────────────────────────────────────────── */

/**
 * `chargeUtile` attendu par ASS pour la catégorie C2 (utilitaires), déduit du
 * genre. Repris de `getChargeUtile` (web) : c'est ASS qui fixe la règle, pas
 * nous, et deux clients ne peuvent pas en avoir deux lectures.
 */
function chargeUtileFor(subcategory: string) {
  if (subcategory === "TPC" || subcategory === "TPC3T500") return 1;
  if (subcategory === "TPC3T500P") return 4;
  return null;
}

function buildDraftPayload({
  guaranteeOptions,
  guarantees,
  insured,
  policyholder,
  sameAsPolicyholder,
  vehicle,
}: {
  guaranteeOptions: Record<string, string>;
  guarantees: number[];
  insured: PersonForm;
  policyholder: PersonForm;
  sameAsPolicyholder: boolean;
  vehicle: VehicleForm;
}) {
  const chargeUtile = chargeUtileFor(vehicle.subcategory);
  return {
    vehicle: {
      ...vehicle,
      chassis: "",
      currentValue: "0",
      firstCirculationDate: DEFAULT_FIRST_CIRCULATION_DATE,
      newValue: "0",
      ...(chargeUtile !== null ? { chargeUtile } : {}),
    },
    guarantees,
    // Les options d'une garantie décochée entre-temps traînent dans l'état :
    // les envoyer ferait refuser le devis par ASS.
    guaranteeOptions: cleanGuaranteeOptions(guaranteeOptions),
    policyholder,
    insured: sameAsPolicyholder ? policyholder : insured,
    sameAsPolicyholder,
    source: "mobile-new-contract",
  };
}

function cleanGuaranteeOptions(guaranteeOptions: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(guaranteeOptions).filter(([, value]) => Boolean(value))
  );
}

/* ── Validations locales ─────────────────────────────────────────────────── */

function personReady(person: PersonForm) {
  return Boolean(person.lastName.trim()) && /^7\d{8}$/.test(person.phone);
}

function seatsValid(vehicle: VehicleForm) {
  const seats = Number(vehicle.seats);
  if (!vehicle.seats.trim() || !Number.isFinite(seats) || seats <= 0) {
    return false;
  }
  // Contrainte ASS reprise du web : un véhicule particulier déclaré à moins de
  // cinq places est refusé à l'émission, pas au devis — donc bien plus tard.
  return vehicle.category !== "C1" || seats >= 5;
}

/** Bornes ASS par genre, reprises de `getCylindreeError` (web). */
function cylindreeMessage(subcategory: string, cylindree: string) {
  if (!cylindree.trim()) {
    return "La cylindrée est obligatoire.";
  }
  const value = Number(cylindree);
  if (!Number.isFinite(value) || value <= 0) {
    return "Valeur invalide.";
  }
  if (subcategory === "2RCYC" && value > 50) {
    return "Cyclomoteur : 50 cm³ au maximum.";
  }
  if (subcategory === "2RSCO" && (value < 51 || value > 125)) {
    return "Scooter : entre 51 et 125 cm³.";
  }
  if (subcategory === "2RMOT" && value < 126) {
    return "Motocyclette : 126 cm³ au minimum.";
  }
  if (subcategory === "2RSID" && value < 51) {
    return "Side-car : 51 cm³ au minimum.";
  }
  return "";
}

function cylindreeHint(subcategory: string) {
  if (subcategory === "2RCYC") return "50 cm³ au maximum.";
  if (subcategory === "2RSCO") return "Entre 51 et 125 cm³.";
  if (subcategory === "2RMOT") return "126 cm³ au minimum.";
  if (subcategory === "2RSID") return "51 cm³ au minimum.";
  return undefined;
}

/**
 * Bornes de durée. Elles viennent du référentiel (`min_duration` /
 * `max_duration`) et non d'un tableau recopié ici : douze mois et trois cent
 * soixante-six jours sont des règles ASS, elles bougeront sans nous prévenir.
 */
function durationMessage(duration: string, bounds: SelectOption | undefined) {
  if (!duration.trim()) {
    return "La durée est obligatoire.";
  }
  const value = Number(duration);
  if (!Number.isInteger(value) || value <= 0) {
    return "La durée doit être un nombre entier de périodes.";
  }
  if (bounds?.min_duration !== undefined && value < bounds.min_duration) {
    return `Minimum ${bounds.min_duration}.`;
  }
  if (bounds?.max_duration !== undefined && value > bounds.max_duration) {
    return `Maximum ${bounds.max_duration}.`;
  }
  return "";
}

function toChoices(options: SelectOption[]): Choice[] {
  return options
    .filter((option) => option.enabled !== false)
    .map((option) => ({ value: String(option.value), label: option.label }));
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  cardHint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  cardTitle: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginTop: spacing.sm,
    textTransform: "uppercase",
  },
  flex: { backgroundColor: colors.background, flex: 1 },
  note: {
    alignSelf: "stretch",
    color: colors.textFaint,
    fontSize: 11,
    marginTop: spacing.md,
    textAlign: "center",
  },
  quoteCard: {
    backgroundColor: colors.primarySubtle,
    borderColor: colors.primaryMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  quoteLabel: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  quoteRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  quoteRowLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  quoteRowValue: {
    color: colors.textBody,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  quoteValue: {
    color: colors.primaryStrong,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 2,
  },
  scroll: { padding: spacing.lg },
  step: { alignItems: "center", flex: 1, gap: spacing.xs },
  stepDot: {
    alignItems: "center",
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone: { backgroundColor: colors.success },
  stepIndex: { color: colors.textMuted, fontSize: 11, fontWeight: "900" },
  stepIndexActive: { color: "#ffffff" },
  stepLabel: {
    alignSelf: "stretch",
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  stepLabelActive: { color: colors.primary },
  stepRow: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md },
  warning: { color: colors.warning, fontSize: 12, marginTop: spacing.sm },
});
