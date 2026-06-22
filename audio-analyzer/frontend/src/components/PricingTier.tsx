import Link from "next/link";
import { GlowCard } from "./GlowCard";

interface PricingTierProps {
  name: string;
  price: string;
  cadence?: string;
  tagline: string;
  features: string[];
  cta: string;
  href: string;
  featured?: boolean;
}

/** A pricing tier card for the landing page. */
export function PricingTier({
  name,
  price,
  cadence,
  tagline,
  features,
  cta,
  href,
  featured = false,
}: PricingTierProps) {
  return (
    <GlowCard
      glow={featured ? "amber" : "none"}
      className={`flex flex-col gap-4 ${featured ? "border-amber/40 shadow-glow" : ""}`}
    >
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-text">{name}</h3>
          {featured && (
            <span className="rounded-full bg-amber/15 px-2 py-0.5 text-xs font-medium text-amber-soft">
              Most popular
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-haze">{tagline}</p>
      </div>

      <div className="flex items-end gap-1">
        <span className="font-mono text-4xl font-bold text-text">{price}</span>
        {cadence && <span className="pb-1 text-sm text-haze">{cadence}</span>}
      </div>

      <ul className="flex flex-col gap-2 text-sm text-haze">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="mt-1 text-teal">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            {f}
          </li>
        ))}
      </ul>

      <Link
        href={href}
        className={`mt-2 rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition-transform hover:scale-[1.02] ${
          featured
            ? "bg-gradient-to-r from-amber to-rose text-ink"
            : "border border-line bg-panel2 text-text"
        }`}
      >
        {cta}
      </Link>
    </GlowCard>
  );
}
