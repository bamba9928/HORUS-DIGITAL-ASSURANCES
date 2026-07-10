import Image from "next/image";

export function AppFooter({ variant = "app" }: { variant?: "app" | "minimal" }) {
  if (variant === "minimal") {
    return (
      <footer className="px-6 py-6 text-center">
        <p className="text-[11px] font-medium text-black/35">
          © {new Date().getFullYear()} Horus Assurances Digital — Tous droits réservés
        </p>
      </footer>
    );
  }

  return (
    <footer className="border-t border-border bg-white/60 px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <Image
            alt="Horus Assur"
            className="size-7 rounded-lg border border-border bg-white shadow-xs"
            height={256}
            src="/brand/horus-assur-icon.png"
            width={256}
          />
          <div>
            <p className="text-xs font-extrabold tracking-tight text-black/70">
              Horus Assurances Digital
            </p>
            <p className="text-[10.5px] font-medium text-black/35">
              Plateforme de gestion d&apos;assurance automobile
            </p>
          </div>
        </div>
        <p className="text-[11px] font-medium text-black/35">
          © {new Date().getFullYear()} Horus Assur — Tous droits réservés
        </p>
      </div>
    </footer>
  );
}
