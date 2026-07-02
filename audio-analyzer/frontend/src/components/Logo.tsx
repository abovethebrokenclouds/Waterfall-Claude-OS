import type { CSSProperties } from "react";

interface LogoProps {
  /** Pixel size of the square mark. */
  size?: number;
  /** Render the "RTAI Audio" wordmark next to the mark. */
  showWordmark?: boolean;
  className?: string;
}

/**
 * The RTAI (Real-Time Audio Intelligence) mark: a rounded tile of
 * amber->rose->violet spectrum bars, optionally followed by the wordmark. Inline
 * SVG so it scales crisply and never needs a network fetch.
 */
export function Logo({ size = 36, showWordmark = true, className }: LogoProps) {
  const gradId = "logoBar";
  const tileId = "logoTile";
  const style: CSSProperties = { width: size, height: size };
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <svg
        viewBox="0 0 512 512"
        style={style}
        role="img"
        aria-label="RTAI — Real-Time Audio Intelligence"
      >
        <defs>
          <linearGradient
            id={gradId}
            x1="0"
            y1="464"
            x2="0"
            y2="48"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#A855F7" />
            <stop offset="0.5" stopColor="#FF6B8A" />
            <stop offset="1" stopColor="#F6A623" />
          </linearGradient>
          <linearGradient
            id={tileId}
            x1="0"
            y1="0"
            x2="512"
            y2="512"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#1F1828" />
            <stop offset="1" stopColor="#16121C" />
          </linearGradient>
        </defs>
        <rect
          x="16"
          y="16"
          width="480"
          height="480"
          rx="108"
          fill={`url(#${tileId})`}
          stroke="#2A2233"
          strokeWidth="4"
        />
        <rect x="92" y="300" width="44" height="116" rx="16" fill={`url(#${gradId})`} />
        <rect x="156" y="220" width="44" height="196" rx="16" fill={`url(#${gradId})`} />
        <rect x="220" y="120" width="44" height="296" rx="16" fill={`url(#${gradId})`} />
        <rect x="284" y="176" width="44" height="240" rx="16" fill={`url(#${gradId})`} />
        <rect x="348" y="84" width="44" height="332" rx="16" fill={`url(#${gradId})`} />
      </svg>
      {showWordmark && (
        <span className="font-semibold tracking-tight text-text">
          <span className="bg-gradient-to-r from-amber via-rose to-violet bg-clip-text text-transparent">
            RTAI
          </span>{" "}
          Audio
        </span>
      )}
    </span>
  );
}
