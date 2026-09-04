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
 *
 * L'assistant s'arrête au devis, et c'est voulu : le paiement et l'émission
 * vivent sur la fiche du contrat (`contracts/[id]`), qui reste le seul endroit
 * où l'on agit sur un dossier — qu'il vienne d'être créé ici ou qu'il ait été
 * ouvert la semaine dernière depuis le web.
 */
import Feather from "@expo/vector-icons/Feather";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
  fetchContract,
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
  type QuoteItem,
  type GuaranteeOptionReferential,
  type SelectOption,
} from "@/lib/api";
import {
  contractTypeLabel,
  coverageEndIso,
  formatDate,
  formatFcfa,
  joinMeta,
} from "@/lib/format";
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

/**
 * Remorque. Elle n'a ni catégorie ni énergie : ASS la tarife à part, rattachée
 * à son tracteur, et ne demande que de quoi l'identifier.
 */
type TrailerForm = {
  brand: string;
  model: string;
  registration: string;
};

type Trailer = TrailerForm & {
  id: string;
  tractorVehicleId: string;
  tractorLabel: string;
};

/**
 * Véhicule d'une flotte : la même saisie qu'en mono-véhicule, plus un
 * identifiant local et ses remorques.
 *
 * L'identifiant est fabriqué ici et voyage jusqu'à ASS (`request_id` dans le
 * devis) : c'est lui qui rattache une remorque à son tracteur et qui permet de
 * lire, ligne par ligne, quelle prime revient à quel véhicule.
 */
type FleetVehicle = VehicleForm & {
  id: string;
  trailers: Trailer[];
};

/**
 * Couverture d'une flotte. Elle est portée par le CONTRAT, pas par chaque
 * véhicule : une flotte s'assure d'un bloc, à une date et pour une durée.
 */
type FleetCoverage = {
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
  // Couverture NON préremplie, comme sur le web : une date d'effet posée
  // d'office serait signée sans avoir été choisie, et une durée de douze mois
  // proposée par défaut finit par être celle de tous les contrats.
  effectDate: "",
  duration: "",
  // La périodicité ne se saisit pas : le web la fixe à MOIS et n'affiche pas
  // le champ. La garder dans la charge utile évite de diverger du format
  // partagé entre les deux clients.
  periodicity: "MOIS",
  personType: "PHYSIQUE",
};

const EMPTY_TRAILER: TrailerForm = { brand: "", model: "", registration: "" };

const EMPTY_FLEET_COVERAGE: FleetCoverage = {
  effectDate: "",
  duration: "",
  periodicity: "MOIS",
  // Une flotte appartient à une entreprise, pas à un particulier.
  personType: "MORALE",
};

const EMPTY_PERSON: PersonForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  address: "",
};

const STEPS = ["Véhicule", "Souscripteur", "Garanties", "Devis"] as const;

/**
 * Types qu'un brouillon peut avoir pour être rouvert ici. `MOTO` en fait
 * partie même s'il n'est plus proposé à la création : les dossiers créés avant
 * ce regroupement le portent toujours.
 */
const RESUMABLE_TYPES = ["AUTO_MONO", "MOTO", "FLEET", "BUS_SCHOOL"];

/**
 * Types proposés, avec les libellés du web.
 *
 * « Moto » n'en est PAS un : côté ASS, un deux-roues est un contrat auto
 * mono-véhicule dont la catégorie est C5. Le web fonctionne ainsi, le mobile
 * en faisait un type à part — et sa liste « Auto » n'offrait alors aucun moyen
 * d'atteindre C5. Le type réellement envoyé se déduit de la catégorie
 * (`effectiveContractType`).
 *
 * Le garage reste sur le web : il a des champs qui lui sont propres (nombre de
 * cartes) et aucun véhicule à saisir. Le bus école, lui, EST un véhicule unique
 * avec la même saisie — le web ne lui change que l'icône et le titre du bloc.
 */
const KINDS: Choice[] = [
  { value: "AUTO_MONO", label: "Auto mono" },
  { value: "FLEET", label: "Flotte" },
  { value: "BUS_SCHOOL", label: "Bus école" },
];

/**
 * Tags ASS acceptés dans le menu Catégorie selon le type choisi. Repris de
 * `CATEGORY_CONTRACT_TYPE_TAGS` (web) : c'est ce couple qui fait apparaître
 * C5 sous « Auto mono ».
 */
const CATEGORY_TAGS: Record<string, string[]> = {
  AUTO_MONO: ["AUTO_MONO", "MOTO"],
  FLEET: ["FLEET"],
  BUS_SCHOOL: ["BUS_SCHOOL"],
};

/** Catégorie deux-roues. C'est elle, et rien d'autre, qui fait un contrat moto. */
const MOTO_CATEGORY = "C5";

