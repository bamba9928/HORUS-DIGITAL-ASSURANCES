import Image from "next/image";
import Link from "next/link";

function FooterLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`flex items-center gap-4 ${className}`}>
      <Link
        className="text-[11px] font-bold text-black/45 transition hover:text-primary"
        href="/mentions-legales"
      >
        Mentions légales
      </Link>
      <span className="size-[3px] rounded-full bg-black/20" />
      <Link
        className="text-[11px] font-bold text-black/45 transition hover:text-primary"
        href="/contact"
      >
        Contact
      </Link>
    </nav>
  );
}

export function AppFooter({ variant = "app" }: { variant?: "app" | "minimal" }) {
  if (variant === "minimal") {
    return (
      <footer className="flex flex-col items-center gap-2.5 px-6 py-6 text-center">
        <FooterLinks />
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
        <div className="flex flex-col items-center gap-1.5 sm:items-end">
          <FooterLinks />
          <p className="text-[11px] font-medium text-black/35">
            © {new Date().getFullYear()} Horus Assur — Tous droits réservés
          </p>
        </div>
      </div>
    </footer>
  );
}
