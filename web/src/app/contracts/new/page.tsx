"use client";

import {
  ArrowLeftRight,
  Bike,
  BusFront,
  CalendarRange,
  Car,
  CarFront,
  Check,
  CloudCheck,
  CreditCard,
  FileCheck,
  FileText,
  Flame,
  LoaderCircle,
  Lock,
  Scale,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
  TriangleAlert,
  UserRound,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { DatePicker } from "@/components/DatePicker";
import { SelectSearch } from "@/components/SelectSearch";
import { AlertMessage, StatusBadge } from "@/components/ui";
import {
  calculateContractQuote,
  confirmContractPayment,
  createContractDraft,
  createVehicleBrand,
  fetchContractDraft,
  fetchGuaranteeOptionReferentials,
  fetchOptions,
  fetchVehicleBrands,
  issueContract,
  updateContractDraft,
  verifyAssRegistration,
  type AssRegistrationVerification,
  type ConfirmedPayment,
  type ContractQuote,
  type GuaranteeOptionReferential,
  type IssueResult,
  type SelectOption,
} from "@/lib/api";
import {
  canConfirmContractPayment,
  canCreateContract,
  canManageContractWorkflow,
} from "@/lib/permissions";

type VehicleForm = {
  brand: string;
  model: string;
  category: string;
  subcategory: string;
  registration: string;
  chassis: string;
  energy: string;
  fiscalPower: string;
  seats: string;
  firstCirculationDate: string;
  newValue: string;
  currentValue: string;
  cylindree: string;
  motoUsage: string;
  effectDate: string;
  duration: string;
  periodicity: string;
  personType: string;
};

type TrailerForm = {
  brand: string;
  model: string;
  registration: string;
};

type PersonForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
};

type GuaranteeOptionsForm = {
  garantiesOptPT: string;
  garantiesOptAR: string;
  garantiesOptAS: string;
};

type RegistrationLookupState = "idle" | "checking" | "found" | "not_found" | "error";

type Trailer = TrailerForm & {
  id: string;
  tractorVehicleId: string;
  tractorLabel: string;
};

type FleetVehicle = VehicleForm & {
  id: string;
  trailers: Trailer[];
};

const DEFAULT_FIRST_CIRCULATION_DATE = "2000-01-01";

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

const emptyVehicle: VehicleForm = {
  brand: "",
  model: "",
  category: "",
  subcategory: "",
  registration: "",
  chassis: "",
  energy: "",
  fiscalPower: "",
  seats: "",
  firstCirculationDate: DEFAULT_FIRST_CIRCULATION_DATE,
  newValue: "0",
  currentValue: "0",
  cylindree: "",
  motoUsage: "non_commerciale",
  effectDate: "",
  duration: "",
  periodicity: "MOIS",
  personType: "PHYSIQUE",
};

const emptyTrailer: TrailerForm = {
  brand: "",
  model: "",
  registration: "",
};

const emptyPerson: PersonForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  address: "",
};

type GarageForm = {
  subcategory: string;
  nombreCarte: string;
  registration: string;
  effectDate: string;
  duration: string;
  periodicity: string;
  personType: string;
};

// Champs de couverture au niveau flotte (dateEffet/durée/périodicité communs à tous les véhicules)
type FleetCoverage = {
  effectDate: string;
  duration: string;
  periodicity: string;
  personType: string;
};

const emptyGuaranteeOptions: GuaranteeOptionsForm = {
  garantiesOptPT: "",
  garantiesOptAR: "",
  garantiesOptAS: "",
};

const emptyGarage: GarageForm = {
  subcategory: "",
  nombreCarte: "",
  registration: "",
  effectDate: "",
  duration: "",
  periodicity: "MOIS",
  personType: "PHYSIQUE",
};

const emptyFleetCoverage: FleetCoverage = {
  effectDate: "",
  duration: "",
  periodicity: "MOIS",
  personType: "MORALE",
};

