"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SelectSearch } from "@/components/SelectSearch";
import {
  calculateContractQuote,
  confirmContractPayment,
  createContractDraft,
  fetchOptions,
  issueContract,
  type ConfirmedPayment,
  type ContractQuote,
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
  newValue: "",
  currentValue: "",
  cylindree: "",
  motoUsage: "",
  effectDate: "",
  duration: "1",
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

export default function NewContractPage() {
  const [step, setStep] = useState(1);
  const [contractType, setContractType] = useState("AUTO_MONO");
  const [vehicle, setVehicle] = useState<VehicleForm>(emptyVehicle);
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicle[]>([]);
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
  const [motoUsages, setMotoUsages] = useState<SelectOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [savedDraftId, setSavedDraftId] = useState<number | null>(null);
  const [quote, setQuote] = useState<ContractQuote | null>(null);
  const [payment, setPayment] = useState<ConfirmedPayment | null>(null);
  const [issueResult, setIssueResult] = useState<IssueResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetchOptions("/referentials/contract-types/"),
      fetchOptions(`/referentials/vehicle-categories/?contract_type=${contractType}`),
      fetchOptions("/referentials/vehicle-categories/?context=trailer"),
      fetchOptions("/referentials/vehicle-brands/"),
      fetchOptions("/referentials/energies/"),
      fetchOptions("/referentials/moto-usages/"),
    ])
      .then(([typeData, categoryData, trailerCategoryData, brandData, energyData, usageData]) => {
        setContractTypes(typeData);
        setCategories(categoryData);
        setTrailerCategories(trailerCategoryData);
        setBrands(brandData);
        setEnergies(energyData);
        setMotoUsages(usageData);
      })
      .catch((apiError: Error) => setError(apiError.message));
  }, [contractType]);

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

  const selectedContractType = useMemo(
    () => contractTypes.find((option) => option.value === contractType),
    [contractType, contractTypes],
  );
  const selectedTrailerTarget = fleetVehicles.find(
    (fleetVehicle) => fleetVehicle.id === trailerTargetVehicleId,
  );

  const isMoto = contractType === "MOTO";
  const isFleet = contractType === "FLEET";
  const canSaveVehicle = Boolean(
    vehicle.brand &&
      vehicle.category &&
      vehicle.subcategory &&
      vehicle.energy &&
      (vehicle.registration || vehicle.chassis) &&
      (!isMoto || (vehicle.cylindree && vehicle.motoUsage)),
  );
  const canSaveTrailer = Boolean(
    trailerTargetVehicleId &&
      trailerForm.brand &&
      trailerForm.category &&
      trailerForm.subcategory &&
      (trailerForm.registration || trailerForm.chassis),
  );

  function updateVehicle(field: keyof VehicleForm, value: string) {
    setVehicle((current) => ({
      ...current,
      [field]: value,
      ...(field === "category" ? { subcategory: "" } : {}),
    }));
  }

  function updateTrailer(field: keyof TrailerForm, value: string) {
    setTrailerForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "category" ? { subcategory: "" } : {}),
    }));
  }

  function resetContractType(value: string) {
    setContractType(value);
    setVehicle(emptyVehicle);
    setFleetVehicles([]);
    setEditingVehicleId("");
    setTrailerTargetVehicleId("");
    setTrailerForm(emptyTrailer);
    setSavedDraftId(null);
    setQuote(null);
    setPayment(null);
    setIssueResult(null);
  }

  function saveFleetVehicle() {
    if (!canSaveVehicle) {
      return;
    }

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

    setVehicle(emptyVehicle);
  }

  function editFleetVehicle(vehicleId: string) {
    const selected = fleetVehicles.find((fleetVehicle) => fleetVehicle.id === vehicleId);
    if (!selected) {
      return;
    }
    setVehicle(toVehicleForm(selected));
    setEditingVehicleId(vehicleId);
    setTrailerTargetVehicleId("");
  }

  function deleteFleetVehicle(vehicleId: string) {
    setFleetVehicles((current) => current.filter((fleetVehicle) => fleetVehicle.id !== vehicleId));
    if (editingVehicleId === vehicleId) {
      setEditingVehicleId("");
      setVehicle(emptyVehicle);
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
      const draft = await createContractDraft({
        contract_type: contractType,
        draft_payload: buildDraftPayload(isFleet, fleetVehicles, vehicle),
      });
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
          </div>
          <span className="rounded-md border border-primary px-3 py-1 text-sm font-black text-primary">
            Mode test
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-[240px_1fr] gap-8 px-6 py-8">
        <aside className="space-y-3 border-r border-border pr-6">
          {["Type", isFleet ? "Flotte" : "Vehicule", "Resume"].map((item, index) => {
            const active = step === index + 1;
            return (
              <button
                className={`block w-full rounded-md px-3 py-3 text-left text-sm font-black ${
                  active ? "bg-black text-white" : "bg-white hover:bg-muted"
                }`}
                key={item}
                onClick={() => setStep(index + 1)}
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
            <div className="max-w-3xl space-y-5">
              <div>
                <h2 className="text-xl font-black">Choisir le type de contrat</h2>
                <p className="mt-1 text-sm font-semibold text-black/60">
                  La remorque sera rattachee depuis un vehicule de flotte.
                </p>
              </div>
              <SelectSearch
                label="Type de contrat"
                onChange={resetContractType}
                options={contractTypes}
                value={contractType}
              />
              <button
                className="h-11 rounded-md bg-primary px-5 text-sm font-black text-white disabled:bg-black/20"
                disabled={!selectedContractType?.enabled}
                onClick={() => setStep(2)}
                type="button"
              >
                Continuer
              </button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="max-w-6xl space-y-6">
              <div>
                <h2 className="text-xl font-black">
                  {isFleet ? "Vehicules de flotte" : "Vehicule"} -{" "}
                  {selectedContractType?.label}
                </h2>
                <p className="mt-1 text-sm font-semibold text-black/60">
                  Les listes viennent du backend Horus, avec mapping vers les valeurs ASS.
                </p>
              </div>

              <VehicleFields
                brands={brands}
                categories={categories}
                energies={energies}
                isMoto={isMoto}
                motoUsages={motoUsages}
                subcategories={subcategories}
                updateVehicle={updateVehicle}
                vehicle={vehicle}
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
                  <button
                    className="h-11 rounded-md bg-primary px-5 text-sm font-black text-white disabled:bg-black/20"
                    disabled={!canSaveVehicle}
                    onClick={() => setStep(3)}
                    type="button"
                  >
                    Voir le resume
                  </button>
                )}
                {isFleet ? (
                  <button
                    className="h-11 rounded-md border border-border px-5 text-sm font-black disabled:text-black/35"
                    disabled={!fleetVehicles.length}
                    onClick={() => setStep(3)}
                    type="button"
                  >
                    Voir le resume flotte
                  </button>
                ) : null}
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
                  updateTrailer={updateTrailer}
                />
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="max-w-5xl space-y-6">
              <div>
                <h2 className="text-xl font-black">Resume avant devis</h2>
                <p className="mt-1 text-sm font-semibold text-black/60">
                  Aucun appel ASS reel n&apos;est effectue dans cette phase.
                </p>
              </div>

              {isFleet ? (
                <FleetSummary fleetVehicles={fleetVehicles} />
              ) : (
                <dl className="grid grid-cols-2 gap-4 rounded-md border border-border p-5 text-sm">
                  <SummaryItem label="Type" value={selectedContractType?.label ?? "-"} />
                  <SummaryItem label="Marque" value={vehicle.brand || "-"} />
                  <SummaryItem label="Modele" value={vehicle.model || "-"} />
                  <SummaryItem label="Categorie" value={vehicle.category || "-"} />
                  <SummaryItem label="Genre ASS" value={vehicle.subcategory || "-"} />
                  <SummaryItem label="Energie" value={vehicle.energy || "-"} />
                  <SummaryItem
                    label="Immatriculation"
                    value={vehicle.registration || "Chassis uniquement"}
                  />
                  <SummaryItem label="Date effet" value={vehicle.effectDate || "-"} />
                </dl>
              )}

              {savedDraftId ? (
                <div className="rounded-md border border-primary bg-primary/5 px-4 py-3 text-sm font-black text-primary">
                  Brouillon sauvegarde #{savedDraftId}
                </div>
              ) : null}

              <div className="flex gap-3">
                <button
                  className="h-11 rounded-md border border-border px-5 text-sm font-black"
                  onClick={() => setStep(2)}
                  type="button"
                >
                  Modifier
                </button>
                <button
                  className="h-11 rounded-md bg-primary px-5 text-sm font-black text-white disabled:bg-black/20"
                  disabled={saving || (isFleet ? !fleetVehicles.length : !canSaveVehicle)}
                  onClick={saveDraft}
                  type="button"
                >
                  {saving ? "Sauvegarde..." : "Sauvegarder le brouillon"}
                </button>
                <button
                  className="h-11 rounded-md bg-black px-5 text-sm font-black text-white disabled:bg-black/20"
                  disabled={quoting || saving || (isFleet ? !fleetVehicles.length : !canSaveVehicle)}
                  onClick={calculateQuote}
                  type="button"
                >
                  {quoting ? "Calcul..." : "Calculer le devis ASS"}
                </button>
              </div>
              {quote ? (
                <QuotePanel
                  issueResult={issueResult}
                  issuing={issuing}
                  onConfirmPayment={confirmPayment}
                  onIssue={issueMockContract}
                  paying={paying}
                  payment={payment}
                  quote={quote}
                />
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function VehicleFields({
  brands,
  categories,
  energies,
  isMoto,
  motoUsages,
  subcategories,
  updateVehicle,
  vehicle,
}: {
  brands: SelectOption[];
  categories: SelectOption[];
  energies: SelectOption[];
  isMoto: boolean;
  motoUsages: SelectOption[];
  subcategories: SelectOption[];
  updateVehicle: (field: keyof VehicleForm, value: string) => void;
  vehicle: VehicleForm;
}) {
  return (
    <div className="grid grid-cols-2 gap-5">
      <SelectSearch
        label="Marque"
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
      <TextField
        label="Immatriculation"
        onChange={(value) => updateVehicle("registration", value)}
        value={vehicle.registration}
      />
      <TextField
        label="Numero chassis"
        onChange={(value) => updateVehicle("chassis", value)}
        value={vehicle.chassis}
      />
      <SelectSearch
        label="Energie"
        onChange={(value) => updateVehicle("energy", value)}
        options={energies}
        value={vehicle.energy}
      />
      {isMoto ? (
        <SelectSearch
          label="Usage moto"
          helper="Valeurs a confirmer avec ASS avant appels reels."
          onChange={(value) => updateVehicle("motoUsage", value)}
          options={motoUsages}
          value={vehicle.motoUsage}
        />
      ) : (
        <TextField
          label="Puissance fiscale"
          onChange={(value) => updateVehicle("fiscalPower", value)}
          value={vehicle.fiscalPower}
        />
      )}
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
      <TextField
        label="Duree"
        onChange={(value) => updateVehicle("duration", value)}
        value={vehicle.duration}
      />
      {!isMoto ? (
        <>
          <TextField
            label="Valeur neuve"
            onChange={(value) => updateVehicle("newValue", value)}
            value={vehicle.newValue}
          />
          <TextField
            label="Valeur actuelle"
            onChange={(value) => updateVehicle("currentValue", value)}
            value={vehicle.currentValue}
          />
        </>
      ) : null}
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
              label="Marque remorque"
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
              label="Numero chassis"
              onChange={(value) => updateTrailer("chassis", value)}
              value={trailerForm.chassis}
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

function QuotePanel({
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
  const paymentAmount = quote.prime_rc_ass + quote.policy_fee_ass;

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-primary p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-black">Devis ASS</h3>
            <p className="mt-1 text-sm font-semibold text-black/60">
              Calcul en mode test via le backend Horus.
            </p>
          </div>
          <span className="rounded-md bg-primary px-3 py-1 text-sm font-black text-white">
            Prime RC ASS
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-4 gap-4">
          <SummaryItem label="Prime RC ASS" value={`${formatAmount(quote.prime_rc_ass)} FCFA`} />
          <SummaryItem
            label="Cout de police ASS"
            value={`${formatAmount(quote.policy_fee_ass)} FCFA`}
          />
          <SummaryItem label="Montant paiement test" value={`${formatAmount(paymentAmount)} FCFA`} />
          <SummaryItem label="TTC ASS" value="A confirmer" />
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
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black">{label}</span>
      <input
        className="mt-2 h-11 w-full rounded-md border border-border px-3 text-sm font-bold outline-none focus:border-primary"
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

function buildDraftPayload(isFleet: boolean, fleetVehicles: FleetVehicle[], vehicle: VehicleForm) {
  if (isFleet) {
    if (!fleetVehicles.length) {
      throw new Error("Ajoutez au moins un vehicule dans la flotte.");
    }
    return {
      fleet: {
        vehicles: fleetVehicles,
      },
      source: "web-new-contract",
      mode: "mock",
    };
  }

  return {
    vehicle,
    source: "web-new-contract",
    mode: "mock",
  };
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
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
  };
}
