"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SelectSearch } from "@/components/SelectSearch";
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
  category: string;
  subcategory: string;
  registration: string;
  chassis: string;
  usefulLoad: string;
  firstCirculationDate: string;
  value: string;
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

type Trailer = TrailerForm & {
  id: string;
  tractorVehicleId: string;
  tractorLabel: string;
};

type FleetVehicle = VehicleForm & {
  id: string;
  trailers: Trailer[];
};

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
  firstCirculationDate: "",
  newValue: "0",
  currentValue: "0",
  cylindree: "",
  motoUsage: "non_commerciale",
  effectDate: "",
  duration: "1",
  periodicity: "MOIS",
  personType: "PHYSIQUE",
};

const emptyTrailer: TrailerForm = {
  brand: "",
  model: "",
  category: "REMORQUE",
  subcategory: "REMORQUE",
  registration: "",
  chassis: "",
  usefulLoad: "",
  firstCirculationDate: "",
  value: "",
};

const emptyPerson: PersonForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  address: "",
};

const emptyGuaranteeOptions: GuaranteeOptionsForm = {
  garantiesOptPT: "",
  garantiesOptAR: "",
  garantiesOptAS: "",
};

const durationOptions = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1} mois`,
}));

export default function NewContractPage() {
  const [step, setStep] = useState(1);
  const [contractType, setContractType] = useState("AUTO_MONO");
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
  const [trailerCategories, setTrailerCategories] = useState<SelectOption[]>([]);
  const [trailerSubcategories, setTrailerSubcategories] = useState<SelectOption[]>([]);
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
  const [registrationVerification, setRegistrationVerification] =
    useState<AssRegistrationVerification | null>(null);
  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  const [error, setError] = useState("");
  const isEditingDraft = savedDraftId !== null && !quote && !payment && !issueResult;

  useEffect(() => {
    Promise.all([
      fetchOptions("/referentials/contract-types/"),
      fetchOptions("/referentials/vehicle-categories/"),
      fetchOptions("/referentials/vehicle-categories/?context=trailer"),
      fetchVehicleBrands(),
      fetchOptions("/referentials/energies/"),
      fetchOptions("/referentials/guarantees/"),
      fetchGuaranteeOptionReferentials(),
    ])
      .then(
        ([
          typeData,
          categoryData,
          trailerCategoryData,
          brandData,
          energyData,
          guaranteeData,
          guaranteeOptionData,
        ]) => {
          setContractTypes(typeData);
          setCategories(categoryData.filter((item) => item.value !== "REMORQUE"));
          setTrailerCategories(trailerCategoryData);
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
        setVehicle(hydratedPayload.vehicle);
        setFleetVehicles(hydratedPayload.fleetVehicles);
        setSelectedGuarantees(hydratedPayload.selectedGuarantees);
        setGuaranteeOptions(hydratedPayload.guaranteeOptions);
        setPolicyholder(hydratedPayload.policyholder);
        setInsured(hydratedPayload.insured);
        setSameAsPolicyholder(hydratedPayload.sameAsPolicyholder);
        setEditingVehicleId("");
        setTrailerTargetVehicleId("");
        setTrailerForm(emptyTrailer);
        setRegistrationVerification(null);
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

  useEffect(() => {
    const query = trailerForm.category ? `category=${trailerForm.category}` : "category=REMORQUE";
    fetchOptions(`/referentials/vehicle-subcategories/?${query}`)
      .then(setTrailerSubcategories)
      .catch((apiError: Error) => setError(apiError.message));
  }, [trailerForm.category]);

  const displayContractTypes = useMemo(
    () =>
      contractTypes
        .filter((option) => ["AUTO_MONO", "FLEET"].includes(String(option.value)))
        .map((option) =>
          option.value === "AUTO_MONO"
            ? { ...option, label: "Auto mono" }
            : option,
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
  const isMoto = !isFleet && vehicle.category === "C5";
  const effectiveContractType = isMoto ? "MOTO" : contractType;
  const canSaveVehicle = Boolean(
    vehicle.brand &&
      vehicle.category &&
      vehicle.subcategory &&
      vehicle.energy &&
      vehicle.effectDate &&
      vehicle.duration &&
      vehicle.periodicity &&
      vehicle.registration &&
      (isMoto ? vehicle.cylindree : vehicle.fiscalPower),
  );
  const canSaveTrailer = Boolean(
    trailerTargetVehicleId &&
      trailerForm.brand &&
      trailerForm.category &&
      trailerForm.subcategory &&
      trailerForm.registration,
  );
  const canContinueParties = hasRequiredPerson(policyholder) && (
    sameAsPolicyholder || hasRequiredPerson(insured)
  );
  const canCalculateQuote = Boolean(
    selectedContractType?.enabled &&
      (isFleet ? fleetVehicles.length : canSaveVehicle) &&
      canContinueParties,
  );

  function clearCalculatedState() {
    setQuote(null);
    setPayment(null);
    setIssueResult(null);
  }

  function updateVehicle(field: keyof VehicleForm, value: string) {
    clearCalculatedState();
    if (field === "registration") {
      setRegistrationVerification(null);
    }
    setVehicle((current) => {
      const next = {
        ...current,
        [field]: value,
        ...(field === "category" ? { subcategory: "" } : {}),
      };
      if (field === "category" && value === "C5") {
        next.fiscalPower = "";
        next.motoUsage = "non_commerciale";
      }
      if (field === "category" && value !== "C5") {
        next.cylindree = "";
        next.motoUsage = "non_commerciale";
      }
      return next;
    });
  }

  async function verifyRegistration() {
    if (!vehicle.registration) {
      return;
    }
    setVerifyingRegistration(true);
    setRegistrationVerification(null);
    setError("");
    try {
      const response = await verifyAssRegistration(vehicle.registration);
      setRegistrationVerification(response);
    } catch (apiError) {
      setError(
        apiError instanceof Error
          ? apiError.message
          : "Verification immatriculation impossible.",
      );
    } finally {
      setVerifyingRegistration(false);
    }
  }

  function updateTrailer(field: keyof TrailerForm, value: string) {
    clearCalculatedState();
    setTrailerForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "category" ? { subcategory: "" } : {}),
    }));
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
    const nextDraftId = isEditingDraft ? savedDraftId : null;
    setContractType(value);
    setVehicle(defaultVehicleForm());
    setFleetVehicles([]);
    setSelectedGuarantees([]);
    setGuaranteeOptions(emptyGuaranteeOptions);
    setPolicyholder(emptyPerson);
    setInsured(emptyPerson);
    setSameAsPolicyholder(true);
    setEditingVehicleId("");
    setTrailerTargetVehicleId("");
    setTrailerForm(emptyTrailer);
    setSavedDraftId(nextDraftId);
    setRegistrationVerification(null);
    setQuote(null);
    setPayment(null);
    setIssueResult(null);
  }

  async function continueToOptions() {
    const draftId = await saveDraft();
    if (draftId) {
      setStep(2);
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
    setPolicyholder((current) => ({ ...current, [field]: value }));
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
    setRegistrationVerification(null);
  }

  function editFleetVehicle(vehicleId: string) {
    const selected = fleetVehicles.find((fleetVehicle) => fleetVehicle.id === vehicleId);
    if (!selected) {
      return;
    }
    setVehicle(toVehicleForm(selected));
    setRegistrationVerification(null);
    setEditingVehicleId(vehicleId);
    setTrailerTargetVehicleId("");
  }

  function deleteFleetVehicle(vehicleId: string) {
    clearCalculatedState();
    setFleetVehicles((current) => current.filter((fleetVehicle) => fleetVehicle.id !== vehicleId));
    if (editingVehicleId === vehicleId) {
      setEditingVehicleId("");
      setVehicle(defaultVehicleForm());
      setRegistrationVerification(null);
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

  async function saveDraft() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        contract_type: effectiveContractType,
        draft_payload: buildDraftPayload({
          isFleet,
          fleetVehicles,
          guaranteeOptions,
          vehicle,
          selectedGuarantees,
          policyholder,
          insured,
          sameAsPolicyholder,
        }),
      };
      const draft =
        isEditingDraft && savedDraftId
          ? await updateContractDraft(savedDraftId, payload)
          : await createContractDraft(payload);
      setSavedDraftId(draft.id);
      return draft.id;
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Erreur inconnue");
      return null;
    } finally {
      setSaving(false);
    }
  }

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
      const amount = quote.prime_rc_ass + quote.policy_fee_ass;
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

  return (
    <main className="min-h-screen bg-white text-black">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <Link className="text-sm font-black text-primary" href="/">
              Dashboard
            </Link>
            <h1 className="mt-1 text-2xl font-black">Nouveau contrat ASS</h1>
            {isEditingDraft ? (
              <p className="mt-1 text-sm font-black text-black/60">
                Reprise du brouillon #{savedDraftId}
              </p>
            ) : null}
          </div>
          <span className="rounded-md border border-primary px-3 py-1 text-sm font-black text-primary">
            Mode test
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-[240px_1fr] gap-8 px-6 py-8 max-lg:grid-cols-1">
        <aside className="space-y-3 border-r border-border pr-6">
          {[
            "Informations",
            "Options",
            "Resume",
            "Paiement / emission",
          ].map((item, index) => {
              const active = step === index + 1;
              const disabled =
                (index === 1 && !canCalculateQuote) ||
                (index >= 2 && !quote);
              return (
                <button
                  className={`block w-full rounded-md px-3 py-3 text-left text-sm font-black ${
                    active ? "bg-black text-white" : "bg-white hover:bg-muted"
                  }`}
                  disabled={disabled}
                  key={item}
                  onClick={() => {
                    if (index === 1) {
                      void continueToOptions();
                      return;
                    }
                    setStep(index + 1);
                  }}
                  type="button"
                >
                  {index + 1}. {item}
                </button>
              );
            })}
        </aside>

        <section className="space-y-6">
          {error ? (
            <div className="rounded-md border border-primary bg-primary/5 px-4 py-3 text-sm font-bold text-primary">
              {error}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="max-w-6xl space-y-6">
              <div>
                <h2 className="text-xl font-black">Informations principales</h2>
                <p className="mt-1 text-sm font-semibold text-black/60">
                  Client, assure, vehicule et periode de couverture sur un seul formulaire.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
                <SelectSearch
                  helper="Remorque reste rattachee a un vehicule dans le parcours flotte."
                  label="Type de contrat"
                  onChange={resetContractType}
                  options={displayContractTypes}
                  value={contractType}
                />
              </div>

              <PersonSection
                onPolicyholderChange={updatePolicyholder}
                policyholder={policyholder}
              />

              <div>
                <h3 className="text-lg font-black">
                  {isFleet ? "Vehicule a ajouter a la flotte" : "Informations vehicule"}
                </h3>
                <p className="mt-1 text-sm font-semibold text-black/60">
                  La Prime RC sera calculee par ASS a partir de la categorie, du genre ASS,
                  de la puissance fiscale et de la periode.
                </p>
              </div>

              <VehicleFields
                brands={brands}
                categories={categories}
                energies={energies}
                isMoto={isMoto}
                onCreateBrand={addVehicleBrand}
                onVerifyRegistration={verifyRegistration}
                registrationVerification={registrationVerification}
                subcategories={subcategories}
                updateVehicle={updateVehicle}
                vehicle={vehicle}
                verifyingRegistration={verifyingRegistration}
              />

              <div className="flex flex-wrap gap-3">
                {isFleet ? (
                  <button
                    className="h-11 rounded-md bg-primary px-5 text-sm font-black text-white disabled:bg-black/20"
                    disabled={!canSaveVehicle}
                    onClick={saveFleetVehicle}
                    type="button"
                  >
                    {editingVehicleId ? "Mettre a jour le vehicule" : "Ajouter le vehicule"}
                  </button>
                ) : (
                  null
                )}
              </div>

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
                  trailerCategories={trailerCategories}
                  trailerForm={trailerForm}
                  trailerSubcategories={trailerSubcategories}
                  onCreateBrand={addVehicleBrand}
                  updateTrailer={updateTrailer}
                />
              ) : null}

              <div className="flex flex-wrap gap-3 border-t border-border pt-5">
                <button
                  className="h-11 rounded-md bg-primary px-5 text-sm font-black text-white disabled:bg-black/20"
                  disabled={saving || !canCalculateQuote}
                  onClick={continueToOptions}
                  type="button"
                >
                  {saving ? "Sauvegarde..." : "SUIVANT : OPTIONS ET GARANTIES"}
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="max-w-5xl space-y-6">
              <div>
                <h2 className="text-xl font-black">Options et garanties</h2>
                <p className="mt-1 text-sm font-semibold text-black/60">
                  La RC est la base obligatoire. Les options non confirmees ne sont pas affichees
                  ni envoyees par defaut.
                </p>
              </div>

              <div className="rounded-md border border-border bg-muted p-4 text-sm font-black">
                Responsabilite civile (RC) : garantie de base ASS.
              </div>

              <GuaranteeSelector
                guarantees={guarantees}
                guaranteeOptionReferentials={guaranteeOptionReferentials}
                guaranteeOptions={guaranteeOptions}
                onOptionChange={updateGuaranteeOption}
                onToggle={toggleGuarantee}
                selectedGuarantees={selectedGuarantees}
              />

              {savedDraftId ? (
                <div className="rounded-md border border-primary bg-primary/5 px-4 py-3 text-sm font-black text-primary">
                  Brouillon sauvegarde #{savedDraftId}
                </div>
              ) : null}

              <div className="flex gap-3">
                <button
                  className="h-11 rounded-md border border-border px-5 text-sm font-black"
                  onClick={() => setStep(1)}
                  type="button"
                >
                  RETOUR
                </button>
                <button
                  className="h-11 rounded-md bg-black px-5 text-sm font-black text-white disabled:bg-black/20"
                  disabled={quoting || saving || !canCalculateQuote}
                  onClick={calculateQuote}
                  type="button"
                >
                  {quoting ? "Calcul..." : "Calculer le devis ASS"}
                </button>
              </div>
              {quote ? (
                <>
                  <QuoteResultPanel quote={quote} />
                  <button
                    className="h-11 rounded-md bg-primary px-5 text-sm font-black text-white"
                    onClick={() => setStep(3)}
                    type="button"
                  >
                    CONTINUER VERS RESUME
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="max-w-5xl space-y-6">
              <div>
                <h2 className="text-xl font-black">Resume avant validation</h2>
                <p className="mt-1 text-sm font-semibold text-black/60">
                  L&apos;emission definitive reste impossible depuis les options. Verifiez les
                  donnees avant paiement.
                </p>
              </div>
              <ContractSummary
                contractTypeLabel={selectedContractType?.label ?? "-"}
                fleetVehicles={fleetVehicles}
                guaranteeOptions={guaranteeOptions}
                guarantees={guarantees}
                insured={insured}
                isFleet={isFleet}
                policyholder={policyholder}
                quote={quote}
                sameAsPolicyholder={sameAsPolicyholder}
                selectedGuarantees={selectedGuarantees}
                vehicle={vehicle}
              />
              <div className="flex flex-wrap gap-3">
                <button
                  className="h-11 rounded-md border border-border px-5 text-sm font-black"
                  onClick={() => setStep(1)}
                  type="button"
                >
                  MODIFIER
                </button>
                <button
                  className="h-11 rounded-md border border-border px-5 text-sm font-black"
                  onClick={() => setStep(2)}
                  type="button"
                >
                  RETOUR OPTIONS
                </button>
                <button
                  className="h-11 rounded-md bg-primary px-5 text-sm font-black text-white disabled:bg-black/20"
                  disabled={!quote}
                  onClick={() => setStep(4)}
                  type="button"
                >
                  VALIDER ET PASSER AU PAIEMENT
                </button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="max-w-5xl space-y-6">
              <div>
                <h2 className="text-xl font-black">Paiement / emission</h2>
                <p className="mt-1 text-sm font-semibold text-black/60">
                  L&apos;emission ASS consomme un QR code uniquement apres paiement confirme.
                </p>
              </div>
              {quote ? (
                <PaymentIssuePanel
                  issueResult={issueResult}
                  issuing={issuing}
                  onConfirmPayment={confirmPayment}
                  onIssue={issueMockContract}
                  paying={paying}
                  payment={payment}
                  quote={quote}
                />
              ) : (
                <div className="rounded-md border border-border bg-muted p-4 text-sm font-bold text-black/60">
                  Calculez d&apos;abord le devis ASS depuis l&apos;etape options.
                </div>
              )}
              <button
                className="h-11 rounded-md border border-border px-5 text-sm font-black"
                onClick={() => setStep(3)}
                type="button"
              >
                Retour au resume
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

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
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {guarantees.map((guarantee) => {
          const value = Number(guarantee.value);
          const selected = selectedGuarantees.includes(value);
          return (
            <button
              className={`rounded-md border px-4 py-3 text-left text-sm font-black ${
                selected
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-white hover:bg-muted"
              }`}
              key={guarantee.value}
              onClick={() => onToggle(value)}
              type="button"
            >
              <span className="block">{guarantee.label}</span>
              <span
                className={`mt-1 block text-xs ${selected ? "text-white/80" : "text-black/50"}`}
              >
                Code ASS {guarantee.value}
              </span>
            </button>
          );
        })}
      </div>

      {visibleOptionReferentials.length ? (
        <div className="rounded-md border border-border p-5">
          <h3 className="text-base font-black">Options de garanties</h3>
          <div className="mt-4 grid grid-cols-2 gap-5">
            {visibleOptionReferentials.map((referential) => (
              <SelectSearch
                helper={referential.helper}
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
}: {
  onPolicyholderChange: (field: keyof PersonForm, value: string) => void;
  policyholder: PersonForm;
}) {
  return (
    <div className="space-y-6">
      <PersonFields
        onChange={onPolicyholderChange}
        person={policyholder}
        title="Informations client"
      />
    </div>
  );
}

function PersonFields({
  onChange,
  person,
  title,
}: {
  onChange: (field: keyof PersonForm, value: string) => void;
  person: PersonForm;
  title: string;
}) {
  return (
    <div className="rounded-md border border-border p-5">
      <h3 className="text-lg font-black">{title}</h3>
      <div className="mt-5 grid grid-cols-2 gap-5 max-md:grid-cols-1">
        <TextField
          helper="Nom ou raison sociale."
          label="Nom"
          onChange={(value) => onChange("lastName", value)}
          value={person.lastName}
        />
        <TextField
          label="Prenom / contact"
          onChange={(value) => onChange("firstName", value)}
          value={person.firstName}
        />
        <TextField
          label="Telephone"
          onChange={(value) => onChange("phone", value)}
          value={person.phone}
        />
        <TextField
          label="Email"
          onChange={(value) => onChange("email", value)}
          type="email"
          value={person.email}
        />
        <TextField
          label="Adresse"
          onChange={(value) => onChange("address", value)}
          value={person.address}
        />
      </div>
    </div>
  );
}

function VehicleFields({
  brands,
  categories,
  energies,
  isMoto,
  onCreateBrand,
  onVerifyRegistration,
  registrationVerification,
  subcategories,
  updateVehicle,
  vehicle,
  verifyingRegistration,
}: {
  brands: SelectOption[];
  categories: SelectOption[];
  energies: SelectOption[];
  isMoto: boolean;
  onCreateBrand: (label: string) => Promise<SelectOption | undefined>;
  onVerifyRegistration: () => void;
  registrationVerification: AssRegistrationVerification | null;
  subcategories: SelectOption[];
  updateVehicle: (field: keyof VehicleForm, value: string) => void;
  vehicle: VehicleForm;
  verifyingRegistration: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
      <SelectSearch
        createLabel="Ajouter la marque"
        label="Marque"
        onCreate={onCreateBrand}
        onChange={(value) => updateVehicle("brand", value)}
        options={brands}
        value={vehicle.brand}
      />
      <TextField
        label="Modele"
        onChange={(value) => updateVehicle("model", value)}
        value={vehicle.model}
      />
      <SelectSearch
        label="Categorie"
        helper="La categorie filtre les sous-categories disponibles."
        onChange={(value) => updateVehicle("category", value)}
        options={categories}
        value={vehicle.category}
      />
      <SelectSearch
        disabled={!vehicle.category}
        label="Sous-categorie ASS"
        helper="Cette valeur mappe vers le champ genre ASS."
        onChange={(value) => updateVehicle("subcategory", value)}
        options={subcategories}
        value={vehicle.subcategory}
      />
      <div>
        <TextField
          label="Immatriculation"
          onChange={(value) => updateVehicle("registration", value)}
          value={vehicle.registration}
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            className="h-9 rounded-md border border-border px-3 text-xs font-black disabled:text-black/35"
            disabled={!vehicle.registration || verifyingRegistration}
            onClick={onVerifyRegistration}
            type="button"
          >
            {verifyingRegistration ? "Verification..." : "Verifier ASS"}
          </button>
          {registrationVerification ? (
            <p className="text-xs font-black text-black/60">
              {registrationVerificationMessage(registrationVerification)}
            </p>
          ) : null}
        </div>
      </div>
      <SelectSearch
        label="Energie"
        onChange={(value) => updateVehicle("energy", value)}
        options={energies}
        value={vehicle.energy}
      />
      {!isMoto ? (
        <TextField
          label="Puissance fiscale"
          onChange={(value) => updateVehicle("fiscalPower", value)}
          value={vehicle.fiscalPower}
        />
      ) : null}
      {isMoto ? (
        <TextField
          label="Cylindree"
          onChange={(value) => updateVehicle("cylindree", value)}
          value={vehicle.cylindree}
        />
      ) : (
        <TextField
          label="Nombre de places"
          onChange={(value) => updateVehicle("seats", value)}
          value={vehicle.seats}
        />
      )}
      <TextField
        label="Date de mise en circulation"
        onChange={(value) => updateVehicle("firstCirculationDate", value)}
        type="date"
        value={vehicle.firstCirculationDate}
      />
      <TextField
        label="Date d'effet"
        onChange={(value) => updateVehicle("effectDate", value)}
        type="date"
        value={vehicle.effectDate}
      />
      <SelectSearch
        label="Duree"
        helper="Periodicite MOIS appliquee par defaut."
        onChange={(value) => updateVehicle("duration", value)}
        options={durationOptions}
        value={vehicle.duration}
      />
      <div className="rounded-md border border-border bg-muted px-3 py-3">
        <span className="text-sm font-black">Date d&apos;expiration estimee</span>
        <p className="mt-2 text-sm font-black">
          {calculateExpirationDateText(
            vehicle.effectDate,
            vehicle.duration,
            vehicle.periodicity,
          )}
        </p>
      </div>
    </div>
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
  trailerCategories,
  trailerForm,
  trailerSubcategories,
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
  trailerCategories: SelectOption[];
  trailerForm: TrailerForm;
  trailerSubcategories: SelectOption[];
  updateTrailer: (field: keyof TrailerForm, value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-black">Vehicules ajoutes</h3>
        <p className="mt-1 text-sm font-semibold text-black/60">
          Chaque carte vehicule permet de modifier, supprimer ou ajouter une remorque.
        </p>
      </div>

      {fleetVehicles.length ? (
        <div className="grid grid-cols-2 gap-4">
          {fleetVehicles.map((fleetVehicle) => (
            <div className="rounded-md border border-border p-4" key={fleetVehicle.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-black">{vehicleLabel(fleetVehicle)}</p>
                  <p className="mt-1 text-sm font-semibold text-black/60">
                    Genre ASS {fleetVehicle.subcategory || "-"} | Energie{" "}
                    {fleetVehicle.energy || "-"}
                  </p>
                </div>
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-black">
                  {fleetVehicle.trailers.length} remorque(s)
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-md border border-border px-3 py-2 text-xs font-black"
                  onClick={() => editFleetVehicle(fleetVehicle.id)}
                  type="button"
                >
                  Modifier
                </button>
                <button
                  className="rounded-md border border-border px-3 py-2 text-xs font-black"
                  onClick={() => deleteFleetVehicle(fleetVehicle.id)}
                  type="button"
                >
                  Supprimer
                </button>
                <button
                  className="rounded-md bg-primary px-3 py-2 text-xs font-black text-white"
                  onClick={() => startTrailerForm(fleetVehicle.id)}
                  type="button"
                >
                  Ajouter une remorque
                </button>
              </div>

              {fleetVehicle.trailers.length ? (
                <div className="mt-4 space-y-2 border-t border-border pt-3">
                  {fleetVehicle.trailers.map((trailer) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2"
                      key={trailer.id}
                    >
                      <p className="text-xs font-black">
                        {trailer.registration || trailer.chassis || "Remorque"} -{" "}
                        {trailer.brand || "-"}
                      </p>
                      <button
                        className="text-xs font-black text-primary"
                        onClick={() => removeTrailer(fleetVehicle.id, trailer.id)}
                        type="button"
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-border bg-muted p-4 text-sm font-bold text-black/60">
          Aucun vehicule ajoute dans la flotte.
        </div>
      )}

      {selectedTrailerTarget ? (
        <div className="rounded-md border border-primary p-5">
          <div className="mb-5">
            <h3 className="text-lg font-black">Ajouter une remorque</h3>
            <p className="mt-1 text-sm font-semibold text-black/60">
              Vehicule tracteur auto-renseigne et non modifiable.
            </p>
          </div>
          <div className="mb-5 rounded-md bg-muted px-3 py-3 text-sm font-black">
            Tracteur : {vehicleLabel(selectedTrailerTarget)}
          </div>
          <div className="grid grid-cols-2 gap-5">
            <SelectSearch
              createLabel="Ajouter la marque"
              label="Marque remorque"
              onCreate={onCreateBrand}
              onChange={(value) => updateTrailer("brand", value)}
              options={brands}
              value={trailerForm.brand}
            />
            <TextField
              label="Modele remorque"
              onChange={(value) => updateTrailer("model", value)}
              value={trailerForm.model}
            />
            <SelectSearch
              label="Categorie remorque"
              onChange={(value) => updateTrailer("category", value)}
              options={trailerCategories}
              value={trailerForm.category}
            />
            <SelectSearch
              label="Sous-categorie remorque"
              onChange={(value) => updateTrailer("subcategory", value)}
              options={trailerSubcategories}
              value={trailerForm.subcategory}
            />
            <TextField
              label="Immatriculation remorque"
              onChange={(value) => updateTrailer("registration", value)}
              value={trailerForm.registration}
            />
            <TextField
              label="Charge utile"
              onChange={(value) => updateTrailer("usefulLoad", value)}
              value={trailerForm.usefulLoad}
            />
            <TextField
              label="Date de mise en circulation"
              onChange={(value) => updateTrailer("firstCirculationDate", value)}
              type="date"
              value={trailerForm.firstCirculationDate}
            />
            <TextField
              label="Valeur"
              onChange={(value) => updateTrailer("value", value)}
              value={trailerForm.value}
            />
          </div>
          <button
            className="mt-5 h-11 rounded-md bg-primary px-5 text-sm font-black text-white disabled:bg-black/20"
            disabled={!canSaveTrailer}
            onClick={addTrailer}
            type="button"
          >
            Rattacher la remorque
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FleetSummary({ fleetVehicles }: { fleetVehicles: FleetVehicle[] }) {
  return (
    <div className="space-y-4">
      {fleetVehicles.map((fleetVehicle) => (
        <div className="rounded-md border border-border p-5" key={fleetVehicle.id}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-base font-black">{vehicleLabel(fleetVehicle)}</p>
              <p className="mt-1 text-sm font-semibold text-black/60">
                {fleetVehicle.subcategory || "-"} | {fleetVehicle.energy || "-"}
              </p>
            </div>
            <span className="rounded-md bg-muted px-3 py-1 text-xs font-black">
              {fleetVehicle.trailers.length} remorque(s)
            </span>
          </div>
          {fleetVehicle.trailers.length ? (
            <div className="mt-4 space-y-2">
              {fleetVehicle.trailers.map((trailer) => (
                <div className="rounded-md bg-muted px-3 py-2 text-sm font-bold" key={trailer.id}>
                  Remorque {trailer.registration || trailer.chassis || "-"} rattachee a{" "}
                  {trailer.tractorLabel}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm font-bold text-black/50">Sans remorque</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ContractSummary({
  contractTypeLabel,
  fleetVehicles,
  guaranteeOptions,
  guarantees,
  insured,
  isFleet,
  policyholder,
  quote,
  sameAsPolicyholder,
  selectedGuarantees,
  vehicle,
}: {
  contractTypeLabel: string;
  fleetVehicles: FleetVehicle[];
  guaranteeOptions: GuaranteeOptionsForm;
  guarantees: SelectOption[];
  insured: PersonForm;
  isFleet: boolean;
  policyholder: PersonForm;
  quote: ContractQuote | null;
  sameAsPolicyholder: boolean;
  selectedGuarantees: number[];
  vehicle: VehicleForm;
}) {
  const coverageVehicle = isFleet ? fleetVehicles[0] : vehicle;
  const expirationDate = coverageVehicle
    ? calculateExpirationDateText(
        coverageVehicle.effectDate,
        coverageVehicle.duration,
        coverageVehicle.periodicity,
      )
    : "-";

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border p-5">
        <h3 className="text-lg font-black">Informations client</h3>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm max-md:grid-cols-1">
          <SummaryItem label="Souscripteur" value={personLabel(policyholder)} />
          <SummaryItem
            label="Assure"
            value={sameAsPolicyholder ? "Identique au souscripteur" : personLabel(insured)}
          />
          <SummaryItem label="Telephone" value={policyholder.phone || "-"} />
          <SummaryItem label="Email" value={policyholder.email || "-"} />
          <SummaryItem label="Adresse" value={policyholder.address || "-"} />
        </dl>
      </div>

      <div className="rounded-md border border-border p-5">
        <h3 className="text-lg font-black">Informations vehicule</h3>
        {isFleet ? (
          <div className="mt-4">
            <FleetSummary fleetVehicles={fleetVehicles} />
          </div>
        ) : (
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm max-md:grid-cols-1">
            <SummaryItem label="Type contrat" value={contractTypeLabel} />
            <SummaryItem label="Immatriculation" value={vehicle.registration || "-"} />
            <SummaryItem label="Categorie" value={vehicle.category || "-"} />
            <SummaryItem label="Genre ASS" value={vehicle.subcategory || "-"} />
            <SummaryItem label="Marque" value={vehicle.brand || "-"} />
            <SummaryItem label="Modele" value={vehicle.model || "-"} />
            <SummaryItem label="Energie" value={vehicle.energy || "-"} />
            <SummaryItem
              label={vehicle.cylindree ? "Cylindree" : "Puissance fiscale"}
              value={vehicle.cylindree || vehicle.fiscalPower || "-"}
            />
            <SummaryItem label="Nombre de places" value={vehicle.seats || "-"} />
          </dl>
        )}
      </div>

      <div className="rounded-md border border-border p-5">
        <h3 className="text-lg font-black">Duree et dates</h3>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm max-md:grid-cols-1">
          <SummaryItem label="Periodicite" value={coverageVehicle?.periodicity || "-"} />
          <SummaryItem label="Duree" value={coverageVehicle?.duration || "-"} />
          <SummaryItem label="Date effet" value={coverageVehicle?.effectDate || "-"} />
          <SummaryItem label="Date expiration" value={expirationDate} />
        </dl>
      </div>

      <div className="rounded-md border border-border p-5">
        <h3 className="text-lg font-black">Garanties selectionnees</h3>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm max-md:grid-cols-1">
          <SummaryItem label="Garantie de base" value="Responsabilite civile (RC)" />
          <SummaryItem
            label="Garanties optionnelles"
            value={guaranteeLabels(guarantees, selectedGuarantees).join(", ") || "Aucune"}
          />
          <SummaryItem
            label="Options garanties"
            value={guaranteeOptionSummary(guaranteeOptions)}
          />
        </dl>
      </div>

      {quote ? (
        <QuoteResultPanel quote={quote} />
      ) : (
        <div className="rounded-md border border-border bg-muted p-4 text-sm font-bold text-black/60">
          Devis ASS non calcule.
        </div>
      )}

      <div className="rounded-md border border-border p-5">
        <h3 className="text-lg font-black">Commission apporteur</h3>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm max-md:grid-cols-1">
          <SummaryItem label="Commission" value="Calculee a l'emission selon configuration" />
          <SummaryItem label="Net a verser Horus" value="Disponible apres snapshot commission" />
        </dl>
      </div>
    </div>
  );
}

function QuoteResultPanel({ quote }: { quote: ContractQuote }) {
  const paymentAmount = quote.prime_rc_ass + quote.policy_fee_ass;

  return (
    <div className="rounded-md border border-primary p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black">Devis ASS</h3>
          <p className="mt-1 text-sm font-semibold text-black/60">
            Prime RC calculee par ASS via le backend Horus.
          </p>
        </div>
        <span className="rounded-md bg-primary px-3 py-1 text-sm font-black text-white">
          Prime RC ASS
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
        <SummaryItem label="Prime RC ASS" value={`${formatAmount(quote.prime_rc_ass)} FCFA`} />
        <SummaryItem
          label="Cout de police ASS"
          value={`${formatAmount(quote.policy_fee_ass)} FCFA`}
        />
        <SummaryItem label="Taxes / accessoires" value="Selon retour ASS" />
        <SummaryItem label="TTC ASS" value="A confirmer" />
        <SummaryItem label="Montant a payer" value={`${formatAmount(paymentAmount)} FCFA`} />
      </dl>

      {quote.items.length ? (
        <div className="mt-5 rounded-md border border-border">
          {quote.items.map((item) => (
            <div
              className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0"
              key={`${item.kind}-${item.request_id}`}
            >
              <div>
                <p className="text-sm font-black">{item.label || item.request_id}</p>
                <p className="text-xs font-bold text-black/55">
                  {item.kind === "TRAILER" ? "Remorque" : "Vehicule"}
                </p>
              </div>
              <p className="text-sm font-black">{formatAmount(item.prime_rc_ass)} FCFA</p>
            </div>
          ))}
        </div>
      ) : null}

      {quote.warnings.length ? (
        <div className="mt-5 space-y-2">
          {quote.warnings.map((warning) => (
            <p
              className="rounded-md bg-muted px-3 py-2 text-xs font-bold text-black/65"
              key={warning}
            >
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PaymentIssuePanel({
  issueResult,
  issuing,
  onConfirmPayment,
  onIssue,
  paying,
  payment,
  quote,
}: {
  issueResult: IssueResult | null;
  issuing: boolean;
  onConfirmPayment: () => void;
  onIssue: () => void;
  paying: boolean;
  payment: ConfirmedPayment | null;
  quote: ContractQuote;
}) {
  return (
    <div className="space-y-5">
      <QuoteResultPanel quote={quote} />

      <div className="rounded-md border border-border p-5">
        <h3 className="text-lg font-black">Paiement et emission</h3>
        <p className="mt-1 text-sm font-semibold text-black/60">
          L&apos;emission reste bloquee tant que le paiement test n&apos;est pas confirme.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="h-11 rounded-md bg-primary px-5 text-sm font-black text-white disabled:bg-black/20"
            disabled={Boolean(payment) || paying}
            onClick={onConfirmPayment}
            type="button"
          >
            {paying ? "Confirmation..." : "Confirmer paiement test"}
          </button>
          <button
            className="h-11 rounded-md bg-black px-5 text-sm font-black text-white disabled:bg-black/20"
            disabled={!payment || Boolean(issueResult) || issuing}
            onClick={onIssue}
            type="button"
          >
            {issuing ? "Emission..." : "Emettre le contrat ASS"}
          </button>
        </div>

        {payment ? (
          <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm font-black">
            Paiement confirme : {formatAmount(payment.amount)} FCFA
          </p>
        ) : null}
      </div>

      {issueResult ? <IssuePanel issueResult={issueResult} /> : null}
    </div>
  );
}

function IssuePanel({ issueResult }: { issueResult: IssueResult }) {
  return (
    <div className="rounded-md border border-primary bg-primary/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black">Contrat emis</h3>
          <p className="mt-1 text-sm font-semibold text-black/60">
            Emission mockee. Aucun QR ASS reel n&apos;a ete consomme.
          </p>
        </div>
        <span className="rounded-md bg-primary px-3 py-1 text-sm font-black text-white">
          {issueResult.ass_status}
        </span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <SummaryItem label="Numero attestation" value={issueResult.attestation_number || "-"} />
        <SummaryItem label="Reference externe" value={issueResult.reference_externe || "-"} />
        <SummaryItem label="Reference Horus" value={issueResult.reference_trx_partner || "-"} />
        <SummaryItem label="Cle de securite" value={issueResult.secure_key || "-"} />
        <SummaryItem label="Date expiration" value={issueResult.date_expiration || "-"} />
      </dl>
      <div className="mt-5 flex flex-wrap gap-3">
        {issueResult.link_attestation_digitale ? (
          <a
            className="rounded-md bg-black px-4 py-2 text-sm font-black text-white"
            href={issueResult.link_attestation_digitale}
            rel="noreferrer"
            target="_blank"
          >
            Attestation digitale
          </a>
        ) : null}
        {issueResult.link_attestation_cedeao ? (
          <a
            className="rounded-md border border-primary px-4 py-2 text-sm font-black text-primary"
            href={issueResult.link_attestation_cedeao}
            rel="noreferrer"
            target="_blank"
          >
            Attestation CEDEAO
          </a>
        ) : null}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  type = "text",
  helper,
  max,
  min,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  helper?: string;
  max?: number;
  min?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black">{label}</span>
      {helper ? (
        <span className="mt-1 block text-xs font-semibold text-black/55">{helper}</span>
      ) : null}
      <input
        className="mt-2 h-11 w-full rounded-md border border-border px-3 text-sm font-bold outline-none focus:border-primary"
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-black text-black/55">{label}</dt>
      <dd className="mt-1 font-black">{value}</dd>
    </div>
  );
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
  return contractType === "MOTO" || contractType === "BUS_SCHOOL" || contractType === "GARAGE"
    ? "AUTO_MONO"
    : contractType;
}

function buildDraftPayload({
  fleetVehicles,
  guaranteeOptions,
  insured,
  isFleet,
  policyholder,
  sameAsPolicyholder,
  selectedGuarantees,
  vehicle,
}: {
  fleetVehicles: FleetVehicle[];
  guaranteeOptions: GuaranteeOptionsForm;
  insured: PersonForm;
  isFleet: boolean;
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
      fleet: {
        vehicles: fleetVehicles.map(normalizeVehicleForPayload),
      },
      ...partyPayload,
    };
  }

  return {
    vehicle: normalizeVehicleForPayload(vehicle),
    ...partyPayload,
  };
}

function normalizeVehicleForPayload(vehicle: VehicleForm): VehicleForm {
  return {
    ...vehicle,
    chassis: "",
    currentValue: vehicle.currentValue || "0",
    motoUsage: vehicle.motoUsage || "non_commerciale",
    newValue: vehicle.newValue || "0",
    periodicity: "MOIS",
    personType: "PHYSIQUE",
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
    return {
      vehicle: defaultVehicleForm(),
      fleetVehicles,
      ...commonPayload,
    };
  }

  return {
    vehicle: toVehicleFormFromPayload(draftPayload.vehicle),
    fleetVehicles: [],
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

function calculateExpirationDateText(effectDate: string, duration: string, periodicity: string) {
  if (!effectDate || !duration || !periodicity) {
    return "-";
  }

  const parsedDuration = Number(duration);
  const parts = effectDate.split("-").map((part) => Number(part));
  if (
    !Number.isInteger(parsedDuration) ||
    parsedDuration <= 0 ||
    parts.length !== 3 ||
    parts.some((part) => !Number.isInteger(part))
  ) {
    return "-";
  }

  const [year, month, day] = parts;
  const startDate = new Date(year, month - 1, day);
  const expiration =
    periodicity === "JOUR"
      ? addDays(startDate, parsedDuration - 1)
      : addDays(addMonthsToDate(startDate, parsedDuration), -1);
  return formatIsoDate(expiration);
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonthsToDate(value: Date, months: number) {
  const result = new Date(value);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  return result;
}

function formatIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function registrationVerificationMessage(verification: AssRegistrationVerification) {
  if (verification.is_registered === true) {
    return "Immatriculation connue ASS.";
  }
  if (verification.is_registered === false) {
    return "Immatriculation non trouvee dans ASS.";
  }
  return verification.operation_message || "Reponse ASS sans statut clair.";
}

function hasRequiredPerson(person: PersonForm) {
  return Boolean(person.lastName.trim() && person.phone.trim());
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
  const values = Object.entries(cleanGuaranteeOptions(options)).map(
    ([field, value]) => `${field}: ${value}`,
  );
  return values.join(", ") || "-";
}

function cleanGuaranteeOptions(options: GuaranteeOptionsForm) {
  const frontendEnabledFields = new Set([
    "garantiesOptPT",
    "garantiesOptAR",
  ]);
  return Object.fromEntries(
    Object.entries(options).filter(
      ([field, value]) => frontendEnabledFields.has(field) && value.trim(),
    ),
  );
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
    firstCirculationDate: readText(payload, [
      "firstCirculationDate",
      "first_circulation_date",
      "dateMiseEnCirculation",
    ]),
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
    category: readText(payload, ["category", "categorie"], emptyTrailer.category),
    subcategory: readText(payload, ["subcategory", "sub_category", "sousCategorie"], emptyTrailer.subcategory),
    registration: readText(payload, ["registration", "immatriculation"]),
    chassis: readText(payload, ["chassis", "numeroChassis", "numero_chassis"]),
    usefulLoad: readText(payload, ["usefulLoad", "useful_load", "chargeUtile"]),
    firstCirculationDate: readText(payload, [
      "firstCirculationDate",
      "first_circulation_date",
      "dateMiseEnCirculation",
    ]),
    value: readText(payload, ["value", "valeur"]),
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
