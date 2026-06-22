import { useState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#modes", label: "Modes" },
  { href: "#integrations", label: "Integrations" },
  { href: "#pricing", label: "Pricing" },
];

/** Sticky translucent landing-page navigation with a mobile hamburger. */
export function TopNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-line/60 bg-ink/70 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="shrink-0">
          <Logo size={32} />
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-haze transition-colors hover:text-text"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:block">
          <Link
            href="/app"
            className="rounded-xl bg-gradient-to-r from-amber to-rose px-4 py-2 text-sm font-semibold text-ink shadow-glow transition-transform hover:scale-[1.03]"
          >
            Try in Browser
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle navigation menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-text md:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="border-t border-line/60 bg-panel/95 px-4 py-3 md:hidden">
          <div className="flex flex-col gap-3">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm text-haze hover:text-text"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/app"
              className="mt-1 rounded-xl bg-gradient-to-r from-amber to-rose px-4 py-2 text-center text-sm font-semibold text-ink"
            >
              Try in Browser
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