const durationOptions = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1} mois`,
}));

const VALID_CONTRACT_TYPES = ["AUTO_MONO", "FLEET", "BUS_SCHOOL", "GARAGE"] as const;

export default function NewContractPage() {
  return (
    <Suspense fallback={null}>
      <NewContractPageContent />
    </Suspense>
  );
}

function NewContractPageContent() {
  const { auth, isLoading: isAuthLoading } = useAuth();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [contractType, setContractType] = useState(() => {
    const type = searchParams.get("type")?.toUpperCase();
    return type && (VALID_CONTRACT_TYPES as readonly string[]).includes(type)
      ? type
      : "AUTO_MONO";
  });
  const [vehicle, setVehicle] = useState<VehicleForm>(emptyVehicle);
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicle[]>([]);
  const [selectedGuarantees, setSelectedGuarantees] = useState<number[]>([]);
  const [guaranteeOptions, setGuaranteeOptions] =
    useState<GuaranteeOptionsForm>(emptyGuaranteeOptions);
  const [policyholder, setPolicyholder] = useState<PersonForm>(emptyPerson);
  const [insured, setInsured] = useState<PersonForm>(emptyPerson);
  const [sameAsPolicyholder, setSameAsPolicyholder] = useState(true);
  const [editingVehicleId, setEditingVehicleId] = useState("");
  const [trailerTargetVehicleId, setTrailerTargetVehicleId] = useState("");
  const [trailerForm, setTrailerForm] = useState<TrailerForm>(emptyTrailer);
  const [contractTypes, setContractTypes] = useState<SelectOption[]>([]);
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [subcategories, setSubcategories] = useState<SelectOption[]>([]);
  const [brands, setBrands] = useState<SelectOption[]>([]);
  const [energies, setEnergies] = useState<SelectOption[]>([]);
  const [guarantees, setGuarantees] = useState<SelectOption[]>([]);
  const [guaranteeOptionReferentials, setGuaranteeOptionReferentials] = useState<
    GuaranteeOptionReferential[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [savedDraftId, setSavedDraftId] = useState<number | null>(null);
  const [quote, setQuote] = useState<ContractQuote | null>(null);
  const [payment, setPayment] = useState<ConfirmedPayment | null>(null);
  const [issueResult, setIssueResult] = useState<IssueResult | null>(null);
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showErrors, setShowErrors] = useState(false);
  const [garage, setGarage] = useState<GarageForm>(emptyGarage);
  const [fleetCoverage, setFleetCoverage] = useState<FleetCoverage>(emptyFleetCoverage);
  const [registrationLookupState, setRegistrationLookupState] =
    useState<RegistrationLookupState>("idle");
  const [registrationLookupMessage, setRegistrationLookupMessage] = useState("");
  const [error, setError] = useState("");
  const savedDraftIdRef = useRef<number | null>(null);
  const draftSavePromiseRef = useRef<Promise<number | null> | null>(null);
  const registrationLookupRequestRef = useRef(0);
  const lastRegistrationLookupRef = useRef("");
  const isEditingDraft = savedDraftId !== null && !quote && !payment && !issueResult;

  useEffect(() => {
    Promise.all([
      fetchOptions("/referentials/contract-types/"),
      fetchOptions("/referentials/vehicle-categories/"),
      fetchVehicleBrands(),
      fetchOptions("/referentials/energies/"),
      fetchOptions("/referentials/guarantees/"),
      fetchGuaranteeOptionReferentials(),
    ])
      .then(
        ([
          typeData,
          categoryData,
          brandData,
          energyData,
          guaranteeData,
          guaranteeOptionData,
        ]) => {
          setContractTypes(typeData);
          setCategories(categoryData.filter((item) => item.value !== "REMORQUE"));
          setBrands(brandData);
          setEnergies(energyData);
          setGuarantees(guaranteeData);
          setGuaranteeOptionReferentials(guaranteeOptionData);
        },
      )
      .catch((apiError: Error) => setError(apiError.message));
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadDraftFromQuery() {
      if (typeof window === "undefined") {
        return;
      }
      const draftIdParam = new URLSearchParams(window.location.search).get("draftId");
      const draftId = Number(draftIdParam);
      if (!draftIdParam || !Number.isFinite(draftId)) {
        return;
      }

      try {
        const draft = await fetchContractDraft(draftId);
        if (isCancelled) {
          return;
        }
        const hydratedPayload = hydrateDraftPayload(draft.contract_type, draft.draft_payload);
        setContractType(toDisplayContractType(draft.contract_type));
        setSavedDraftId(draft.id);
        savedDraftIdRef.current = draft.id;
        setVehicle(hydratedPayload.vehicle);
        setFleetVehicles(hydratedPayload.fleetVehicles);
        setFleetCoverage(hydratedPayload.fleetCoverage ?? emptyFleetCoverage);
        setGarage(hydratedPayload.garage);
        setSelectedGuarantees(hydratedPayload.selectedGuarantees);
        setGuaranteeOptions(hydratedPayload.guaranteeOptions);
        setPolicyholder(hydratedPayload.policyholder);
        setInsured(hydratedPayload.insured);
        setSameAsPolicyholder(hydratedPayload.sameAsPolicyholder);
        setEditingVehicleId("");
        setTrailerTargetVehicleId("");
        setTrailerForm(emptyTrailer);
        registrationLookupRequestRef.current += 1;
        lastRegistrationLookupRef.current = "";
        setRegistrationLookupState("idle");
        setRegistrationLookupMessage("");
        setQuote(null);
        setPayment(null);
        setIssueResult(null);
        setStep(1);
      } catch (apiError) {
        if (!isCancelled) {
          setError(apiError instanceof Error ? apiError.message : "Brouillon introuvable.");
        }
      }
    }

    void loadDraftFromQuery();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const query = vehicle.category
      ? `category=${vehicle.category}`
      : `contract_type=${contractType}`;
    fetchOptions(`/referentials/vehicle-subcategories/?${query}`)
      .then(setSubcategories)
      .catch((apiError: Error) => setError(apiError.message));
  }, [contractType, vehicle.category]);


  const displayContractTypes = useMemo(
    () =>
      contractTypes
        .filter((option) =>
          ["AUTO_MONO", "FLEET", "BUS_SCHOOL", "GARAGE"].includes(String(option.value)),
        )
        .map((option) =>
          option.value === "AUTO_MONO" ? { ...option, label: "Auto mono" } : option,
        ),
    [contractTypes],
  );
  const selectedContractType = useMemo(
    () => displayContractTypes.find((option) => String(option.value) === contractType),
    [contractType, displayContractTypes],
  );
  const selectedTrailerTarget = fleetVehicles.find(
    (fleetVehicle) => fleetVehicle.id === trailerTargetVehicleId,
  );

  const isFleet = contractType === "FLEET";
  const isBusSchool = contractType === "BUS_SCHOOL";
  const isGarage = contractType === "GARAGE";
  const isMoto = !isFleet && !isBusSchool && !isGarage && vehicle.category === "C5";
  const effectiveContractType = isMoto ? "MOTO" : contractType;
  const coverageSource = isFleet ? fleetCoverage : vehicle;
  const summaryOptionLabels = guaranteeLabels(guarantees, selectedGuarantees);
  const summaryOptionText = guaranteeOptionSummary(guaranteeOptions);

  useEffect(() => {
    const registration = normalizeRegistrationLookup(vehicle.registration);
    if (isGarage || registration.length < 5 || lastRegistrationLookupRef.current === registration) {
      return;
    }

    const requestId = ++registrationLookupRequestRef.current;
    const timeout = window.setTimeout(async () => {
      setRegistrationLookupState("checking");
      setRegistrationLookupMessage("Recherche automatique dans ASS...");
      try {
        const response = await verifyAssRegistration(registration);
        if (registrationLookupRequestRef.current !== requestId) {
          return;
        }
        lastRegistrationLookupRef.current = registration;

        if (response.is_registered) {
          // L'API réelle ne renvoie jamais les données du véhicule : on garde le
          // pré-remplissage par compatibilité si elle évolue, mais le cas normal
          // est un simple avertissement « déjà assuré » avec le nom de l'assureur.
          const assVehicle = response.vehicle;
          if (assVehicle) {
            setVehicle((current) => mergeAssVehicleData(current, assVehicle));
            if (assVehicle.brand) {
              setBrands((current) =>
                upsertOption(current, {
                  value: assVehicle.brand,
                  label: assVehicle.brand,
                }),
              );
            }
          }
          setRegistrationLookupState("found");
          setRegistrationLookupMessage(
            response.operation_message ||
              "Ce véhicule dispose déjà d'une assurance digitale active.",
          );
          return;
        }

        setRegistrationLookupState("not_found");
        setRegistrationLookupMessage(
          "Immatriculation libre : aucune assurance digitale active.",
        );
      } catch {
        if (registrationLookupRequestRef.current !== requestId) {
          return;
        }
        setRegistrationLookupState("error");
        setRegistrationLookupMessage(
          "Vérification ASS indisponible. Vous pouvez continuer la saisie manuellement.",
        );
      }
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [isGarage, vehicle.registration]);
  const canSaveVehicle = Boolean(
    vehicle.brand &&
      vehicle.model &&
      vehicle.category &&
      vehicle.subcategory &&
      vehicle.energy &&
      (isFleet || vehicle.effectDate) &&
      (isFleet || vehicle.duration) &&
      (isFleet || vehicle.periodicity) &&
      vehicle.registration &&
      (isMoto ? (vehicle.cylindree && !getCylindreeError(vehicle.subcategory, vehicle.cylindree)) : vehicle.fiscalPower) &&
      (isMoto || (
        vehicle.seats.trim() &&
        (vehicle.category !== "C1" || Number(vehicle.seats) >= 5)
      )),
  );
  const canSaveFleetCoverage = Boolean(
    fleetCoverage.effectDate && fleetCoverage.duration && fleetCoverage.periodicity,
  );
  const canSaveGarage = Boolean(
    garage.subcategory &&
      garage.nombreCarte &&
      garage.effectDate &&
      garage.duration &&
      garage.periodicity,
  );
  const canSaveTrailer = Boolean(
    trailerTargetVehicleId && trailerForm.registration,
  );
  const canContinueParties = hasRequiredPerson(policyholder) && (
    sameAsPolicyholder || hasRequiredPerson(insured)
  );
  const canCalculateQuote = Boolean(
    selectedContractType?.enabled &&
      (isFleet
        ? fleetVehicles.length > 0 && canSaveFleetCoverage
        : isGarage
          ? canSaveGarage
          : canSaveVehicle) &&
      canContinueParties,
  );
  const hasDraftContent = Boolean(
    Object.values(policyholder).some((value) => value.trim()) ||
      Object.values(insured).some((value) => value.trim()) ||
      [
        vehicle.brand,
        vehicle.model,
        vehicle.category,
        vehicle.subcategory,
        vehicle.registration,
        vehicle.energy,
        vehicle.fiscalPower,
        vehicle.seats,
        vehicle.effectDate,
        vehicle.cylindree,
      ].some((value) => value.trim()) ||
      fleetVehicles.length ||
      selectedGuarantees.length,
  );
  const canAutoSave =
    hasDraftContent &&
    (!isFleet || fleetVehicles.length > 0) &&
    (!isGarage || canSaveGarage);

  function clearCalculatedState() {
    setQuote(null);
    setPayment(null);
    setIssueResult(null);
  }

  function goToStep(nextStep: number) {
    setStep(nextStep);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }

  function resetRegistrationLookup() {
    registrationLookupRequestRef.current += 1;
    lastRegistrationLookupRef.current = "";
    setRegistrationLookupState("idle");
    setRegistrationLookupMessage("");
  }

  function updateVehicle(field: keyof VehicleForm, value: string) {
    clearCalculatedState();
    if (field === "registration") {
      resetRegistrationLookup();
    }
    const normalizedValue = field === "registration" ? sanitizeRegistration(value) : value;
    setVehicle((current) => {
      const next = {
        ...current,
        [field]: normalizedValue,
        ...(field === "category" ? { subcategory: "" } : {}),
      };
      if (field === "category" && normalizedValue === "C5") {
        next.fiscalPower = "";
        next.motoUsage = "non_commerciale";
      }
      if (field === "category" && normalizedValue !== "C5") {
        next.cylindree = "";
        next.motoUsage = "non_commerciale";
      }
      return next;
    });
  }

  function updateGarage(field: keyof GarageForm, value: string) {
    clearCalculatedState();
    const normalizedValue = field === "registration" ? sanitizeRegistration(value) : value;
    setGarage((current) => ({ ...current, [field]: normalizedValue }));
  }

  function updateTrailer(field: keyof TrailerForm, value: string) {
    clearCalculatedState();
    const normalizedValue = field === "registration" ? sanitizeRegistration(value) : value;
    setTrailerForm((current) => ({ ...current, [field]: normalizedValue }));
  }

  async function addVehicleBrand(label: string) {
    setError("");
    try {
      const brand = await createVehicleBrand(label);
      setBrands((current) => upsertOption(current, brand));
      return brand;
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Creation marque impossible.");
      return undefined;
    }
  }

  function resetContractType(value: string) {
    const nextDraftId = isEditingDraft ? savedDraftIdRef.current : null;
    setShowErrors(false);
    setContractType(value);
    setVehicle(defaultVehicleForm());
    setGarage(emptyGarage);
    setFleetCoverage(emptyFleetCoverage);
    setFleetVehicles([]);
    setSelectedGuarantees([]);
    setGuaranteeOptions(emptyGuaranteeOptions);
    setPolicyholder(emptyPerson);
    setInsured(emptyPerson);
    setSameAsPolicyholder(true);
    setEditingVehicleId("");
    setTrailerTargetVehicleId("");
    setTrailerForm(emptyTrailer);
    resetRegistrationLookup();
    setSavedDraftId(nextDraftId);
    savedDraftIdRef.current = nextDraftId;
    setQuote(null);
    setPayment(null);
    setIssueResult(null);
  }

  async function continueToOptions() {
    setShowErrors(true);
    if (!canCalculateQuote) {
      return;
    }
    const draftId = await saveDraft();
    if (draftId) {
      goToStep(2);
    }
  }

  function toggleGuarantee(value: number) {
    clearCalculatedState();
    setSelectedGuarantees((current) => {
      const isRemoving = current.includes(value);
      const next = isRemoving
        ? current.filter((selected) => selected !== value)
        : [...current, value].sort((left, right) => left - right);
      if (isRemoving) {
        const fieldsToClear = guaranteeOptionReferentials
          .filter(
            (referential) =>
              referential.trigger_guarantee === value ||
              (referential.trigger_guarantee === null && !next.length),
          )
          .map((referential) => referential.field);
        if (fieldsToClear.length) {
          setGuaranteeOptions((currentOptions) => ({
            ...currentOptions,
            ...Object.fromEntries(fieldsToClear.map((field) => [field, ""])),
          }));
        }
      }
      return next;
    });
  }

  function updateGuaranteeOption(field: keyof GuaranteeOptionsForm, value: string) {
    clearCalculatedState();
    setGuaranteeOptions((current) => ({ ...current, [field]: value }));
  }

  function updatePolicyholder(field: keyof PersonForm, value: string) {
    clearCalculatedState();
    const normalizedValue = field === "phone" ? sanitizePhone(value) : value;
    setPolicyholder((current) => ({ ...current, [field]: normalizedValue }));
  }

  function saveFleetVehicle() {
    if (!canSaveVehicle) {
      return;
    }

    clearCalculatedState();
    if (editingVehicleId) {
      setFleetVehicles((current) =>
        current.map((fleetVehicle) =>
          fleetVehicle.id === editingVehicleId
            ? { ...vehicle, id: fleetVehicle.id, trailers: fleetVehicle.trailers }
            : fleetVehicle,
        ),
      );
      setEditingVehicleId("");
    } else {
      setFleetVehicles((current) => [
        ...current,
        { ...vehicle, id: createId("veh"), trailers: [] },
      ]);
    }

    setVehicle(defaultVehicleForm());
    resetRegistrationLookup();
  }

  function editFleetVehicle(vehicleId: string) {
    const selected = fleetVehicles.find((fleetVehicle) => fleetVehicle.id === vehicleId);
    if (!selected) {
      return;
    }
    setVehicle(toVehicleForm(selected));
    resetRegistrationLookup();
    setEditingVehicleId(vehicleId);
    setTrailerTargetVehicleId("");
  }

  function deleteFleetVehicle(vehicleId: string) {
    clearCalculatedState();
    setFleetVehicles((current) => current.filter((fleetVehicle) => fleetVehicle.id !== vehicleId));
    if (editingVehicleId === vehicleId) {
      setEditingVehicleId("");
      setVehicle(defaultVehicleForm());
      resetRegistrationLookup();
    }
    if (trailerTargetVehicleId === vehicleId) {
      setTrailerTargetVehicleId("");
      setTrailerForm(emptyTrailer);
    }
  }

  function startTrailerForm(vehicleId: string) {
    setTrailerTargetVehicleId(vehicleId);
    setTrailerForm(emptyTrailer);
  }

  function addTrailer() {
    if (!selectedTrailerTarget || !canSaveTrailer) {
      return;
    }

    const trailer: Trailer = {
      ...trailerForm,
      id: createId("rem"),
      tractorVehicleId: selectedTrailerTarget.id,
      tractorLabel: vehicleLabel(selectedTrailerTarget),
    };

    clearCalculatedState();
    setFleetVehicles((current) =>
      current.map((fleetVehicle) =>
        fleetVehicle.id === selectedTrailerTarget.id
          ? { ...fleetVehicle, trailers: [...fleetVehicle.trailers, trailer] }
          : fleetVehicle,
      ),
    );
    setTrailerForm(emptyTrailer);
    setTrailerTargetVehicleId("");
  }

  function removeTrailer(vehicleId: string, trailerId: string) {
    clearCalculatedState();
    setFleetVehicles((current) =>
      current.map((fleetVehicle) =>
        fleetVehicle.id === vehicleId
          ? {
              ...fleetVehicle,
              trailers: fleetVehicle.trailers.filter((trailer) => trailer.id !== trailerId),
            }
          : fleetVehicle,
      ),
    );
  }

  const saveDraft = useCallback(async (silent = false) => {
    if (draftSavePromiseRef.current) {
      return draftSavePromiseRef.current;
    }

    const operation = async () => {
      setSaving(true);
      setAutoSaveState("saving");
      if (!silent) {
        setError("");
      }
      try {
        const payload = {
          contract_type: effectiveContractType,
          draft_payload: buildDraftPayload({
            isFleet,
            isGarage,
            fleetVehicles,
            fleetCoverage,
            garage,
            guaranteeOptions,
            vehicle,
            selectedGuarantees,
            policyholder,
            insured,
            sameAsPolicyholder,
          }),
        };
        const currentDraftId = savedDraftIdRef.current;
        const draft = currentDraftId
          ? await updateContractDraft(currentDraftId, payload)
          : await createContractDraft(payload);
        savedDraftIdRef.current = draft.id;
        setSavedDraftId(draft.id);
        setAutoSaveState("saved");
        return draft.id;
      } catch (apiError) {
        setAutoSaveState("error");
        setError(apiError instanceof Error ? apiError.message : "Erreur inconnue");
        return null;
      } finally {
        setSaving(false);
        draftSavePromiseRef.current = null;
      }
    };

    draftSavePromiseRef.current = operation();
    return draftSavePromiseRef.current;
  }, [
    effectiveContractType,
    fleetCoverage,
    fleetVehicles,
    garage,
    guaranteeOptions,
    insured,
    isFleet,
    isGarage,
    policyholder,
    sameAsPolicyholder,
    selectedGuarantees,
    vehicle,
  ]);

  useEffect(() => {
    if (!canAutoSave || quote || payment || issueResult) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void saveDraft(true);
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [canAutoSave, issueResult, payment, quote, saveDraft]);

  async function calculateQuote() {
    setQuoting(true);
    setError("");
    setQuote(null);
    setPayment(null);
    setIssueResult(null);
    try {
      const draftId = await saveDraft();
      if (!draftId) {
        return;
      }
      const response = await calculateContractQuote(draftId);
      setQuote(response.quote);
      goToStep(3);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Erreur inconnue");
    } finally {
      setQuoting(false);
    }
  }

  async function confirmPayment() {
    if (!savedDraftId || !quote) {
      return;
    }
    setPaying(true);
    setError("");
    try {
      const amount = quotePayableAmount(quote);
      const response = await confirmContractPayment(savedDraftId, amount);
      setPayment(response.payment);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Erreur inconnue");
    } finally {
      setPaying(false);
    }
  }

  async function issueMockContract() {
    if (!savedDraftId || !payment) {
      return;
    }
    setIssuing(true);
    setError("");
    try {
      const response = await issueContract(savedDraftId);
      setIssueResult(response);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Erreur inconnue");
    } finally {
      setIssuing(false);
    }
  }

  const userCanCreateContract = canCreateContract(auth?.user);
  const userCanConfirmPayment = canConfirmContractPayment(auth?.user);
  const userCanIssueContract = canManageContractWorkflow(auth?.user);

  if (isAuthLoading) {
    return (
      <AppShell description="Souscription et émission ASS" title="Nouveau contrat">
        <div className="app-surface p-6 text-sm font-semibold text-black/45">
          Chargement de la session…
        </div>
      </AppShell>
    );
  }

  if (!auth?.authenticated || !userCanCreateContract) {
    return (
      <AppShell description="Souscription et émission ASS" title="Nouveau contrat">
        <div className="app-surface p-6">
          <h2 className="font-extrabold">Accès non autorisé</h2>
          <p className="mt-1 text-sm font-medium text-black/45">
            La création de contrat est réservée aux apporteurs et administrateurs de groupe.
          </p>
          <Link
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-extrabold text-white"
            href={auth?.authenticated ? "/contracts" : "/login"}
          >
            {auth?.authenticated ? "Voir les contrats" : "Se connecter"}
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      actions={(
        <div className="flex items-center gap-3">
          <AutoSaveIndicator draftId={savedDraftId} state={autoSaveState} />
          <StatusBadge status="MODE TEST" />
        </div>
      )}
      description={isEditingDraft ? `Reprise du brouillon #${savedDraftId}` : "Souscription et émission ASS"}
      title="Nouveau contrat"
    >
      <div className="space-y-5">
        {/* ── Sticky stepper ───────────────────────────────────── */}
        <div className="sticky top-[58px] z-20 -mx-4 sm:-mx-6 lg:-mx-8 bg-background/95 px-4 pb-2 pt-1 backdrop-blur-sm sm:px-6 lg:px-8">
          <section className="app-surface overflow-hidden shadow-md">
            <div className="grid grid-cols-4 divide-x divide-border">
              {(
                [
                  { label: "Informations", icon: FileText },
                  { label: "Options",      icon: ShieldCheck },
                  { label: "Résumé",       icon: FileCheck },
                  { label: "Paiement",     icon: CreditCard },
                ] as { label: string; icon: LucideIcon }[]
              ).map((item, index) => {
                const active = step === index + 1;
                const completed = step > index + 1;
                const disabled =
                  (index === 1 && !canCalculateQuote) ||
                  (index >= 2 && !quote);
                const Icon = item.icon;
                return (
                  <button
                    className={`group flex flex-col items-center justify-center gap-1 px-2 py-3 transition disabled:cursor-not-allowed sm:flex-row sm:justify-start sm:gap-3 sm:px-5 sm:py-4 ${
                      active
                        ? "bg-gradient-to-br from-primary to-[var(--primary-strong)] text-white"
                        : completed
                          ? "bg-emerald-50/70 text-emerald-700 hover:bg-emerald-50"
                          : "text-black/35 hover:bg-muted hover:text-black/60 disabled:hover:bg-transparent"
                    }`}
                    disabled={disabled}
                    key={item.label}
                    onClick={() => {
                      if (index === 1) {
                        void continueToOptions();
                        return;
                      }
                      goToStep(index + 1);
                    }}
                    type="button"
                  >
                    {/* Icon container */}
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-xl transition sm:size-9 ${
                        active
                          ? "bg-white/18"
                          : completed
                            ? "bg-emerald-100 text-emerald-600"
                            : "bg-muted"
                      }`}
                    >
                      {completed ? (
                        <Check size={15} strokeWidth={2.5} />
                      ) : (
                        <Icon size={16} strokeWidth={active ? 2.1 : 1.8} />
                      )}
                    </span>

                    {/* Text */}
                    <div className="min-w-0 text-center sm:text-left">
                      <p
                        className={`truncate text-[10px] font-extrabold leading-tight sm:text-[13px] ${
                          active ? "text-white" : ""
                        }`}
                      >
                        {item.label}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <section className="min-w-0 space-y-4">
          {error ? <AlertMessage>{error}</AlertMessage> : null}

          {step === 1 ? (
            <div className="space-y-4">
              <FormBlock icon={FileText} title="Type de contrat">
                <div className="max-w-md">
                  <SelectField
                    label="Type de contrat"
                    onChange={resetContractType}
                    options={displayContractTypes}
                    placeholder="Choisir un type de contrat"
                    value={contractType}
                  />
                </div>
              </FormBlock>

              <PersonSection
                onPolicyholderChange={updatePolicyholder}
                policyholder={policyholder}
                showErrors={showErrors}
              />

              {isGarage ? (
                <GarageFields
                  garage={garage}
                  showErrors={showErrors}
                  subcategories={subcategories}
                  updateGarage={updateGarage}
                />
              ) : (
                <VehicleFields
                  brands={brands}
                  categories={categories}
                  energies={energies}
                  isBusSchool={isBusSchool}
                  isFleet={isFleet}
                  isMoto={isMoto}
                  onCreateBrand={addVehicleBrand}
                  registrationLookupMessage={registrationLookupMessage}
                  registrationLookupState={registrationLookupState}
                  showErrors={showErrors}
                  subcategories={subcategories}
                  updateVehicle={updateVehicle}
                  vehicle={vehicle}
                />
              )}

              {isFleet ? (
                <div className="app-surface flex flex-wrap items-center justify-between gap-3 p-4">
                  <p className="text-sm font-semibold text-black/50">
                    {editingVehicleId ? "Modification du véhicule sélectionné" : "Ajoutez ce véhicule à la flotte"}
                  </p>
                  <button
                    className="h-10 rounded-lg bg-primary px-5 text-sm font-extrabold text-white shadow-sm shadow-primary/20 transition hover:bg-[var(--primary-strong)] disabled:bg-black/20 disabled:shadow-none"
                    disabled={!canSaveVehicle}
                    onClick={saveFleetVehicle}
                    type="button"
                  >
                    {editingVehicleId ? "Mettre à jour le véhicule" : "Ajouter le véhicule"}
                  </button>
                </div>
              ) : null}

              {isFleet ? (
                <FleetSection
                  addTrailer={addTrailer}
                  brands={brands}
                  canSaveTrailer={canSaveTrailer}
                  deleteFleetVehicle={deleteFleetVehicle}
                  editFleetVehicle={editFleetVehicle}
                  fleetVehicles={fleetVehicles}
                  removeTrailer={removeTrailer}
                  selectedTrailerTarget={selectedTrailerTarget}
                  startTrailerForm={startTrailerForm}
                  trailerForm={trailerForm}
                  onCreateBrand={addVehicleBrand}
                  updateTrailer={updateTrailer}
                />
              ) : null}

              {isFleet ? (
                <FleetCoverageFields
                  fleetCoverage={fleetCoverage}
                  showErrors={showErrors}
                  updateFleetCoverage={(field, value) =>
                    setFleetCoverage((current) => ({ ...current, [field]: value }))
                  }
                />
              ) : null}

              <div className="app-surface flex flex-wrap items-center justify-between gap-3 p-4">
                <Link
                  className="h-10 rounded-lg border border-border px-4 inline-flex items-center text-sm font-bold transition hover:bg-muted"
                  href="/contracts"
                >
                  Retour
                </Link>
                <button
                  className="h-10 rounded-lg bg-primary px-5 text-sm font-extrabold text-white shadow-sm shadow-primary/20 transition hover:bg-[var(--primary-strong)] disabled:bg-black/20 disabled:shadow-none"
                  disabled={saving}
                  onClick={continueToOptions}
                  type="button"
                >
                  {saving ? "Enregistrement…" : "Suivant — options et garanties"}
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mx-auto max-w-2xl space-y-4">
              <section className="app-surface p-5 sm:p-6">
                <h2 className="text-lg font-black">Options et garanties</h2>
                <p className="mt-1 text-sm font-medium text-black/50">
                  Sélectionnez les garanties optionnelles à ajouter à la RC de base.
                </p>
                {/* RC + CEDEAO toujours incluses */}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {[
                    { label: "Responsabilité Civile (RC)", sub: "Garantie de base ASS" },
                    { label: "CEDEAO", sub: "Couverture zone CEDEAO" },
                  ].map(({ label, sub }) => (
                    <div key={label} className="flex items-center gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                        <ShieldCheck size={16} className="text-emerald-700" strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold text-emerald-800">{label}</p>
                        <p className="text-xs font-semibold text-emerald-600">{sub}</p>
                      </div>
                      <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600">
                        <Check size={11} className="text-white" strokeWidth={3} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <GuaranteeSelector
                guarantees={guarantees}
                guaranteeOptionReferentials={guaranteeOptionReferentials}
                guaranteeOptions={guaranteeOptions}
                onOptionChange={updateGuaranteeOption}
                onToggle={toggleGuarantee}
                selectedGuarantees={selectedGuarantees}
              />

              <div className="flex justify-between gap-3">
                <button
                  className="h-11 rounded-xl border border-border px-5 text-sm font-bold transition hover:bg-muted"
                  onClick={() => goToStep(1)}
                  type="button"
                >
                  Retour
                </button>
                <button
                  className="h-11 rounded-xl bg-primary px-6 text-sm font-extrabold text-white shadow-sm shadow-primary/30 transition hover:bg-[var(--primary-strong)] disabled:bg-black/20 disabled:shadow-none"
                  disabled={quoting || saving || !canCalculateQuote}
                  onClick={calculateQuote}
                  type="button"
                >
                  {quoting ? "Calcul en cours…" : "Obtenir un devis"}
                </button>
              </div>

            </div>
          ) : null}

          {step === 3 ? (
            <div className="max-w-5xl space-y-4">
              {/* Header */}
              <div>
                <h2 className="text-xl font-black">Résumé du contrat</h2>
                <p className="mt-1 text-sm font-medium text-black/45">
                  Vérifiez toutes les informations avant de procéder au paiement.
                </p>
              </div>

              {/* ── Ligne 1 : Client · Véhicule · Couverture ── */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Client */}
                <SummarySection icon={UserRound} title="Client">
                  <SummaryGrid>
                    <SummaryItem label="Souscripteur" value={personLabel(policyholder)} />
                    <SummaryItem
                      label="Assuré"
                      value={sameAsPolicyholder ? "Identique au souscripteur" : personLabel(insured)}
                    />
                    <SummaryItem label="Téléphone" value={policyholder.phone || "—"} />
                    {policyholder.email ? <SummaryItem label="Email" value={policyholder.email} /> : null}
                    <SummaryItem label="Adresse" value={policyholder.address || "—"} />
                  </SummaryGrid>
                </SummarySection>

                {/* Véhicule / Garage / Flotte */}
                <SummarySection
                  icon={isGarage ? Warehouse : isFleet ? FileText : CarFront}
                  title={
                    isFleet
                      ? `Flotte (${fleetVehicles.length} véhicule${fleetVehicles.length > 1 ? "s" : ""})`
                      : isGarage
                        ? "Garage"
                        : "Véhicule"
                  }
                >
                  {isFleet ? (
                    <FleetSummary fleetVehicles={fleetVehicles} />
                  ) : isGarage ? (
                    <SummaryGrid>
                      <SummaryItem label="Type de contrat" value={selectedContractType?.label ?? "—"} />
                      <SummaryItem label="Genre" value={garage.subcategory || "—"} />
                      <SummaryItem label="Immatriculation" value={garage.registration || "—"} />
                      <SummaryItem label="Nombre de cartes" value={garage.nombreCarte || "—"} />
                    </SummaryGrid>
                  ) : (
                    <SummaryGrid>
                      <SummaryItem label="Type de contrat" value={selectedContractType?.label ?? "—"} />
                      <SummaryItem label="Immatriculation" value={vehicle.registration || "—"} />
                      <SummaryItem label="Marque / Modèle" value={`${vehicle.brand || "—"} ${vehicle.model || ""}`.trim()} />
                      <SummaryItem label="Genre" value={vehicle.subcategory || "—"} />
                      <SummaryItem label="Énergie" value={vehicle.energy || "—"} />
                      <SummaryItem
                        label={vehicle.cylindree ? "Cylindrée" : "Puissance fiscale"}
                        value={vehicle.cylindree ? `${vehicle.cylindree} cm³` : vehicle.fiscalPower ? `${vehicle.fiscalPower} CV` : "—"}
                      />
                      {vehicle.seats ? <SummaryItem label="Nb places" value={vehicle.seats} /> : null}
                    </SummaryGrid>
                  )}
                </SummarySection>

                {/* Couverture */}
                <SummarySection icon={CalendarRange} title="Couverture">
                  <SummaryGrid>
                    <SummaryItem
                      label="Date d'effet"
                      value={(isGarage ? garage.effectDate : coverageSource.effectDate) || "—"}
                    />
                    <SummaryItem
                      label="Durée"
                      value={
                        (isGarage ? garage.duration : coverageSource.duration)
                          ? `${isGarage ? garage.duration : coverageSource.duration} mois`
                          : "—"
                      }
                    />
                    {isFleet ? (
                      <SummaryItem
                        label="Type de personne"
                        value={fleetCoverage.personType === "MORALE" ? "Personne morale" : "Personne physique"}
                      />
                    ) : null}
                  </SummaryGrid>
                </SummarySection>
              </div>

              {/* ── Ligne 2 : Garanties · Devis ── */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Garanties */}
                <SummarySection icon={ShieldCheck} title="Garanties">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-black/35">Incluses</p>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {["RC", "CEDEAO"].map((g) => (
                      <span
                        key={g}
                        className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700"
                      >
                        <Check size={11} strokeWidth={3} />
                        {g}
                      </span>
                    ))}
                  </div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-black/35">Optionnelles</p>
                  {summaryOptionLabels.length ? (
                    <div className="flex flex-wrap gap-2">
                      {summaryOptionLabels.map((label) => (
                        <span
                          key={label}
                          className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-extrabold text-primary"
                        >
                          <Check size={11} strokeWidth={3} />
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-black/35">Aucune garantie optionnelle</p>
                  )}
                  {summaryOptionText && summaryOptionText !== "-" ? (
                    <p className="mt-3 rounded-lg bg-primary/5 px-3 py-2 text-xs font-bold text-primary/70">
                      {summaryOptionText}
                    </p>
                  ) : null}
                </SummarySection>

                {/* Devis */}
                {quote ? (
                  <QuoteResultPanel quote={quote} />
                ) : (
                  <div className="app-surface flex flex-col items-center gap-3 p-6 text-center">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-100">
                      <FileText size={22} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-black/70">Devis non calculé</p>
                      <p className="mt-1 text-xs font-semibold text-black/40">
                        Revenez à l&apos;étape Options pour obtenir un devis.
                      </p>
                    </div>
                    <button
                      className="h-9 rounded-xl border border-border px-4 text-xs font-extrabold transition hover:bg-muted"
                      onClick={() => { clearCalculatedState(); goToStep(2); }}
                      type="button"
                    >
                      Aller aux options
                    </button>
                  </div>
                )}
              </div>

              {/* ── Ligne 3 : Actions ── */}
              <div className="app-surface space-y-2.5 p-4">
                <button
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-extrabold text-white shadow-sm shadow-primary/30 transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:bg-black/20 disabled:shadow-none"
                  disabled={!quote}
                  onClick={() => goToStep(4)}
                  type="button"
                >
                  <CreditCard size={16} />
                  Valider et passer au paiement
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="h-9 rounded-xl border border-border text-xs font-bold transition hover:bg-muted"
                    onClick={() => { clearCalculatedState(); goToStep(1); }}
                    type="button"
                  >
                    Modifier infos
                  </button>
                  <button
                    className="h-9 rounded-xl border border-border text-xs font-bold transition hover:bg-muted"
                    onClick={() => { clearCalculatedState(); goToStep(2); }}
                    type="button"
                  >
                    Changer options
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="max-w-5xl space-y-5">
              <section className="app-surface p-5 sm:p-6">
                <h2 className="text-lg font-black">Paiement et émission</h2>
                <p className="mt-1 text-sm font-medium text-black/50">
                  L&apos;émission ASS consomme un QR code uniquement après paiement confirmé.
                </p>
              </section>
              {quote ? (
                <PaymentIssuePanel
                  canConfirmPayment={userCanConfirmPayment}
                  canIssue={userCanIssueContract}
                  contractId={savedDraftId}
                  issueResult={issueResult}
                  issuing={issuing}
                  onConfirmPayment={confirmPayment}
                  onIssue={issueMockContract}
                  paying={paying}
                  payment={payment}
                  quote={quote}
                />
              ) : (
                <div className="app-surface flex items-center gap-2 p-5 text-sm font-semibold text-black/50">
                  Calculez d&apos;abord le devis ASS depuis l&apos;étape options.
                </div>
              )}
              <div className="flex">
                <button
                  className="h-10 rounded-lg border border-border px-4 text-sm font-bold transition hover:bg-muted"
                  onClick={() => goToStep(3)}
                  type="button"
                >
                  Retour au résumé
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

// Icône et couleur par code ASS de garantie
const GUARANTEE_META: Record<number, { icon: LucideIcon; color: string }> = {
  1: { icon: Scale,         color: "text-blue-600"   }, // Défense et recours
  2: { icon: Users,         color: "text-violet-600" }, // Personnes transportées
  3: { icon: Sparkles,      color: "text-cyan-600"   }, // Bris de glace
  4: { icon: ArrowLeftRight,color: "text-amber-600"  }, // Avance / Recours
  5: { icon: Flame,         color: "text-orange-600" }, // Incendie
  6: { icon: Lock,          color: "text-rose-600"   }, // Vol
  7: { icon: Car,           color: "text-emerald-600"}, // Tierce collision
  8: { icon: ShieldPlus,    color: "text-primary"    }, // Tierce complète
};

function GuaranteeSelector({
  guarantees,
  guaranteeOptionReferentials,
  guaranteeOptions,
  onOptionChange,
  onToggle,
  selectedGuarantees,
}: {
  guarantees: SelectOption[];
  guaranteeOptionReferentials: GuaranteeOptionReferential[];
  guaranteeOptions: GuaranteeOptionsForm;
  onOptionChange: (field: keyof GuaranteeOptionsForm, value: string) => void;
  onToggle: (value: number) => void;
  selectedGuarantees: number[];
}) {
  const visibleOptionReferentials = guaranteeOptionReferentials.filter(
    (referential) =>
      referential.field !== "garantiesOptAS" &&
      referential.enabled !== false &&
      referential.needs_confirmation !== true &&
      ((referential.trigger_guarantee === null && selectedGuarantees.length > 0) ||
        selectedGuarantees.includes(referential.trigger_guarantee ?? -1)),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {guarantees.map((guarantee) => {
          const code = Number(guarantee.value);
          const selected = selectedGuarantees.includes(code);
          const meta = GUARANTEE_META[code];
          const Icon = meta?.icon ?? ShieldCheck;
          const iconColor = meta?.color ?? "text-primary";
          return (
            <button
              key={guarantee.value}
              onClick={() => onToggle(code)}
              type="button"
              className={`group relative flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                selected
                  ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
                  : "border-border bg-white hover:border-primary/30 hover:bg-primary/3"
              }`}
            >
              {/* Icône garantie */}
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  selected ? "bg-primary/15" : "bg-black/5 group-hover:bg-primary/8"
                }`}
              >
                <Icon
                  size={20}
                  className={selected ? "text-primary" : iconColor}
                  strokeWidth={1.8}
                />
              </div>

              {/* Texte */}
              <div className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-extrabold leading-snug ${
                    selected ? "text-primary" : "text-foreground"
                  }`}
                >
                  {guarantee.label}
                </span>
              </div>

              {/* Check indicator */}
              <div
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                  selected
                    ? "border-primary bg-primary"
                    : "border-black/20 group-hover:border-primary/40"
                }`}
              >
                {selected ? <Check size={11} className="text-white" strokeWidth={3} /> : null}
              </div>
            </button>
          );
        })}
      </div>

      {visibleOptionReferentials.length ? (
        <div className="app-surface space-y-4 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-primary" />
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-primary">
              Options de garanties
            </h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {visibleOptionReferentials.map((referential) => (
              <SelectField
                key={referential.field}
                label={referential.label}
                onChange={(value) => onOptionChange(referential.field, value)}
                options={referential.options}
                value={guaranteeOptions[referential.field]}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PersonSection({
  onPolicyholderChange,
  policyholder,
  showErrors = false,
}: {
  onPolicyholderChange: (field: keyof PersonForm, value: string) => void;
  policyholder: PersonForm;
  showErrors?: boolean;
}) {
  return (
    <FormBlock icon={UserRound} title="Client">
      <PersonFields
        onChange={onPolicyholderChange}
        person={policyholder}
        showErrors={showErrors}
      />
    </FormBlock>
  );
}

function PersonFields({
  onChange,
  person,
  showErrors = false,
}: {
  onChange: (field: keyof PersonForm, value: string) => void;
  person: PersonForm;
  showErrors?: boolean;
}) {
  const phoneError = showErrors ? getPhoneValidationMessage(person.phone) : "";

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TextField
          error={showErrors && !person.lastName.trim() ? "Le nom est obligatoire" : ""}
          label="Nom"
          onChange={(value) => onChange("lastName", value)}
          placeholder="Ndiaye"
          required
          value={person.lastName}
        />
        <TextField
          error={showErrors && !person.firstName.trim() ? "Le prénom est obligatoire" : ""}
          label="Prénom"
          onChange={(value) => onChange("firstName", value)}
          placeholder="Awa"
          required
          value={person.firstName}
        />
        <TextField
          error={phoneError}
          inputMode="numeric"
          label="Téléphone"
          maxLength={9}
          onChange={(value) => onChange("phone", value)}
          pattern="7[0-9]{8}"
          placeholder="77XXXXXXX"
          required
          type="tel"
          value={person.phone}
        />
        <div>
          <TextField
            label="Email"
            onChange={(value) => onChange("email", value)}
            placeholder="awa.ndiaye@email.com"
            type="email"
            value={person.email}
          />
          <span className="mt-1 block text-xs font-semibold text-black/45">Facultatif</span>
        </div>
        <TextField
          error={showErrors && !person.address.trim() ? "L'adresse est obligatoire" : ""}
          label="Adresse"
          onChange={(value) => onChange("address", value)}
          placeholder="Dakar, Plateau"
          required
          value={person.address}
        />
    </div>
  );
}

function GarageFields({
  garage,
  showErrors = false,
  subcategories,
  updateGarage,
}: {
  garage: GarageForm;
  showErrors?: boolean;
  subcategories: SelectOption[];
  updateGarage: (field: keyof GarageForm, value: string) => void;
}) {
  return (
    <>
      <FormBlock icon={CalendarRange} title="Validité">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SelectField
            error={showErrors && !garage.duration ? "La durée est obligatoire" : ""}
            label="Durée du contrat"
            onChange={(value) => updateGarage("duration", value)}
            options={durationOptions}
            placeholder="Choisir une durée"
            required
            value={garage.duration}
          />
          <DatePicker
            error={showErrors && !garage.effectDate ? "La date d'effet est obligatoire" : ""}
            label="Date d'effet"
            minDate={TODAY}
            onChange={(value) => updateGarage("effectDate", value)}
            required
            value={garage.effectDate}
          />
        </div>
      </FormBlock>
      <FormBlock icon={Warehouse} title="Véhicule à assurer">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TextField
            label="Immatriculation"
            maxLength={50}
            onChange={(value) => updateGarage("registration", value)}
            placeholder="AA123BC"
            value={garage.registration}
          />
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wide text-primary">Catégorie</span>
            <div className="app-field mt-1.5 flex items-center border-primary/20 bg-primary/3 text-sm font-semibold text-primary/60">
              C6 — Garage
            </div>
          </div>
          <SelectField
            error={showErrors && !garage.subcategory ? "Le genre est obligatoire" : ""}
            label="Genre"
            onChange={(value) => updateGarage("subcategory", value)}
            options={subcategories}
            placeholder="Choisir un genre"
            required
            value={garage.subcategory}
          />
          <TextField
            error={showErrors && !garage.nombreCarte.trim() ? "Le nombre de cartes est obligatoire" : ""}
            helper="Nombre de cartes grises gérées par le garage"
            label="Nombre de cartes"
            onChange={(value) => updateGarage("nombreCarte", value)}
            placeholder="5"
            required
            type="number"
            value={garage.nombreCarte}
          />
        </div>
      </FormBlock>
    </>
  );
}

function VehicleFields({
  brands,
  categories,
  energies,
  isBusSchool,
  isFleet = false,
  isMoto,
  onCreateBrand,
  registrationLookupMessage,
  registrationLookupState,
  showErrors = false,
  subcategories,
  updateVehicle,
  vehicle,
}: {
  brands: SelectOption[];
  categories: SelectOption[];
  energies: SelectOption[];
  isBusSchool: boolean;
  isFleet?: boolean;
  isMoto: boolean;
  onCreateBrand: (label: string) => Promise<SelectOption | undefined>;
  registrationLookupMessage: string;
  registrationLookupState: RegistrationLookupState;
  showErrors?: boolean;
  subcategories: SelectOption[];
  updateVehicle: (field: keyof VehicleForm, value: string) => void;
  vehicle: VehicleForm;
}) {
  return (
    <>
      <FormBlock
        icon={isMoto ? Bike : isBusSchool ? BusFront : CarFront}
        title={isMoto ? "Moto" : isBusSchool ? "Bus école" : "Véhicule"}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SelectSearch
            createLabel="Ajouter la marque"
            error={showErrors && !vehicle.brand ? "La marque est obligatoire" : ""}
            label="Marque"
            onCreate={onCreateBrand}
            onChange={(value) => updateVehicle("brand", value)}
            options={brands}
            placeholder="Sélectionner une marque"
            required
            value={vehicle.brand}
          />
          <TextField
            error={showErrors && !vehicle.model.trim() ? "Le modèle est obligatoire" : ""}
            label="Modèle"
            onChange={(value) => updateVehicle("model", value)}
            placeholder="Corolla"
            required
            value={vehicle.model}
          />
          <SelectField
            error={showErrors && !vehicle.category ? "La catégorie est obligatoire" : ""}
            label="Catégorie"
            onChange={(value) => updateVehicle("category", value)}
            options={categories}
            placeholder="Choisir une catégorie"
            required
            value={vehicle.category}
          />
          <SelectField
            disabled={!vehicle.category}
            error={showErrors && !vehicle.subcategory ? "Le genre est obligatoire" : ""}
            label="Genre"
            onChange={(value) => updateVehicle("subcategory", value)}
            options={subcategories}
            placeholder="Choisir un genre"
            required
            value={vehicle.subcategory}
          />
          <div>
            <TextField
              error={showErrors && !vehicle.registration.trim() ? "L'immatriculation est obligatoire" : ""}
              label="Immatriculation"
              maxLength={50}
              onChange={(value) => updateVehicle("registration", value)}
              placeholder="AA123BC"
              required
              value={vehicle.registration}
            />
            {registrationLookupState !== "idle" ? (
              <p
                className={`mt-2 flex items-center gap-1.5 text-xs font-bold ${
                  registrationLookupState === "found"
                    ? "text-amber-700"
                    : registrationLookupState === "not_found"
                      ? "text-emerald-700"
                      : registrationLookupState === "error"
                        ? "text-red-700"
                        : "text-black/48"
                }`}
              >
                {registrationLookupState === "checking" ? (
                  <LoaderCircle className="animate-spin" size={13} />
                ) : registrationLookupState === "found" ? (
                  <TriangleAlert size={13} />
                ) : registrationLookupState === "not_found" ? (
                  <Check size={13} />
                ) : null}
                {registrationLookupMessage}
              </p>
            ) : null}
          </div>
          <SelectField
            error={showErrors && !vehicle.energy ? "L'énergie est obligatoire" : ""}
            label="Énergie"
            onChange={(value) => updateVehicle("energy", value)}
            options={energies}
            placeholder="Choisir une énergie"
            required
            value={vehicle.energy}
          />
          {!isMoto ? (
            <TextField
              error={showErrors && !vehicle.fiscalPower.trim() ? "La puissance fiscale est obligatoire" : ""}
              label="Puissance fiscale"
              onChange={(value) => updateVehicle("fiscalPower", value)}
              placeholder="8"
              required
              type="number"
              value={vehicle.fiscalPower}
            />
          ) : null}
          {isMoto ? (
            <TextField
              error={showErrors ? getCylindreeError(vehicle.subcategory, vehicle.cylindree) : ""}
              label="Cylindrée (cm³)"
              onChange={(value) => updateVehicle("cylindree", value)}
              placeholder={getCylindrePlaceholder(vehicle.subcategory)}
              required
              type="number"
              value={vehicle.cylindree}
            />
          ) : (
            <TextField
              error={
                showErrors
                  ? !vehicle.seats.trim()
                    ? "Le nombre de places est obligatoire"
                    : vehicle.category === "C1" && Number(vehicle.seats) < 5
                      ? "Le nombre de places doit être ≥ 5 pour un VP"
                      : ""
                  : ""
              }
              label="Nombre de places"
              onChange={(value) => updateVehicle("seats", value)}
              placeholder={vehicle.category === "C1" ? "5 minimum" : "5"}
              required
              type="number"
              value={vehicle.seats}
            />
          )}
        </div>
      </FormBlock>

      {!isFleet ? (
        <FormBlock icon={CalendarRange} title="Couverture">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SelectField
              error={showErrors && !vehicle.duration ? "La durée est obligatoire" : ""}
              label="Durée"
              onChange={(value) => updateVehicle("duration", value)}
              options={durationOptions}
              placeholder="Choisir une durée"
              required
              value={vehicle.duration}
            />
            <DatePicker
              error={showErrors && !vehicle.effectDate ? "La date d'effet est obligatoire" : ""}
              label="Date d'effet"
              minDate={TODAY}
              onChange={(value) => updateVehicle("effectDate", value)}
              required
              value={vehicle.effectDate}
            />
          </div>
        </FormBlock>
      ) : null}
    </>
  );
}

function FleetCoverageFields({
  fleetCoverage,
  showErrors = false,
  updateFleetCoverage,
}: {
  fleetCoverage: FleetCoverage;
  showErrors?: boolean;
  updateFleetCoverage: (field: keyof FleetCoverage, value: string) => void;
}) {
  return (
    <FormBlock icon={CalendarRange} title="Couverture de la flotte">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SelectField
          error={showErrors && !fleetCoverage.duration ? "La durée est obligatoire" : ""}
          label="Durée"
          onChange={(value) => updateFleetCoverage("duration", value)}
          options={durationOptions}
          placeholder="Choisir une durée"
          required
          value={fleetCoverage.duration}
        />
        <DatePicker
          error={showErrors && !fleetCoverage.effectDate ? "La date d'effet est obligatoire" : ""}
          label="Date d'effet"
          minDate={TODAY}
          onChange={(value) => updateFleetCoverage("effectDate", value)}
          required
          value={fleetCoverage.effectDate}
        />
        <SelectField
          label="Type de personne"
          onChange={(value) => updateFleetCoverage("personType", value)}
          options={[
            { value: "MORALE", label: "Personne morale (société)" },
            { value: "PHYSIQUE", label: "Personne physique" },
          ]}
          value={fleetCoverage.personType}
        />
      </div>
      <p className="mt-3 text-xs font-semibold text-black/45">
        Ces champs s&apos;appliquent à l&apos;ensemble des véhicules de la flotte.
        Rabais ASS : 10-20 véhicules = 10 %, 21-40 = 15 %, 41-60 = 20 %, +60 = 25 %.
      </p>
    </FormBlock>
  );
}

function FleetSection({
  addTrailer,
  brands,
  canSaveTrailer,
  deleteFleetVehicle,
  editFleetVehicle,
  fleetVehicles,
  onCreateBrand,
  removeTrailer,
  selectedTrailerTarget,
  startTrailerForm,
  trailerForm,
  updateTrailer,
}: {
  addTrailer: () => void;
  brands: SelectOption[];
  canSaveTrailer: boolean;
  deleteFleetVehicle: (vehicleId: string) => void;
  editFleetVehicle: (vehicleId: string) => void;
  fleetVehicles: FleetVehicle[];
  onCreateBrand: (label: string) => Promise<SelectOption | undefined>;
  removeTrailer: (vehicleId: string, trailerId: string) => void;
  selectedTrailerTarget?: FleetVehicle;
  startTrailerForm: (vehicleId: string) => void;
  trailerForm: TrailerForm;
  updateTrailer: (field: keyof TrailerForm, value: string) => void;
}) {
  // Liste plate de toutes les remorques pour la section REMORQUES
  const allTrailers = fleetVehicles.flatMap((v) =>
    v.trailers.map((t) => ({ ...t, tractorVehicle: v })),
  );

  return (
    <div className="space-y-6">

      {/* ─── VÉHICULES ─────────────────────────────────────────── */}
      <div className="app-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-primary">
            Véhicules ({fleetVehicles.length})
          </h3>
        </div>
        {fleetVehicles.length ? (
          <table className="app-table">
            <thead>
              <tr>
                <th>Immatriculation</th>
                <th>Marque / Modèle</th>
                <th>Genre ASS</th>
                <th>Énergie</th>
                <th>Puiss. fisc.</th>
                <th>Remorques</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fleetVehicles.map((v) => (
                <tr key={v.id}>
                  <td className="font-black">{v.registration || "—"}</td>
                  <td>{v.brand || "—"} {v.model || ""}</td>
                  <td className="text-xs font-bold text-black/60">{v.subcategory || "—"}</td>
                  <td className="text-xs">{v.energy || "—"}</td>
                  <td className="text-xs">{v.fiscalPower || "—"}</td>
                  <td>
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-extrabold text-primary">
                      {v.trailers.length}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold transition hover:bg-muted"
                        onClick={() => editFleetVehicle(v.id)}
                        type="button"
                      >
                        Modifier
                      </button>
                      <button
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-bold text-red-600 transition hover:bg-red-50"
                        onClick={() => deleteFleetVehicle(v.id)}
                        type="button"
                      >
                        Supprimer
                      </button>
                      <button
                        className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-extrabold text-primary transition hover:bg-primary/20"
                        onClick={() => startTrailerForm(v.id)}
                        type="button"
                      >
                        + Remorque
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-4 text-sm font-semibold text-black/45">
            Aucun véhicule ajouté — remplissez le formulaire ci-dessus puis cliquez sur « Ajouter le véhicule ».
          </p>
        )}
      </div>

      {/* ─── REMORQUES ─────────────────────────────────────────── */}
      <div className="app-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-primary">
            Remorques ({allTrailers.length})
          </h3>
        </div>

        {allTrailers.length ? (
          <table className="app-table">
            <thead>
              <tr>
                <th>Immatriculation</th>
                <th>Marque / Modèle</th>
                <th>Tête tracteur</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {allTrailers.map((t) => (
                <tr key={t.id}>
                  <td className="font-black">{t.registration || "—"}</td>
                  <td>{t.brand || "—"} {t.model || ""}</td>
                  <td className="text-xs font-bold text-black/60">
                    {t.tractorVehicle.registration || vehicleLabel(t.tractorVehicle)}
                  </td>
                  <td>
                    <button
                      className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-bold text-red-600 transition hover:bg-red-50"
                      onClick={() => removeTrailer(t.tractorVehicleId, t.id)}
                      type="button"
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-4 text-sm font-semibold text-black/45">
            Aucune remorque — cliquez sur « + Remorque » sur un véhicule pour en ajouter une.
          </p>
        )}

        {/* Formulaire d'ajout de remorque */}
        {selectedTrailerTarget ? (
          <div className="border-t border-primary/20 bg-primary/3 p-5">
            <div className="mb-4 flex items-center gap-3">
              <h4 className="font-extrabold text-primary">Ajouter une remorque</h4>
              <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-extrabold text-primary">
                Tête tracteur : {selectedTrailerTarget.registration || vehicleLabel(selectedTrailerTarget)}
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <TextField
                label="Immatriculation"
                maxLength={50}
                onChange={(value) => updateTrailer("registration", value)}
                placeholder="KL2365HA"
                required
                value={trailerForm.registration}
              />
              <SelectSearch
                createLabel="Ajouter la marque"
                label="Marque"
                onCreate={onCreateBrand}
                onChange={(value) => updateTrailer("brand", value)}
                options={brands}
                placeholder="Sélectionner une marque"
                value={trailerForm.brand}
              />
              <TextField
                label="Modèle"
                onChange={(value) => updateTrailer("model", value)}
                placeholder="Plateau"
                value={trailerForm.model}
              />
            </div>
            <div className="mt-4 flex gap-3">
              <button
                className="h-10 rounded-lg bg-primary px-5 text-sm font-extrabold text-white shadow-sm shadow-primary/20 disabled:bg-black/20 disabled:shadow-none"
                disabled={!canSaveTrailer}
                onClick={addTrailer}
                type="button"
              >
                Rattacher la remorque
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FleetSummary({ fleetVehicles }: { fleetVehicles: FleetVehicle[] }) {
  return (
    <div className="space-y-3">
      {fleetVehicles.map((v, index) => (
        <div key={v.id} className="overflow-hidden rounded-xl border border-border">
          <div className="flex items-center justify-between gap-3 bg-muted/60 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-black text-primary">
                {index + 1}
              </span>
              <p className="text-sm font-extrabold">{vehicleLabel(v)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-black text-primary">
                {v.subcategory || "—"}
              </span>
              {v.energy ? (
                <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[10px] font-black text-black/50">
                  {v.energy}
                </span>
              ) : null}
            </div>
          </div>
          {v.trailers.length ? (
            <div className="divide-y divide-border/60 px-4">
              {v.trailers.map((t) => (
                <div key={t.id} className="flex items-center gap-2 py-2 text-xs font-semibold text-black/55">
                  <span className="font-black text-black/40">↳</span>
                  Remorque{t.registration ? ` ${t.registration}` : ""}
                  {t.brand ? ` · ${t.brand} ${t.model}`.trim() : ""}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SummarySection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="app-surface overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
          <Icon size={14} className="text-primary" strokeWidth={2.2} />
        </div>
        <h3 className="text-sm font-extrabold uppercase tracking-wide text-primary">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SummaryGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm max-sm:grid-cols-1">{children}</dl>;
}

function QuoteResultPanel({ quote }: { quote: ContractQuote }) {
  const paymentAmount = quotePayableAmount(quote);
  const hasBreakdown = quote.prime_totale !== undefined;

  return (
    <section className="app-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/5 px-5 py-4">
        <h3 className="font-extrabold text-primary">Devis ASS calculé</h3>
        <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-black text-white">
          {quote.type}
        </span>
      </div>
      <div className="p-5 space-y-5">
        {/* Section PRIMES - breakdown complet si disponible */}
        <div>
          <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-black/40">Primes</p>
          {hasBreakdown ? (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                {/* Colonne gauche */}
                <div className="divide-y divide-border">
                  <QuoteRow label="Prime RC" value={quote.prime_rc_ass} />
                  <QuoteRow label="Coût de la police" value={quote.cout_police ?? quote.policy_fee_ass} />
                  <QuoteRow label="Taxe" value={quote.taxe ?? 0} />
                  <QuoteRow label="CEDEAO" value={quote.cedeao ?? 0} />
                </div>
                {/* Colonne droite */}
                <div className="divide-y divide-border">
                  <QuoteRow label="Réduction" value={quote.reduction ?? 0} isReduction />
                  <QuoteRow label="Prime A.G" value={quote.prime_ag ?? 0} />
                  <QuoteRow label="Fonds de garantie" value={quote.fonds_garantie ?? 0} />
                  <QuoteRow
                    label="Prime Totale"
                    value={quote.prime_totale ?? paymentAmount}
                    isTotal
                  />
                </div>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <SummaryItem label="Prime RC ASS" value={`${formatAmount(quote.prime_rc_ass)} FCFA`} />
              <SummaryItem label="Coût de police" value={`${formatAmount(quote.policy_fee_ass)} FCFA`} />
              <SummaryItem label="Total à payer" value={`${formatAmount(paymentAmount)} FCFA`} />
            </dl>
          )}
        </div>

        {/* Détail flotte */}
        {quote.items.length ? (
          <div>
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-black/40">Détail véhicules</p>
            <div className="overflow-hidden rounded-lg border border-border">
              {quote.items.map((item) => (
                <div
                  className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0"
                  key={`${item.kind}-${item.request_id}`}
                >
                  <div>
                    <p className="text-sm font-bold">{item.label || item.request_id}</p>
                    <p className="text-[11px] font-semibold text-black/45">
                      {item.kind === "TRAILER" ? "Remorque" : "Véhicule"}
                    </p>
                  </div>
                  <p className="font-extrabold tabular-nums">{formatAmount(item.prime_rc_ass)} FCFA</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {quote.warnings.length ? (
          <div className="space-y-2">
            {quote.warnings.map((warning) => (
              <p
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"
                key={warning}
              >
                {warning}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function QuoteRow({
  label,
  value,
  isReduction = false,
  isTotal = false,
}: {
  label: string;
  value: number;
  isReduction?: boolean;
  isTotal?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 ${isTotal ? "bg-primary/5" : ""}`}>
      <span className={`text-xs font-bold ${isTotal ? "text-primary font-extrabold" : "text-black/55"}`}>
        {label}
      </span>
      <span className={`shrink-0 whitespace-nowrap text-right tabular-nums font-extrabold ${
        isTotal ? "text-primary" : isReduction ? "text-emerald-600" : "text-foreground"
      }`}>
        {isReduction && value > 0 ? "−" : ""}{formatAmount(value)} FCFA
      </span>
    </div>
  );
}

function PaymentIssuePanel({
  canConfirmPayment,
  canIssue,
  contractId,
  issueResult,
  issuing,
  onConfirmPayment,
  onIssue,
  paying,
  payment,
  quote,
}: {
  canConfirmPayment: boolean;
  canIssue: boolean;
  contractId: number | null;
  issueResult: IssueResult | null;
  issuing: boolean;
  onConfirmPayment: () => void;
  onIssue: () => void;
  paying: boolean;
  payment: ConfirmedPayment | null;
  quote: ContractQuote;
}) {
  const payableAmount = quotePayableAmount(quote);

  return (
    <div className="space-y-5">
      <section className="app-surface overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase text-black/40">Montant à confirmer</p>
            <p className="mt-1 text-3xl font-black tabular-nums text-primary">
              {formatAmount(payableAmount)} FCFA
            </p>
            <p className="mt-1 text-xs font-medium text-black/45">
              Prime totale calculée par ASS
            </p>
          </div>
          <span
            className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold ${
              payment
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {payment ? <Check size={12} /> : <CreditCard size={12} />}
            {payment ? "Paiement confirmé" : "En attente de confirmation"}
          </span>
        </div>
        <div className="flex flex-col gap-3 border-t border-border p-5 sm:flex-row sm:items-center">
          {canConfirmPayment ? (
            <button
              className="h-11 rounded-lg bg-primary px-5 text-sm font-extrabold text-white shadow-sm shadow-primary/20 transition hover:bg-[var(--primary-strong)] disabled:bg-black/20 disabled:shadow-none"
              disabled={Boolean(payment) || paying}
              onClick={onConfirmPayment}
              type="button"
            >
              {paying
                ? "Confirmation…"
                : `Confirmer ${formatAmount(payableAmount)} FCFA`}
            </button>
          ) : (
            <span className="text-sm font-semibold text-amber-700">
              Paiement en attente de confirmation par la finance.
            </span>
          )}
          {canIssue ? (
            <button
              className="h-11 rounded-lg bg-black px-5 text-sm font-extrabold text-white transition hover:bg-black/80 disabled:bg-black/20"
              disabled={!payment || Boolean(issueResult) || issuing}
              onClick={onIssue}
              type="button"
            >
              {issuing ? "Émission…" : "Émettre le contrat ASS"}
            </button>
          ) : null}
          {!canConfirmPayment && contractId ? (
            <Link
              className="h-10 rounded-lg border border-border px-4 py-2.5 text-sm font-bold hover:bg-muted"
              href={`/contracts/${contractId}`}
            >
              Ouvrir le dossier
            </Link>
          ) : null}
          {payment ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 sm:ml-auto">
              <Check size={12} />
              Reçu : {formatAmount(payment.amount)} FCFA
            </span>
          ) : null}
        </div>
      </section>

      {issueResult ? <IssuePanel issueResult={issueResult} /> : null}
    </div>
  );
}

function IssuePanel({ issueResult }: { issueResult: IssueResult }) {
  return (
    <section className="app-surface overflow-hidden">
      <div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50 px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500 text-white">
          <Check size={18} strokeWidth={3} />
        </span>
        <div>
          <h3 className="font-extrabold text-emerald-800">Contrat émis</h3>
          <p className="text-xs font-medium text-emerald-700">
            Émission mode test. <StatusBadge status={issueResult.ass_status} />
          </p>
        </div>
      </div>
      <div className="p-5">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <SummaryItem label="N° attestation" value={issueResult.attestation_number || "—"} />
          <SummaryItem label="Référence externe" value={issueResult.reference_externe || "—"} />
          <SummaryItem label="Référence Horus" value={issueResult.reference_trx_partner || "—"} />
          <SummaryItem label="Date expiration" value={issueResult.date_expiration || "—"} />
        </dl>
        <div className="mt-5 flex flex-wrap gap-2.5">
          {issueResult.link_attestation_digitale ? (
            <a
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-black px-4 text-sm font-extrabold text-white transition hover:bg-black/80"
              href={issueResult.link_attestation_digitale}
              rel="noreferrer"
              target="_blank"
            >
              Attestation digitale
            </a>
          ) : null}
          {issueResult.link_attestation_cedeao ? (
            <a
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary px-4 text-sm font-extrabold text-primary transition hover:bg-primary/5"
              href={issueResult.link_attestation_cedeao}
              rel="noreferrer"
              target="_blank"
            >
              Carte brune CEDEAO
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function FormBlock({
  title,
  children,
  icon: Icon,
}: {
  title: string;
  children: React.ReactNode;
  icon: LucideIcon;
}) {
  return (
    <section className="app-surface overflow-hidden">
      <div className="flex items-center justify-center gap-2.5 border-b border-primary/15 bg-primary/5 px-5 py-4 text-center text-primary">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon aria-hidden="true" size={17} strokeWidth={2.4} />
        </span>
        <h2 className="font-extrabold">{title}</h2>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

function SelectField({
  label,
  options,
  value,
  disabled = false,
  onChange,
  placeholder = "Sélectionner...",
  error,
  required = false,
}: {
  label: string;
  options: SelectOption[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => String(o.value) === value);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (containerRef.current && e.target instanceof Node && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function toggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const listHeight = Math.min(options.length * 44 + 8, 220);
      if (window.innerHeight - rect.bottom < listHeight) {
        setPopStyle({ position: "fixed", bottom: window.innerHeight - rect.top + 6, left: rect.left, width: rect.width });
      } else {
        setPopStyle({ position: "fixed", top: rect.bottom + 6, left: rect.left, width: rect.width });
      }
    }
    setOpen((v) => !v);
  }

  return (
    <div className="relative block" ref={containerRef}>
      <span className="text-xs font-extrabold uppercase tracking-wide text-primary">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      <button
        ref={buttonRef}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className={`app-field mt-1.5 flex items-center justify-between text-left text-sm font-semibold transition ${
          error ? "border-red-400 bg-red-50 text-black" : "border-primary/30 bg-primary/5 text-primary"
        }`}
        disabled={disabled}
        onClick={toggle}
        type="button"
      >
        <span className={selected ? "" : "text-primary/50"}>{selected?.label ?? placeholder}</span>
        <svg
          className={`shrink-0 text-primary/65 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          height="17"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
          width="17"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {error ? <span className="mt-1 block text-xs font-bold text-red-600">{error}</span> : null}
      {open ? (
        <div
          className="z-50 overflow-hidden rounded-xl border border-primary/40 bg-primary shadow-xl shadow-primary/20"
          role="listbox"
          style={popStyle}
        >
          <div className="max-h-52 overflow-auto">
            {options.map((option) => {
              const optVal = String(option.value);
              const active = optVal === value;
              return (
                <button
                  aria-selected={active}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                    active
                      ? "bg-white/20 font-extrabold text-white"
                      : "text-white/85 hover:bg-white/10 hover:text-white"
                  } disabled:opacity-35`}
                  disabled={disabled || option.enabled === false}
                  key={option.value}
                  onClick={() => {
                    onChange(optVal);
                    setOpen(false);
                  }}
                  role="option"
                  type="button"
                >
                  <span>
                    {option.label}
                    {option.enabled === false ? " - À venir" : ""}
                  </span>
                  {active ? (
                    <svg fill="none" height="15" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="15">
                      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
            {options.length === 0 ? (
              <p className="px-3 py-2 text-sm font-bold text-white/50">Aucune option</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AutoSaveIndicator({
  draftId,
  state,
}: {
  draftId: number | null;
  state: "idle" | "saving" | "saved" | "error";
}) {
  if (state === "idle" && !draftId) {
    return null;
  }

  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-black/48">
        <LoaderCircle className="animate-spin" size={14} />
        Enregistrement automatique...
      </span>
    );
  }

  if (state === "error") {
    return <span className="text-xs font-bold text-red-700">Brouillon non enregistré</span>;
  }

  return (
    <span
      aria-label={`Brouillon ${draftId} enregistré`}
      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700"
      title={`Brouillon #${draftId} enregistré`}
    >
      <CloudCheck size={15} />
      <span className="hidden sm:inline">Brouillon #{draftId} enregistré</span>
    </span>
  );
}

function TextField({
  label,
  value,
  type = "text",
  helper,
  inputMode,
  max,
  maxLength,
  min,
  onChange,
  pattern,
  placeholder,
  error,
  required = false,
}: {
  label: string;
  value: string;
  type?: string;
  helper?: string;
  inputMode?: "decimal" | "email" | "numeric" | "search" | "tel" | "text" | "url";
  max?: number;
  maxLength?: number;
  min?: number;
  onChange: (value: string) => void;
  pattern?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-extrabold uppercase tracking-wide text-primary">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {helper ? (
        <span className="mt-0.5 block text-xs font-medium text-black/45">{helper}</span>
      ) : null}
      <input
        className={`app-field mt-1.5 text-sm${error ? " border-red-400 bg-red-50 focus:border-red-500" : ""}`}
        inputMode={inputMode}
        max={max}
        maxLength={maxLength}
        min={min}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(type === "text" || type === "tel" ? raw.toUpperCase() : raw);
        }}
        pattern={pattern}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {error ? <span className="mt-1 block text-xs font-bold text-red-600">{error}</span> : null}
    </label>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-wide text-black/40">{label}</dt>
      <dd className="mt-0.5 text-sm font-extrabold text-foreground">{value}</dd>
    </div>
  );
}

// ── Cylindrée C5 : règles par genre ASS ─────────────────────────────────────
// 2RCYC  Cyclomoteurs            : ≤ 50 cm³
// 2RSCO  Scooters jusqu'à 125    : 51 – 125 cm³
// 2RMOT  Motos + 125 cm³         : ≥ 126 cm³
// 2RSID  Side-cars               : ≥ 51 cm³
function getCylindreeError(subcategory: string, cylindree: string): string {
  if (!cylindree.trim()) return "La cylindrée est obligatoire";
  const val = Number(cylindree);
  if (!Number.isFinite(val) || val <= 0) return "Valeur invalide";
  if (subcategory === "2RCYC" && val > 50)
    return "Cyclomoteur : cylindrée ≤ 50 cm³";
  if (subcategory === "2RSCO" && (val < 51 || val > 125))
    return "Scooter ≤ 125 cm³ : cylindrée entre 51 et 125 cm³";
  if (subcategory === "2RMOT" && val < 126)
    return "Moto + 125 cm³ : cylindrée ≥ 126 cm³";
  if (subcategory === "2RSID" && val < 51)
    return "Side-car : cylindrée ≥ 51 cm³";
  return "";
}

function getCylindrePlaceholder(subcategory: string): string {
  if (subcategory === "2RCYC") return "≤ 50 cm³";
  if (subcategory === "2RSCO") return "51 – 125 cm³";
  if (subcategory === "2RMOT") return "≥ 126 cm³";
  if (subcategory === "2RSID") return "≥ 51 cm³";
  return "cm³";
}

function vehicleLabel(vehicle: Pick<VehicleForm, "brand" | "model" | "registration" | "chassis">) {
  const identity = vehicle.registration || vehicle.chassis || "Sans immatriculation";
  return `${vehicle.brand || "Marque"} ${vehicle.model || ""} - ${identity}`.trim();
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

function defaultVehicleForm(): VehicleForm {
  return {
    ...emptyVehicle,
    personType: "PHYSIQUE",
  };
}

function toDisplayContractType(contractType: string) {
  return contractType === "MOTO" ? "AUTO_MONO" : contractType;
}

function buildDraftPayload({
  fleetVehicles,
  fleetCoverage,
  garage,
  guaranteeOptions,
  insured,
  isFleet,
  isGarage,
  policyholder,
  sameAsPolicyholder,
  selectedGuarantees,
  vehicle,
}: {
  fleetVehicles: FleetVehicle[];
  fleetCoverage: FleetCoverage;
  garage: GarageForm;
  guaranteeOptions: GuaranteeOptionsForm;
  insured: PersonForm;
  isFleet: boolean;
  isGarage: boolean;
  policyholder: PersonForm;
  sameAsPolicyholder: boolean;
  selectedGuarantees: number[];
  vehicle: VehicleForm;
}) {
  const partyPayload = {
    guarantees: selectedGuarantees,
    guaranteeOptions: cleanGuaranteeOptions(guaranteeOptions),
    policyholder,
    insured: sameAsPolicyholder ? policyholder : insured,
    sameAsPolicyholder,
    source: "web-new-contract",
    mode: "mock",
  };

  if (isFleet) {
    if (!fleetVehicles.length) {
      throw new Error("Ajoutez au moins un vehicule dans la flotte.");
    }
    return {
      // Couverture au niveau flotte (dateEffet/durée communs à tous les véhicules)
      fleet: {
        effectDate: fleetCoverage.effectDate,
        duration: fleetCoverage.duration,
        periodicity: fleetCoverage.periodicity,
        personType: fleetCoverage.personType,
        // Véhicules sans les champs couverture (portés par fleet)
        vehicles: fleetVehicles.map((v) => ({
          ...normalizeVehicleForPayload(v),
          trailers: v.trailers,
        })),
      },
      ...partyPayload,
    };
  }

  if (isGarage) {
    return {
      garage,
      ...partyPayload,
    };
  }

  return {
    vehicle: normalizeVehicleForPayload(vehicle),
    ...partyPayload,
  };
}

// chargeUtile ASS pour catégorie C2 (TPC) — dépend du genre/sous-catégorie.
// TPC (break) et TPC3T500 (<=3T500) → 1 tonne ; TPC3T500P (>3T500) → 4 tonnes.
function getChargeUtile(subcategory: string): number | null {
  if (subcategory === "TPC" || subcategory === "TPC3T500") return 1;
  if (subcategory === "TPC3T500P") return 4;
  return null;
}

function normalizeVehicleForPayload(vehicle: VehicleForm): VehicleForm & { chargeUtile?: number } {
  const chargeUtile = getChargeUtile(vehicle.subcategory);
  return {
    ...vehicle,
    chassis: "",                                            // caché, toujours vide
    currentValue: vehicle.currentValue || "0",
    firstCirculationDate: DEFAULT_FIRST_CIRCULATION_DATE,  // hardcodé, non saisi
    motoUsage: vehicle.motoUsage || "non_commerciale",
    newValue: vehicle.newValue || "0",
    periodicity: vehicle.periodicity || "MOIS",
    personType: vehicle.personType || "PHYSIQUE",
    ...(chargeUtile !== null ? { chargeUtile } : {}),
  };
}

function hydrateDraftPayload(contractType: string, draftPayload: Record<string, unknown>) {
  const policyholder = toPersonFormFromPayload(
    draftPayload.policyholder ?? draftPayload.souscripteur,
  );
  const insured = policyholder;
  const sameAsPolicyholder = true;
  const commonPayload = {
    selectedGuarantees: readGuarantees(draftPayload.guarantees ?? draftPayload.garanties),
    guaranteeOptions: toGuaranteeOptionsFromPayload(
      draftPayload.guaranteeOptions ?? draftPayload,
    ),
    policyholder,
    insured: sameAsPolicyholder ? policyholder : insured,
    sameAsPolicyholder,
  };

  if (contractType === "FLEET") {
    const fleet = readObject(draftPayload.fleet);
    const vehiclesPayload = Array.isArray(fleet?.vehicles) ? fleet.vehicles : [];
    const fleetVehicles = vehiclesPayload.map((vehiclePayload, index) =>
      toFleetVehicleFromPayload(vehiclePayload, index),
    );
    const fleetCoverage: FleetCoverage = {
      effectDate: String(fleet?.effectDate ?? ""),
      duration: String(fleet?.duration ?? ""),
      periodicity: String(fleet?.periodicity ?? "MOIS"),
      personType: String(fleet?.personType ?? "MORALE"),
    };
    return {
      vehicle: defaultVehicleForm(),
      fleetVehicles,
      fleetCoverage,
      garage: emptyGarage,
      ...commonPayload,
    };
  }

  if (contractType === "GARAGE") {
    const garagePayload = readObject(draftPayload.garage);
    return {
      vehicle: defaultVehicleForm(),
      fleetVehicles: [],
      fleetCoverage: emptyFleetCoverage,
      garage: toGarageFormFromPayload(garagePayload),
      ...commonPayload,
    };
  }

  return {
    vehicle: toVehicleFormFromPayload(draftPayload.vehicle),
    fleetVehicles: [],
    fleetCoverage: emptyFleetCoverage,
    garage: emptyGarage,
    ...commonPayload,
  };
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function upsertOption(options: SelectOption[], option: SelectOption) {
  const next = options.filter((item) => String(item.value) !== String(option.value));
  next.push(option);
  return next.sort((left, right) => left.label.localeCompare(right.label));
}

function normalizeRegistrationLookup(value: string) {
  return sanitizeRegistration(value);
}

function sanitizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits && !digits.startsWith("7") ? "" : digits.slice(0, 9);
}

function isValidPhone(value: string) {
  return /^7\d{8}$/.test(value);
}

function getPhoneValidationMessage(value: string) {
  if (!value) {
    return "Le téléphone est obligatoire";
  }
  if (!value.startsWith("7")) {
    return "Le téléphone doit commencer par 7";
  }
  if (!isValidPhone(value)) {
    return "Saisissez 9 chiffres au format 7XXXXXXXX";
  }
  return "";
}

function sanitizeRegistration(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 50);
}

function mergeAssVehicleData(
  current: VehicleForm,
  assVehicle: NonNullable<AssRegistrationVerification["vehicle"]>,
): VehicleForm {
  const next: VehicleForm = {
    ...current,
    brand: assVehicle.brand || current.brand,
    model: assVehicle.model || current.model,
    category: assVehicle.category || current.category,
    subcategory: assVehicle.subcategory || current.subcategory,
    registration: sanitizeRegistration(assVehicle.registration || current.registration),
    chassis: assVehicle.chassis || current.chassis,
    energy: assVehicle.energy || current.energy,
    fiscalPower: assVehicle.fiscalPower || current.fiscalPower,
    seats: assVehicle.seats || current.seats,
    firstCirculationDate:
      assVehicle.firstCirculationDate || current.firstCirculationDate,
    newValue: assVehicle.newValue || current.newValue,
    currentValue: assVehicle.currentValue || current.currentValue,
    cylindree: assVehicle.cylindree || current.cylindree,
    motoUsage: assVehicle.motoUsage
      ? normalizeMotoUsage(assVehicle.motoUsage)
      : current.motoUsage,
  };

  if (next.category === "C5") {
    next.fiscalPower = "";
  } else if (assVehicle.category) {
    next.cylindree = "";
  }
  return next;
}


function hasRequiredPerson(person: PersonForm) {
  return Boolean(
    person.lastName.trim() &&
    person.firstName.trim() &&
    isValidPhone(person.phone) &&
    person.address.trim(),
  );
}

function personLabel(person: PersonForm) {
  return [person.lastName, person.firstName, person.phone].filter(Boolean).join(" ") || "-";
}

function guaranteeLabels(guarantees: SelectOption[], selectedGuarantees: number[]) {
  return selectedGuarantees.map((value) => {
    const option = guarantees.find((guarantee) => Number(guarantee.value) === value);
    return option ? option.label : `Code ${value}`;
  });
}

function guaranteeOptionSummary(options: GuaranteeOptionsForm) {
  const labels: Record<keyof GuaranteeOptionsForm, string> = {
    garantiesOptPT: "Personnes transportées",
    garantiesOptAR: "Avance / Recours",
    garantiesOptAS: "Assistance",
  };
  const values = Object.entries(options)
    .filter(([, value]) => value.trim())
    .map(([field, value]) => {
      const readableValue = value.replace("OPTION_", "Option ");
      return `${labels[field as keyof GuaranteeOptionsForm]} : ${readableValue}`;
    });
  return values.join(", ") || "-";
}

function quotePayableAmount(quote: ContractQuote) {
  // Même règle que le backend : prime totale ASS si présente et > 0,
  // sinon prime RC + coût de police.
  return quote.prime_totale && quote.prime_totale > 0
    ? quote.prime_totale
    : quote.prime_rc_ass + quote.policy_fee_ass;
}

function cleanGuaranteeOptions(options: GuaranteeOptionsForm) {
  const frontendEnabledFields = new Set([
    "garantiesOptPT",
    "garantiesOptAR",
  ]);
  const userOptions = Object.fromEntries(
    Object.entries(options).filter(
      ([field, value]) => frontendEnabledFields.has(field) && value.trim(),
    ),
  );
  return {
    ...userOptions,
    garantiesOptAS: "OPTION_1",
  };
}

function toVehicleForm(fleetVehicle: FleetVehicle): VehicleForm {
  return {
    brand: fleetVehicle.brand,
    model: fleetVehicle.model,
    category: fleetVehicle.category,
    subcategory: fleetVehicle.subcategory,
    registration: fleetVehicle.registration,
    chassis: fleetVehicle.chassis,
    energy: fleetVehicle.energy,
    fiscalPower: fleetVehicle.fiscalPower,
    seats: fleetVehicle.seats,
    firstCirculationDate: fleetVehicle.firstCirculationDate,
    newValue: fleetVehicle.newValue,
    currentValue: fleetVehicle.currentValue,
    cylindree: fleetVehicle.cylindree,
    motoUsage: fleetVehicle.motoUsage,
    effectDate: fleetVehicle.effectDate,
    duration: fleetVehicle.duration,
    periodicity: fleetVehicle.periodicity,
    personType: fleetVehicle.personType,
  };
}

function toVehicleFormFromPayload(value: unknown): VehicleForm {
  return toVehicleFormFromPayloadWithDefaults(value, emptyVehicle);
}

function toVehicleFormFromPayloadWithDefaults(
  value: unknown,
  defaults: VehicleForm,
): VehicleForm {
  const payload = readObject(value);
  if (!payload) {
    return defaults;
  }

  return {
    brand: readText(payload, ["brand", "marque"]),
    model: readText(payload, ["model", "modele"]),
    category: readText(payload, ["category", "categorie"]),
    subcategory: readText(payload, ["subcategory", "sub_category", "sousCategorie"]),
    registration: readText(payload, ["registration", "immatriculation"]),
    chassis: readText(payload, ["chassis", "numeroChassis", "numero_chassis"]),
    energy: readText(payload, ["energy", "energie"]),
    fiscalPower: readText(payload, ["fiscalPower", "fiscal_power", "puissanceFiscale"]),
    seats: readText(payload, ["seats", "nombrePlaces", "nombre_places"]),
    firstCirculationDate: DEFAULT_FIRST_CIRCULATION_DATE,
    newValue: readText(payload, ["newValue", "new_value", "valeurNeuve"], defaults.newValue),
    currentValue: readText(
      payload,
      ["currentValue", "current_value", "valeurActuelle"],
      defaults.currentValue,
    ),
    cylindree: readText(payload, ["cylindree", "cylindreeCc"]),
    motoUsage: normalizeMotoUsage(
      readText(payload, ["motoUsage", "moto_usage", "usageMoto"], defaults.motoUsage),
    ),
    effectDate: readText(payload, ["effectDate", "effect_date", "dateEffet"]),
    duration: readText(payload, ["duration", "duree"], defaults.duration),
    periodicity: readText(payload, ["periodicity", "periodicite"], defaults.periodicity),
    personType: readText(payload, ["personType", "typePersonne"], defaults.personType),
  };
}

function toFleetVehicleFromPayload(value: unknown, index: number): FleetVehicle {
  const payload = readObject(value);
  const vehicle = toVehicleFormFromPayloadWithDefaults(
    value,
    defaultVehicleForm(),
  );
  const id = payload ? readText(payload, ["id"], createId(`veh-${index}`)) : createId(`veh-${index}`);
  const fleetVehicle: FleetVehicle = {
    ...vehicle,
    id,
    trailers: [],
  };
  const trailersPayload = payload && Array.isArray(payload.trailers) ? payload.trailers : [];
  return {
    ...fleetVehicle,
    trailers: trailersPayload.map((trailerPayload, trailerIndex) =>
      toTrailerFromPayload(trailerPayload, fleetVehicle, trailerIndex),
    ),
  };
}

function toTrailerFromPayload(value: unknown, tractor: FleetVehicle, index: number): Trailer {
  const payload = readObject(value);
  const form = toTrailerFormFromPayload(value);
  return {
    ...form,
    id: payload ? readText(payload, ["id"], createId(`rem-${index}`)) : createId(`rem-${index}`),
    tractorVehicleId: tractor.id,
    tractorLabel: vehicleLabel(tractor),
  };
}

function toTrailerFormFromPayload(value: unknown): TrailerForm {
  const payload = readObject(value);
  if (!payload) {
    return emptyTrailer;
  }
  return {
    brand: readText(payload, ["brand", "marque"]),
    model: readText(payload, ["model", "modele"]),
    registration: readText(payload, ["registration", "immatriculation"]),
  };
}

function toGarageFormFromPayload(value: unknown): GarageForm {
  const payload = readObject(value);
  if (!payload) {
    return emptyGarage;
  }
  return {
    subcategory: readText(payload, ["subcategory", "genre"]),
    nombreCarte: readText(payload, ["nombreCarte", "nombre_carte"], emptyGarage.nombreCarte),
    registration: readText(payload, ["registration", "immatriculation"]),
    effectDate: readText(payload, ["effectDate", "dateEffet"]),
    duration: readText(payload, ["duration", "duree"], emptyGarage.duration),
    periodicity: readText(payload, ["periodicity", "periodicite"], emptyGarage.periodicity),
    personType: readText(payload, ["personType", "typePersonne"], emptyGarage.personType),
  };
}

function toPersonFormFromPayload(value: unknown): PersonForm {
  const payload = readObject(value);
  if (!payload) {
    return emptyPerson;
  }

  return {
    firstName: readText(payload, ["firstName", "first_name", "prenom"]),
    lastName: readText(payload, ["lastName", "last_name", "nom", "raisonSociale"]),
    phone: readText(payload, ["phone", "cellulaire", "telephone"]),
    email: readText(payload, ["email"]),
    address: readText(payload, ["address", "adresse"]),
  };
}

function toGuaranteeOptionsFromPayload(value: unknown): GuaranteeOptionsForm {
  const payload = readObject(value);
  if (!payload) {
    return emptyGuaranteeOptions;
  }
  return {
    garantiesOptPT: readText(payload, ["garantiesOptPT"]),
    garantiesOptAR: readText(payload, ["garantiesOptAR"]),
    garantiesOptAS: readText(payload, ["garantiesOptAS"]),
  };
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readText(payload: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return fallback;
}

function readGuarantees(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item))
    .sort((left, right) => left - right);
}

function normalizeMotoUsage(value: string) {
  const values: Record<string, string> = {
    COMMERCIAL: "commerciale",
    COMMERCIALE: "commerciale",
    NON_COMMERCIAL: "non_commerciale",
    NON_COMMERCIALE: "non_commerciale",
    non_commercial: "non_commerciale",
  };
  return values[value] ?? value;
}
