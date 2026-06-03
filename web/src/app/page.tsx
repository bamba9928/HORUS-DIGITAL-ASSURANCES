import Link from "next/link";

const contractTypes = [
  { name: "Auto mono", status: "Pret" },
  { name: "Moto", status: "Pret" },
  { name: "Flotte", status: "Pret" },
  { name: "Bus ecole", status: "A venir" },
  { name: "Garage", status: "A venir" },
];

const metrics = [
  { label: "Brouillons", value: "0" },
  { label: "Devis prets", value: "0" },
  { label: "Paiements en attente", value: "0" },
  { label: "Contrats emis", value: "0" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-normal text-primary">
              Horus
            </p>
            <h1 className="text-2xl font-black tracking-normal">
              Assurances Digital
            </h1>
          </div>
          <Link
            className="flex h-11 items-center rounded-md bg-primary px-5 text-sm font-black text-white"
            href="/contracts/new"
          >
            + Nouveau contrat
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-[220px_1fr] gap-8 px-6 py-8">
        <aside className="border-r border-border pr-6">
          <nav className="flex flex-col gap-2 text-sm font-bold">
            <a className="rounded-md bg-black px-3 py-2 text-white" href="#">
              Dashboard
            </a>
            <Link className="rounded-md px-3 py-2 hover:bg-muted" href="/contracts/new">
              Nouveau contrat
            </Link>
            <a className="rounded-md px-3 py-2 hover:bg-muted" href="#">
              Contrats
            </a>
            <Link className="rounded-md px-3 py-2 hover:bg-muted" href="/commissions">
              Commissions
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-muted" href="/users">
              Utilisateurs
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-muted" href="/login">
              Connexion
            </Link>
          </nav>
        </aside>

        <section className="space-y-8">
          <div className="grid grid-cols-4 gap-4">
            {metrics.map((metric) => (
              <div
                className="rounded-md border border-border bg-white p-4"
                key={metric.label}
              >
                <p className="text-sm font-bold text-black/60">{metric.label}</p>
                <p className="mt-3 text-3xl font-black">{metric.value}</p>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-black">Nouveau contrat</h2>
                <p className="mt-1 text-sm font-semibold text-black/60">
                  Selection du parcours ASS
                </p>
              </div>
              <span className="rounded-md border border-primary px-3 py-1 text-sm font-black text-primary">
                Mode test
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {contractTypes.map((type) => {
                const disabled = type.status !== "Pret";
                return (
                  <button
                    className="min-h-32 rounded-md border border-border bg-white p-5 text-left transition hover:border-primary disabled:bg-muted disabled:text-black/45"
                    disabled={disabled}
                    key={type.name}
                  >
                    <span className="block text-lg font-black">{type.name}</span>
                    <span className="mt-6 inline-flex rounded-md bg-muted px-3 py-1 text-xs font-black">
                      {type.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