export default function NewContractScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scroller = useRef<ScrollView>(null);

  /**
   * Reprise d'un brouillon existant, poussée par la fiche du contrat.
   *
   * Sans ça, un dossier ouvert ici et laissé de côté ne se terminait plus que
   * sur le web : l'assistant repartait toujours d'un formulaire vide.
   */
  const { draftId: draftIdParam } = useLocalSearchParams<{ draftId?: string }>();
  const resumedId = Number(draftIdParam);
  const resuming = Number.isFinite(resumedId) && resumedId > 0;

  const [step, setStep] = useState(0);
  const [contractType, setContractType] = useState("AUTO_MONO");
  const [vehicle, setVehicle] = useState<VehicleForm>(EMPTY_VEHICLE);
  const [policyholder, setPolicyholder] = useState<PersonForm>(EMPTY_PERSON);
  const [insured, setInsured] = useState<PersonForm>(EMPTY_PERSON);
  const [sameAsPolicyholder, setSameAsPolicyholder] = useState(true);
  const [guarantees, setGuarantees] = useState<number[]>([]);
  const [guaranteeOptions, setGuaranteeOptions] = useState<Record<string, string>>({});

  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicle[]>([]);
  const [fleetCoverage, setFleetCoverage] = useState<FleetCoverage>(EMPTY_FLEET_COVERAGE);
  // Véhicule ouvert dans la feuille de saisie. `null` : aucune feuille.
  const [editedVehicle, setEditedVehicle] = useState<FleetVehicle | null>(null);
  // Tracteur auquel rattacher la remorque en cours de saisie.
  const [trailerTarget, setTrailerTarget] = useState<string | null>(null);

  const [allCategories, setAllCategories] = useState<SelectOption[]>([]);
  const [energies, setEnergies] = useState<SelectOption[]>([]);
  const [periodicities, setPeriodicities] = useState<SelectOption[]>([]);
  const [motoUsages, setMotoUsages] = useState<SelectOption[]>([]);
  const [guaranteeList, setGuaranteeList] = useState<SelectOption[]>([]);
  const [optionReferentials, setOptionReferentials] = useState<GuaranteeOptionReferential[]>([]);

  const [draftId, setDraftId] = useState<number | null>(resuming ? resumedId : null);
  /**
   * Vrai tant que le brouillon repris n'est pas chargé — et les étapes ne sont
   * PAS montées pendant ce temps.
   *
   * Tous les champs sont désormais pilotés par leur valeur, `DateField`
   * compris : rien ne se figerait au montage. Ce qui reste, c'est qu'un
   * formulaire vide affiché une seconde avant de se remplir tout seul se lit
   * comme une saisie perdue. On attend d'avoir de quoi le montrer.
   */
  const [hydrating, setHydrating] = useState(resuming);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [quote, setQuote] = useState<ContractQuote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFleet = contractType === "FLEET";
  const isMoto = !isFleet && vehicle.category === MOTO_CATEGORY;
  /**
   * Type réellement envoyé au backend. Un deux-roues part en `MOTO` même si
   * l'apporteur a choisi « Auto mono » : c'est la catégorie qui tranche, et
   * ASS tarife les deux-roues sur un barème distinct.
   */
  const effectiveContractType = isMoto ? "MOTO" : contractType;

  // Chargement du brouillon repris. Une seule fois : les dépendances ne
  // contiennent que l'identifiant de la route.
  useEffect(() => {
    if (!resuming) {
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const contract = await fetchContract(resumedId);
        if (cancelled) return;

        // Le garage a des champs qui lui sont propres, que cet assistant ne
        // sait pas représenter. Mieux vaut le dire que rouvrir un formulaire
        // qui ne lui correspond pas — il en écraserait la saisie au premier
        // enregistrement.
        if (!RESUMABLE_TYPES.includes(contract.contract_type)) {
          setResumeError(
            `Un contrat ${contractTypeLabel(contract.contract_type).toLowerCase()} se modifie depuis l'espace web : sa saisie n'a pas d'équivalent sur cet écran.`
          );
          return;
        }
        if (
          contract.internal_status !== "DRAFT" &&
          contract.internal_status !== "QUOTE_READY"
        ) {
          setResumeError("Ce contrat n'est plus modifiable : il est déjà payé ou émis.");
          return;
        }

        const payload = contract.draft_payload ?? {};
        // `MOTO` n'est plus un choix du menu : il se relit comme « Auto mono »,
        // et la catégorie C5 du brouillon le redésignera comme moto.
        setContractType(
          contract.contract_type === "MOTO" ? "AUTO_MONO" : contract.contract_type
        );
        setVehicle(readVehicle(payload.vehicle));
        if (contract.contract_type === "FLEET") {
          const fleet = readRecord(payload.fleet);
          setFleetVehicles(readFleetVehicles(fleet?.vehicles));
          setFleetCoverage({
            effectDate: readText(fleet, "effectDate"),
            duration: readText(fleet, "duration"),
            periodicity: readText(fleet, "periodicity") || EMPTY_FLEET_COVERAGE.periodicity,
            personType: readText(fleet, "personType") || EMPTY_FLEET_COVERAGE.personType,
          });
        }
        setPolicyholder(readPerson(payload.policyholder));
        setInsured(readPerson(payload.insured));
        // Absent, on considère que l'assuré est le souscripteur : c'est le
        // défaut de la saisie, et le cas de très loin le plus fréquent.
        setSameAsPolicyholder(payload.sameAsPolicyholder !== false);
        setGuarantees(readGuarantees(payload.guarantees));
        setGuaranteeOptions(readGuaranteeOptions(payload.guaranteeOptions));
      } catch (caught) {
        if (!cancelled) {
          setResumeError(
            caught instanceof Error ? caught.message : "Brouillon introuvable."
          );
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resuming, resumedId]);

  // Référentiels stables : chargés une fois, pas à chaque étape.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          loadedCategories,
          loadedEnergies,
          loadedPeriodicities,
          loadedUsages,
          loadedGuarantees,
          loadedOptions,
        ] = await Promise.all([
          fetchVehicleCategories(),
          fetchEnergies(),
          fetchPeriodicities(),
          fetchMotoUsages(),
          fetchGuarantees(),
          fetchGuaranteeOptionReferentials(),
        ]);
        if (cancelled) return;
        setAllCategories(loadedCategories);
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

  // Le menu Catégorie se DÉDUIT du type, il ne se recharge pas : les catégories
  // descendent une fois et le tri se fait sur leurs tags. Une requête de moins
  // à chaque changement de type, et surtout la moto redevient atteignable —
  // C5 porte le tag `MOTO`, que « Auto mono » accepte.
  const categories = useMemo(() => {
    const allowed = CATEGORY_TAGS[contractType] ?? [];
    return allCategories.filter((category) =>
      (category.contract_types ?? []).some((tag) => allowed.includes(tag))
    );
  }, [allCategories, contractType]);

  // `VehicleFields` remonte ses pannes de référentiel par ici. Stable, sinon
  // l'effet qui charge les genres se rejouerait à chaque frappe.
  const reportError = useCallback((message: string) => setError(message), []);

  const changeContractType = useCallback((next: string) => {
    setContractType(next);
    // Les catégories d'un type à l'autre ne se recoupent pas : garder
    // l'ancienne ferait partir « C1 » sur un bus école.
    setVehicle((current) => ({ ...current, category: "", subcategory: "" }));
  }, []);

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

  /**
   * Durées proposées, DÉDUITES du référentiel plutôt que recopiées.
   *
   * Le web écrit son menu de 1 à 12 mois en dur. Ici, les bornes viennent de
   * `min_duration` / `max_duration` de la périodicité : elles appartiennent à
   * ASS, elles bougeront sans nous prévenir, et la liste suivra. Tant que le
   * référentiel n'est pas arrivé, la liste est vide et le champ le dit.
   */
  const periodicity = isFleet ? fleetCoverage.periodicity : vehicle.periodicity;
  const durationBounds = useMemo(
    () => periodicities.find((option) => option.value === periodicity),
    [periodicities, periodicity]
  );
  const durationChoices = useMemo(() => {
    const first = durationBounds?.min_duration ?? 0;
    const last = durationBounds?.max_duration ?? 0;
    if (!first || !last || last < first) {
      return [];
    }
    const unit = periodicity === "JOUR" ? "jour" : "mois";
    return Array.from({ length: last - first + 1 }, (_, index) => {
      const count = first + index;
      return {
        value: String(count),
        label: `${count} ${unit}${count > 1 && unit === "jour" ? "s" : ""}`,
      };
    });
  }, [durationBounds, periodicity]);

  /**
   * Étape 1 franchissable.
   *
   * En flotte, chaque véhicule doit être complet : un seul incomplet fait
   * refuser tout le devis par ASS, et l'apporteur ne saurait pas lequel.
   */
  const stepOneReady = isFleet
    ? fleetVehicles.length > 0 &&
      fleetVehicles.every(vehicleComplete) &&
      Boolean(fleetCoverage.effectDate && fleetCoverage.duration)
    : vehicleComplete(vehicle) && Boolean(vehicle.effectDate && vehicle.duration);

  const partiesReady =
    personReady(policyholder) && (sameAsPolicyholder || personReady(insured));

  /* ── Flotte : ajout, modification, retrait ─────────────────────────────── */

  const saveVehicle = useCallback((saved: FleetVehicle) => {
    setFleetVehicles((current) => {
      const index = current.findIndex((entry) => entry.id === saved.id);
      if (index === -1) {
        return [...current, saved];
      }
      // Les remorques ne passent pas par la feuille de saisie : elles sont
      // conservées telles quelles, sinon les modifier le véhicule les
      // effacerait.
      const next = [...current];
      next[index] = { ...saved, trailers: current[index].trailers };
      return next;
    });
    setEditedVehicle(null);
  }, []);

  const addTrailer = useCallback(
    (trailer: TrailerForm) => {
      setFleetVehicles((current) =>
        current.map((entry) =>
          entry.id === trailerTarget
            ? {
                ...entry,
                trailers: [
                  ...entry.trailers,
                  {
                    ...trailer,
                    id: `rem-local-${Date.now()}`,
                    tractorVehicleId: entry.id,
                    // Repris tel quel du web : ASS s'en sert pour libeller la
                    // remorque dans sa réponse.
                    tractorLabel: joinMeta(
                      [entry.brand, entry.model, "-", entry.registration],
                      " "
                    ),
                  },
                ],
              }
            : entry
        )
      );
      setTrailerTarget(null);
    },
    [trailerTarget]
  );

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
        contract_type: effectiveContractType,
        draft_payload: buildDraftPayload({
          fleetCoverage,
          fleetVehicles,
          guaranteeOptions,
          guarantees,
          insured,
          isFleet,
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
    effectiveContractType,
    draftId,
    fleetCoverage,
    fleetVehicles,
    guaranteeOptions,
    guarantees,
    insured,
    isFleet,
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

  const title = resuming ? "Reprendre le brouillon" : "Nouveau contrat";

  if (resumeError) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <View style={styles.centered}>
          <Text style={styles.centeredText}>{resumeError}</Text>
          <PrimaryButton label="Retour" onPress={() => router.back()} tone="ghost" />
        </View>
      </>
    );
  }

  if (hydrating) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
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

          {resuming ? (
            <Text style={styles.note}>
              {"Le devis sera recalculé : toute modification annule le précédent."}
            </Text>
          ) : null}

          {error ? <ErrorBanner message={error} /> : null}

          {step === 0 && isFleet ? (
            <FleetStep
              contractType={contractType}
              coverage={fleetCoverage}
              durationChoices={durationChoices}
              onAddTrailer={setTrailerTarget}
              onAddVehicle={() =>
                setEditedVehicle({
                  ...EMPTY_VEHICLE,
                  id: `veh-local-${Date.now()}`,
                  trailers: [],
                })
              }
              onChangeContractType={changeContractType}
              onChangeCoverage={(field, value) =>
                setFleetCoverage((current) => ({ ...current, [field]: value }))
              }
              onEditVehicle={(id) =>
                setEditedVehicle(fleetVehicles.find((entry) => entry.id === id) ?? null)
              }
              onRemoveTrailer={(vehicleId, trailerId) =>
                setFleetVehicles((current) =>
                  current.map((entry) =>
                    entry.id === vehicleId
                      ? {
                          ...entry,
                          trailers: entry.trailers.filter((t) => t.id !== trailerId),
                        }
                      : entry
                  )
                )
              }
              onRemoveVehicle={(id) =>
                setFleetVehicles((current) => current.filter((entry) => entry.id !== id))
              }
              vehicles={fleetVehicles}
            />
          ) : null}

          {step === 0 && !isFleet ? (
            <VehicleStep
              categories={categories}
              contractType={contractType}
              durationChoices={durationChoices}
              energies={energies}
              motoUsages={motoUsages}
              onChangeContractType={changeContractType}
              onChangeField={setVehicleField}
              onError={reportError}
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
              contractType={effectiveContractType}
              fleetCoverage={fleetCoverage}
              fleetVehicles={fleetVehicles}
              guaranteeList={guaranteeList}
              guarantees={guarantees}
              isFleet={isFleet}
              policyholder={policyholder}
              quote={quote}
              vehicle={vehicle}
            />
          ) : null}

          <View style={styles.actions}>
            <PrimaryButton label={step === 0 ? "Annuler" : "Retour"} onPress={handleBack} tone="ghost" />
            {step === 0 ? (
              <PrimaryButton
                disabled={!stepOneReady}
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
                label="Payer et émettre"
                onPress={() => {
                  if (draftId === null) {
                    return;
                  }
                  // En reprise, la fiche est déjà sous l'assistant : y revenir
                  // plutôt que d'en empiler une seconde, qui laisserait deux
                  // retours à faire pour retrouver la liste. Elle se recharge à
                  // son retour au premier plan et montre le nouveau devis.
                  if (resuming) {
                    router.back();
                    return;
                  }
                  // À la création, en revanche, `replace` et non `push` : le
                  // bouton retour de la fiche doit ramener à la liste, pas
                  // rouvrir un assistant dont le devis est déjà calculé.
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
              {"Le paiement et l'émission se font depuis la fiche du contrat."}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Montées seulement à l'ouverture : la feuille repart d'une copie neuve
          du véhicule, et la refermer laisse la flotte intacte. */}
      {editedVehicle ? (
        <FleetVehicleSheet
          categories={categories}
          energies={energies}
          motoUsages={motoUsages}
          onCancel={() => setEditedVehicle(null)}
          onError={reportError}
          onSave={saveVehicle}
          vehicle={editedVehicle}
        />
      ) : null}

      {trailerTarget ? (
        <TrailerSheet
          onCancel={() => setTrailerTarget(null)}
          onSave={addTrailer}
          tractorLabel={tractorLabel(fleetVehicles, trailerTarget)}
        />
      ) : null}
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

/* ── Étape 1 : véhicule(s) ───────────────────────────────────────────────── */

/**
 * Identification d'un véhicule — les champs communs au mono-véhicule et à
 * chaque ligne d'une flotte.
 *
 * Extrait pour cette raison : une flotte, c'est la même saisie répétée. Deux
 * copies auraient divergé au premier ajustement, et c'est exactement le genre
 * d'écart qui fait passer un couple catégorie/genre valide d'un côté et refusé
 * de l'autre.
 *
 * Les genres sont chargés ICI, par le composant qui en a besoin : un seul
 * formulaire est monté à la fois — celui de l'étape, ou celui de la feuille
 * d'ajout — donc une seule requête en vol.
 */
function VehicleFields({
  categories,
  energies,
  motoUsages,
  onChangeField,
  onError,
  vehicle,
}: {
  categories: SelectOption[];
  energies: SelectOption[];
  motoUsages: SelectOption[];
  onChangeField: <K extends keyof VehicleForm>(field: K, value: VehicleForm[K]) => void;
  onError: (message: string) => void;
  vehicle: VehicleForm;
}) {
  // Les genres sont mémorisés AVEC leur catégorie. Séparés, il faudrait vider
  // la liste depuis l'effet — et entre le changement de catégorie et l'arrivée
  // de la réponse, le sélecteur proposerait encore les genres de la
  // précédente, donc un couple qu'ASS refuse en 400.
  const [cache, setCache] = useState<{ category: string; options: SelectOption[] } | null>(
    null
  );
  const category = vehicle.category;
  const subcategories = cache?.category === category ? cache.options : [];
  const isMoto = category === MOTO_CATEGORY;
  const cylindreeError = isMoto
    ? cylindreeMessage(vehicle.subcategory, vehicle.cylindree)
    : "";

  useEffect(() => {
    if (!category) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchVehicleSubcategories(category);
        if (!cancelled) setCache({ category, options: loaded });
      } catch (caught) {
        if (!cancelled) {
          onError(caught instanceof Error ? caught.message : "Genres indisponibles.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, onError]);

  return (
    <>
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
    </>
  );
}

/**
 * Date d'effet et durée. En mono-véhicule elles appartiennent au véhicule ; en
 * flotte, au contrat — mêmes champs, deux porteurs.
 */
function CoverageFields({
  duration,
  durationChoices,
  effectDate,
  onChangeDuration,
  onChangeEffectDate,
  periodicity,
}: {
  duration: string;
  durationChoices: Choice[];
  effectDate: string;
  onChangeDuration: (value: string) => void;
  onChangeEffectDate: (value: string) => void;
  periodicity: string;
}) {
  // Ce que l'apporteur annoncera au client. La règle est celle du backend
  // (`calculate_expiration_date`) : effet + durée MOINS UN JOUR. Douze mois pris
  // le 1er octobre couvrent jusqu'au 30 septembre, pas jusqu'au 1er — et c'est
  // le genre d'écart d'un jour qu'on ne découvre qu'au sinistre.
  const end = coverageEndIso(effectDate, duration, periodicity);

  return (
    <>
      {/* Calendrier, et non une saisie « JJ/MM/AAAA » : un jour se choisit, il
          ne se tape pas. Les jours antérieurs à aujourd'hui sont barrés — une
          couverture ne commence pas hier. */}
      <Field label="Date d'effet" required>
        <DateField
          minIsoDate={todayIso()}
          onChange={onChangeEffectDate}
          value={effectDate}
        />
      </Field>

      {/* La périodicité n'est pas exposée : le web la fixe à MOIS et ne
          l'affiche pas. Un champ de plus pour une valeur que personne ne
          change coûte un écran de défilement sur téléphone. */}
      <Field
        hint={
          durationChoices.length
            ? end
              ? `Couverture jusqu'au ${formatDate(end)} inclus.`
              : undefined
            : "Durées indisponibles pour l'instant."
        }
        label="Durée"
        required
      >
        <SelectField
          disabled={durationChoices.length === 0}
          onChange={onChangeDuration}
          options={durationChoices}
          placeholder="Choisir une durée"
          title="Durée"
          value={duration}
        />
      </Field>
    </>
  );
}

function KindField({
  contractType,
  onChange,
}: {
  contractType: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Type de contrat" required>
      <SelectField
        onChange={onChange}
        options={KINDS}
        title="Type de contrat"
        value={contractType}
      />
    </Field>
  );
}

function VehicleStep({
  categories,
  contractType,
  durationChoices,
  energies,
  motoUsages,
  onChangeContractType,
  onChangeField,
  onError,
  vehicle,
}: {
  categories: SelectOption[];
  contractType: string;
  durationChoices: Choice[];
  energies: SelectOption[];
  motoUsages: SelectOption[];
  onChangeContractType: (value: string) => void;
  onChangeField: <K extends keyof VehicleForm>(field: K, value: VehicleForm[K]) => void;
  onError: (message: string) => void;
  vehicle: VehicleForm;
}) {
  return (
    <View style={styles.card}>
      <KindField contractType={contractType} onChange={onChangeContractType} />
      <VehicleFields
        categories={categories}
        energies={energies}
        motoUsages={motoUsages}
        onChangeField={onChangeField}
        onError={onError}
        vehicle={vehicle}
      />
      <CoverageFields
        duration={vehicle.duration}
        durationChoices={durationChoices}
        effectDate={vehicle.effectDate}
        onChangeDuration={(value) => onChangeField("duration", value)}
        onChangeEffectDate={(value) => onChangeField("effectDate", value)}
        periodicity={vehicle.periodicity}
      />
    </View>
  );
}

/* ── Étape 1 bis : flotte ────────────────────────────────────────────────── */

/**
 * Flotte : une LISTE de véhicules, chacun pouvant tracter des remorques.
 *
 * Le web aligne les véhicules dans un tableau ; un téléphone ne peut pas, et
 * n'a pas à essayer. Chaque véhicule est une carte, on l'ouvre pour le
 * modifier, et la saisie se fait dans une feuille plein écran — le même
 * formulaire qu'en mono-véhicule, ni plus court ni différent.
 *
 * La couverture est en bas, une fois pour toute la flotte : c'est le contrat
 * qui la porte, pas chaque véhicule.
 */
function FleetStep({
  contractType,
  coverage,
  durationChoices,
  onAddTrailer,
  onAddVehicle,
  onChangeContractType,
  onChangeCoverage,
  onEditVehicle,
  onRemoveTrailer,
  onRemoveVehicle,
  vehicles,
}: {
  contractType: string;
  coverage: FleetCoverage;
  durationChoices: Choice[];
  onAddTrailer: (vehicleId: string) => void;
  onAddVehicle: () => void;
  onChangeContractType: (value: string) => void;
  onChangeCoverage: <K extends keyof FleetCoverage>(field: K, value: string) => void;
  onEditVehicle: (vehicleId: string) => void;
  onRemoveTrailer: (vehicleId: string, trailerId: string) => void;
  onRemoveVehicle: (vehicleId: string) => void;
  vehicles: FleetVehicle[];
}) {
  return (
    <>
      <View style={styles.card}>
        <KindField contractType={contractType} onChange={onChangeContractType} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {vehicles.length ? `Véhicules (${vehicles.length})` : "Véhicules"}
        </Text>

        {vehicles.length === 0 ? (
          <Text style={styles.cardHint}>
            {"Une flotte compte au moins un véhicule. Ajoutez le premier pour continuer."}
          </Text>
        ) : null}

        {vehicles.map((vehicle) => (
          <FleetVehicleCard
            key={vehicle.id}
            onAddTrailer={() => onAddTrailer(vehicle.id)}
            onEdit={() => onEditVehicle(vehicle.id)}
            onRemove={() => onRemoveVehicle(vehicle.id)}
            onRemoveTrailer={(trailerId) => onRemoveTrailer(vehicle.id, trailerId)}
            vehicle={vehicle}
          />
        ))}

        <Pressable
          onPress={onAddVehicle}
          style={({ pressed }) => [styles.addRow, pressed && styles.addRowPressed]}
        >
          <Feather color={colors.primary} name="plus" size={16} />
          <Text style={styles.addLabel}>Ajouter un véhicule</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Couverture</Text>
        <Text style={styles.cardHint}>
          {"Commune à toute la flotte : c'est le contrat qui la porte, pas chaque véhicule."}
        </Text>
        <CoverageFields
          duration={coverage.duration}
          durationChoices={durationChoices}
          effectDate={coverage.effectDate}
          onChangeDuration={(value) => onChangeCoverage("duration", value)}
          onChangeEffectDate={(value) => onChangeCoverage("effectDate", value)}
          periodicity={coverage.periodicity}
        />
      </View>
    </>
  );
}

function FleetVehicleCard({
  onAddTrailer,
  onEdit,
  onRemove,
  onRemoveTrailer,
  vehicle,
}: {
  onAddTrailer: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onRemoveTrailer: (trailerId: string) => void;
  vehicle: FleetVehicle;
}) {
  const complete = vehicleComplete(vehicle);

  return (
    <View style={styles.fleetCard}>
      <Pressable
        onPress={onEdit}
        style={({ pressed }) => [styles.fleetHead, pressed && styles.fleetHeadPressed]}
      >
        <View style={styles.fleetText}>
          <Text numberOfLines={1} style={styles.fleetTitle}>
            {joinMeta([vehicle.brand, vehicle.model], " ") || "Véhicule à compléter"}
          </Text>
          <Text numberOfLines={1} style={styles.fleetMeta}>
            {joinMeta([vehicle.registration, vehicle.category]) || "Aucune information"}
          </Text>
        </View>
        {/* Un véhicule incomplet bloque tout le devis : il doit se repérer dans
            la liste, pas se découvrir au moment du calcul. */}
        {complete ? null : (
          <Feather color={colors.warning} name="alert-circle" size={16} />
        )}
        <Feather color={colors.textFaint} name="chevron-right" size={16} />
      </Pressable>

      {vehicle.trailers.map((trailer) => (
        <View key={trailer.id} style={styles.trailerRow}>
          <Feather color={colors.textFaint} name="link" size={13} />
          <Text numberOfLines={1} style={styles.trailerLabel}>
            {joinMeta([trailer.registration, trailer.brand, trailer.model], " ") || "Remorque"}
          </Text>
          <Pressable
            accessibilityLabel="Retirer la remorque"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => onRemoveTrailer(trailer.id)}
          >
            <Feather color={colors.textFaint} name="x" size={14} />
          </Pressable>
        </View>
      ))}

      <View style={styles.fleetActions}>
        <Pressable
          onPress={onAddTrailer}
          style={({ pressed }) => [styles.fleetAction, pressed && styles.fleetActionPressed]}
        >
          <Feather color={colors.primary} name="plus" size={13} />
          <Text style={styles.fleetActionLabel}>Remorque</Text>
        </Pressable>
        <Pressable
          onPress={onRemove}
          style={({ pressed }) => [styles.fleetAction, pressed && styles.fleetActionPressed]}
        >
          <Feather color={colors.danger} name="trash-2" size={13} />
          <Text style={[styles.fleetActionLabel, styles.fleetActionDanger]}>Retirer</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Saisie d'un véhicule de flotte, en plein écran. */
function FleetVehicleSheet({
  categories,
  energies,
  motoUsages,
  onCancel,
  onError,
  onSave,
  vehicle: initial,
}: {
  categories: SelectOption[];
  energies: SelectOption[];
  motoUsages: SelectOption[];
  onCancel: () => void;
  onError: (message: string) => void;
  onSave: (vehicle: FleetVehicle) => void;
  vehicle: FleetVehicle;
}) {
  const insets = useSafeAreaInsets();
  // Copie de travail : fermer sans enregistrer doit laisser la flotte intacte.
  const [draft, setDraft] = useState(initial);

  const change = useCallback(
    <K extends keyof VehicleForm>(field: K, value: VehicleForm[K]) => {
      setDraft((current) => {
        if (field === "category" && value !== current.category) {
          return { ...current, category: value as string, subcategory: "" };
        }
        return { ...current, [field]: value };
      });
    },
    []
  );

  return (
    <Modal animationType="slide" onRequestClose={onCancel} visible>
      <View style={[styles.sheet, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>Véhicule</Text>
          <Pressable
            accessibilityLabel="Fermer"
            accessibilityRole="button"
            onPress={onCancel}
            style={styles.sheetClose}
          >
            <Feather color={colors.textBody} name="x" size={18} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={[
              styles.sheetBody,
              { paddingBottom: insets.bottom + spacing.xxl },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.card}>
              <VehicleFields
                categories={categories}
                energies={energies}
                motoUsages={motoUsages}
                onChangeField={change}
                onError={onError}
                vehicle={draft}
              />
            </View>
            <View style={styles.actions}>
              <PrimaryButton label="Annuler" onPress={onCancel} tone="ghost" />
              <PrimaryButton
                disabled={!vehicleComplete(draft)}
                label="Enregistrer"
                onPress={() => onSave(draft)}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Saisie d'une remorque : trois champs, ASS n'en demande pas plus. */
function TrailerSheet({
  onCancel,
  onSave,
  tractorLabel,
}: {
  onCancel: () => void;
  onSave: (trailer: TrailerForm) => void;
  tractorLabel: string;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<TrailerForm>(EMPTY_TRAILER);
  const ready = Boolean(draft.brand.trim() && draft.model.trim() && draft.registration.trim());

  return (
    <Modal animationType="slide" onRequestClose={onCancel} visible>
      <View style={[styles.sheet, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>Remorque</Text>
          <Pressable
            accessibilityLabel="Fermer"
            accessibilityRole="button"
            onPress={onCancel}
            style={styles.sheetClose}
          >
            <Feather color={colors.textBody} name="x" size={18} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={[
              styles.sheetBody,
              { paddingBottom: insets.bottom + spacing.xxl },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.card}>
              <Text style={styles.cardHint}>{`Attelée à ${tractorLabel}.`}</Text>
              <Field label="Marque" required>
                <TextField
                  autoCapitalize="characters"
                  onChangeText={(value) => setDraft((c) => ({ ...c, brand: value }))}
                  placeholder="REMORQUE"
                  value={draft.brand}
                />
              </Field>
              <Field label="Modèle" required>
                <TextField
                  autoCapitalize="characters"
                  onChangeText={(value) => setDraft((c) => ({ ...c, model: value }))}
                  placeholder="STANDARD"
                  value={draft.model}
                />
              </Field>
              <Field label="Immatriculation" required>
                <TextField
                  autoCapitalize="characters"
                  onChangeText={(value) =>
                    setDraft((c) => ({ ...c, registration: value.toUpperCase() }))
                  }
                  placeholder="REM-001"
                  value={draft.registration}
                />
              </Field>
            </View>
            <View style={styles.actions}>
              <PrimaryButton label="Annuler" onPress={onCancel} tone="ghost" />
              <PrimaryButton
                disabled={!ready}
                label="Ajouter"
                onPress={() => onSave(draft)}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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
          {"La responsabilité civile est toujours incluse. Ces garanties s'y ajoutent."}
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
  fleetCoverage,
  fleetVehicles,
  guaranteeList,
  guarantees,
  isFleet,
  policyholder,
  quote,
  vehicle,
}: {
  contractType: string;
  fleetCoverage: FleetCoverage;
  fleetVehicles: FleetVehicle[];
  guaranteeList: SelectOption[];
  guarantees: number[];
  isFleet: boolean;
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

  // La couverture est portée par la flotte ou par le véhicule selon le produit.
  const coverage = isFleet
    ? {
        duration: fleetCoverage.duration,
        effectDate: fleetCoverage.effectDate,
        periodicity: fleetCoverage.periodicity,
        unit: fleetCoverage.periodicity === "JOUR" ? "jour(s)" : "mois",
      }
    : {
        duration: vehicle.duration,
        effectDate: vehicle.effectDate,
        periodicity: vehicle.periodicity,
        unit: vehicle.periodicity === "JOUR" ? "jour(s)" : "mois",
      };
  const coverageEnd = coverageEndIso(
    coverage.effectDate,
    coverage.duration,
    coverage.periodicity
  );

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

      {/* Ventilation d'une flotte : ASS renvoie une prime PAR véhicule et par
          remorque. Un total unique sur douze véhicules n'apprendrait rien à
          l'apporteur, et il ne pourrait pas repérer la ligne aberrante. */}
      {isFleet && quote.items?.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Par véhicule</Text>
          {quote.items.map((item) => (
            <QuoteRow
              key={item.request_id}
              label={fleetItemLabel(item, fleetVehicles)}
              value={formatFcfa(item.prime_rc_ass)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contrat</Text>
        <QuoteRow
          label={isFleet ? "Flotte" : "Véhicule"}
          value={
            isFleet
              ? `${fleetVehicles.length} véhicule(s), ${countTrailers(fleetVehicles)} remorque(s)`
              : joinMeta([vehicle.brand, vehicle.model, vehicle.registration], " ") || "—"
          }
        />
        <QuoteRow
          label="Type"
          value={contractTypeLabel(contractType === "AUTO_MONO" && !isFleet ? "AUTO_MONO" : contractType)}
        />
        <QuoteRow
          label="Souscripteur"
          value={joinMeta([policyholder.firstName, policyholder.lastName], " ") || "—"}
        />
        {/* La PÉRIODE, pas seulement la durée. « 12 mois » n'apprend rien à un
            apporteur qui doit annoncer une date de fin à son client, et le web
            ne l'affiche pas non plus. La borne est calculée comme le backend
            l'enverra à ASS. */}
        <QuoteRow label="Date d'effet" value={formatDate(coverage.effectDate)} />
        <QuoteRow
          label="Jusqu'au"
          value={
            coverageEnd
              ? `${formatDate(coverageEnd)} inclus`
              : joinMeta([coverage.duration, coverage.unit], " ") || "—"
          }
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

/**
 * Libellé d'une ligne de devis de flotte.
 *
 * ASS renvoie souvent l'identifiant local en guise de libellé
 * (« veh-local-1 ») : on lui préfère la marque et l'immatriculation saisies,
 * que l'apporteur reconnaît.
 */
function fleetItemLabel(item: QuoteItem, vehicles: FleetVehicle[]) {
  if (item.kind === "TRAILER") {
    return `Remorque ${item.label}`;
  }
  const vehicle = vehicles.find((entry) => entry.id === item.request_id);
  if (!vehicle) {
    return item.label;
  }
  return joinMeta([vehicle.brand, vehicle.registration], " ") || item.label;
}

function countTrailers(vehicles: FleetVehicle[]) {
  return vehicles.reduce((total, entry) => total + entry.trailers.length, 0);
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.quoteRow}>
      <Text style={styles.quoteRowLabel}>{label}</Text>
      <Text style={styles.quoteRowValue}>{value}</Text>
    </View>
  );
}

/* ── Lecture d'un brouillon existant ─────────────────────────────────────── */

/**
 * Le brouillon revient du backend en JSON libre (`Record<string, unknown>`) :
 * c'est du texte saisi ailleurs — sur le web, ou par une version antérieure de
 * cette application — et rien ne garantit sa forme.
 *
 * D'où une lecture champ par champ plutôt qu'un `{ ...payload.vehicle }` : le
 * décalage introduirait dans l'état du formulaire des clés qu'il ne connaît
 * pas, et surtout une valeur d'un type inattendu — un nombre là où le champ
 * attend une chaîne — passerait sans bruit jusqu'à `TextInput`.
 *
 * Les noms de champs sont ceux du web (`vehicle.fiscalPower`,
 * `sameAsPolicyholder`…) : c'est un format partagé entre les deux clients, pas
 * une invention du mobile.
 */
function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Lit une valeur en chaîne. Les nombres sont convertis, le reste est ignoré. */
function readText(source: Record<string, unknown> | undefined, key: string) {
  const value = source?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function readVehicle(raw: unknown): VehicleForm {
  const source = readRecord(raw);
  if (!source) {
    return EMPTY_VEHICLE;
  }
  return {
    brand: readText(source, "brand"),
    model: readText(source, "model"),
    category: readText(source, "category"),
    subcategory: readText(source, "subcategory"),
    registration: readText(source, "registration"),
    energy: readText(source, "energy"),
    fiscalPower: readText(source, "fiscalPower"),
    seats: readText(source, "seats"),
    cylindree: readText(source, "cylindree"),
    // Ces deux-là ne sont pas saisis sur cet écran : vides, ils partiraient
    // vides à ASS. On retombe donc sur le défaut plutôt que sur la chaîne vide.
    motoUsage: readText(source, "motoUsage") || EMPTY_VEHICLE.motoUsage,
    personType: readText(source, "personType") || EMPTY_VEHICLE.personType,
    // La couverture, elle, reste telle qu'elle a été laissée : la compléter
    // d'office avec la date du jour ferait signer une date que personne n'a
    // choisie. Vide, le champ est visiblement vide et bloque l'étape.
    effectDate: readText(source, "effectDate"),
    duration: readText(source, "duration"),
    periodicity: readText(source, "periodicity"),
  };
}

/**
 * Véhicules d'une flotte, avec leurs remorques.
 *
 * Les identifiants du brouillon sont CONSERVÉS : c'est eux qu'ASS a vus au
 * devis précédent, et c'est eux qui rattachent une remorque à son tracteur.
 * En fabriquer de nouveaux à chaque relecture ferait perdre l'attelage.
 */
function readFleetVehicles(raw: unknown): FleetVehicle[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((entry, index) => {
    const source = readRecord(entry);
    const id = readText(source, "id") || `veh-local-${index + 1}`;
    return {
      ...readVehicle(entry),
      id,
      trailers: readTrailers(source?.trailers, id),
    };
  });
}

function readTrailers(raw: unknown, tractorVehicleId: string): Trailer[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((entry, index) => {
    const source = readRecord(entry);
    return {
      brand: readText(source, "brand"),
      model: readText(source, "model"),
      registration: readText(source, "registration"),
      id: readText(source, "id") || `rem-local-${tractorVehicleId}-${index + 1}`,
      tractorVehicleId: readText(source, "tractorVehicleId") || tractorVehicleId,
      tractorLabel: readText(source, "tractorLabel"),
    };
  });
}

function readPerson(raw: unknown): PersonForm {
  const source = readRecord(raw);
  if (!source) {
    return EMPTY_PERSON;
  }
  return {
    firstName: readText(source, "firstName"),
    lastName: readText(source, "lastName"),
    phone: readText(source, "phone"),
    email: readText(source, "email"),
    address: readText(source, "address"),
  };
}

/** Identifiants de garanties. Les entrées d'un autre type sont écartées. */
function readGuarantees(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
}

function readGuaranteeOptions(raw: unknown): Record<string, string> {
  const source = readRecord(raw);
  if (!source) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""
    )
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

/**
 * Champs qu'ASS attend mais que personne ne saisit. Repris de
 * `normalizeVehicleForPayload` (web) : le châssis reste vide, les valeurs à
 * zéro, et la date de première mise en circulation part en dur. Les changer
 * ici ferait diverger deux clients du même backend.
 */
function normalizeVehicle(vehicle: VehicleForm) {
  const chargeUtile = chargeUtileFor(vehicle.subcategory);
  return {
    ...vehicle,
    chassis: "",
    currentValue: "0",
    firstCirculationDate: DEFAULT_FIRST_CIRCULATION_DATE,
    newValue: "0",
    ...(chargeUtile !== null ? { chargeUtile } : {}),
  };
}

function buildDraftPayload({
  fleetCoverage,
  fleetVehicles,
  guaranteeOptions,
  guarantees,
  insured,
  isFleet,
  policyholder,
  sameAsPolicyholder,
  vehicle,
}: {
  fleetCoverage: FleetCoverage;
  fleetVehicles: FleetVehicle[];
  guaranteeOptions: Record<string, string>;
  guarantees: number[];
  insured: PersonForm;
  isFleet: boolean;
  policyholder: PersonForm;
  sameAsPolicyholder: boolean;
  vehicle: VehicleForm;
}) {
  const parties = {
    guarantees,
    // Les options d'une garantie décochée entre-temps traînent dans l'état :
    // les envoyer ferait refuser le devis par ASS.
    guaranteeOptions: cleanGuaranteeOptions(guaranteeOptions),
    policyholder,
    insured: sameAsPolicyholder ? policyholder : insured,
    sameAsPolicyholder,
    source: "mobile-new-contract",
  };

  if (isFleet) {
    return {
      // La couverture est portée par la FLOTTE, pas par chaque véhicule : le
      // backend la valide à cet endroit (`FLEET_COVERAGE_FIELDS`) et refuse le
      // devis si elle manque. Les champs de couverture restent néanmoins dans
      // chaque véhicule, vides — c'est la forme que le web produit, et ce
      // n'est pas au mobile de l'alléger unilatéralement.
      fleet: {
        effectDate: fleetCoverage.effectDate,
        duration: fleetCoverage.duration,
        periodicity: fleetCoverage.periodicity,
        personType: fleetCoverage.personType,
        vehicles: fleetVehicles.map((entry) => ({
          ...normalizeVehicle(entry),
          trailers: entry.trailers,
        })),
      },
      ...parties,
    };
  }

  return { vehicle: normalizeVehicle(vehicle), ...parties };
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

/**
 * Un véhicule est-il saisissable en l'état ?
 *
 * La couverture n'en fait PAS partie : en flotte elle est portée par le
 * contrat, et un véhicule complet n'a pas à porter de date.
 */
function vehicleComplete(vehicle: VehicleForm) {
  const isMoto = vehicle.category === MOTO_CATEGORY;
  return Boolean(
    vehicle.brand &&
      vehicle.model &&
      vehicle.category &&
      vehicle.subcategory &&
      vehicle.registration &&
      vehicle.energy &&
      (isMoto
        ? !cylindreeMessage(vehicle.subcategory, vehicle.cylindree)
        : vehicle.fiscalPower && seatsValid(vehicle))
  );
}

/** Libellé du tracteur, pour la feuille d'ajout de remorque. */
function tractorLabel(vehicles: FleetVehicle[], vehicleId: string) {
  const tractor = vehicles.find((entry) => entry.id === vehicleId);
  if (!tractor) {
    return "ce véhicule";
  }
  return (
    joinMeta([tractor.brand, tractor.model, tractor.registration], " ") || "ce véhicule"
  );
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

function toChoices(options: SelectOption[]): Choice[] {
  return options.map((option) => ({
    value: String(option.value),
    label: option.label,
    enabled: option.enabled,
  }));
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  addLabel: { color: colors.primary, fontSize: 14, fontWeight: "800" },
  addRow: {
    alignItems: "center",
    borderColor: colors.primaryMuted,
    borderRadius: radius.md,
    borderStyle: "dashed",
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    paddingVertical: spacing.lg,
  },
  addRowPressed: { backgroundColor: colors.primarySubtle },
  fleetAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  fleetActionDanger: { color: colors.danger },
  fleetActionLabel: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  fleetActionPressed: { opacity: 0.6 },
  fleetActions: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  fleetCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fleetHead: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  fleetHeadPressed: { opacity: 0.6 },
  fleetMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  // `flex: 1` et non `flexShrink` : sans base explicite, la colonne est
  // dimensionnée sur son contenu et le libellé se fait tronquer alors que la
  // place reste libre à côté du chevron (voir README).
  fleetText: { flex: 1 },
  fleetTitle: { color: colors.textStrong, fontSize: 14, fontWeight: "800" },
  centered: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.xl,
    justifyContent: "center",
    padding: spacing.xl,
  },
  // `alignSelf: "stretch"` : dans un conteneur centré, Android ampute le
  // dernier fragment d'un texte mesuré sur son propre contenu (voir README).
  centeredText: {
    alignSelf: "stretch",
    color: colors.textBody,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
  },
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
  sheet: { backgroundColor: colors.background, flex: 1 },
  sheetBody: { padding: spacing.lg },
  sheetClose: {
    alignItems: "center",
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  sheetHead: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  sheetTitle: { color: colors.textStrong, flex: 1, fontSize: 18, fontWeight: "900" },
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
  trailerLabel: { color: colors.textMuted, flex: 1, fontSize: 12, fontWeight: "600" },
  trailerRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  warning: { color: colors.warning, fontSize: 12, marginTop: spacing.sm },
});
