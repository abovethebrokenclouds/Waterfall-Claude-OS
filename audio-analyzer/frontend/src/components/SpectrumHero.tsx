import { useEffect, useRef } from "react";

interface SpectrumHeroProps {
  className?: string;
  /** Disable animation (Performance Mode / reduced motion). */
  still?: boolean;
}

/**
 * Animated spectrum-analyzer hero visual. Pure synthetic data drawn on a
 * <canvas> — no microphone, no Web Audio. All browser globals are guarded
 * behind useEffect so server-side rendering and tsc pass cleanly.
 */
export function SpectrumHero({ className, still = false }: SpectrumHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = !still && !prefersReduced;

    const bars = 48;
    let raf = 0;
    let t = 0;

    const resize = () => {
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // A deterministic-ish synthetic spectrum: a few resonant peaks plus motion.
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const gap = 4;
      const barW = (w - gap * (bars - 1)) / bars;

      for (let i = 0; i < bars; i++) {
        const x = i / (bars - 1);
        // Pink-ish tilt (louder lows) plus moving resonances.
        const tilt = 1 - x * 0.45;
        const r1 = Math.exp(-Math.pow((x - 0.18) / 0.06, 2));
        const r2 = Math.exp(-Math.pow((x - 0.52) / 0.05, 2));
        const r3 = Math.exp(-Math.pow((x - 0.78) / 0.07, 2));
        const wobble = animate
          ? 0.12 * Math.sin(t * 0.05 + i * 0.5) +
            0.08 * Math.sin(t * 0.11 + i * 0.3)
          : 0;
        let mag = tilt * (0.35 + 0.5 * r1 + 0.42 * r2 + 0.3 * r3) + wobble;
        mag = Math.max(0.05, Math.min(1, mag));

        const barH = mag * (h - 8);
        const bx = i * (barW + gap);
        const by = h - barH;

        const grad = ctx.createLinearGradient(0, h, 0, by);
        grad.addColorStop(0, "#A855F7");
        grad.addColorStop(0.5, "#FF6B8A");
        grad.addColorStop(1, "#F6A623");
        ctx.fillStyle = grad;

        const rr = Math.min(barW / 2, 4);
        roundRect(ctx, bx, by, barW, barH, rr);
        ctx.fill();
      }

      if (animate) {
        t += 1;
        raf = requestAnimationFrame(draw);
      }
    };

    draw();

    let onResize: (() => void) | undefined;
    if (typeof window !== "undefined") {
      onResize = () => {
        resize();
        if (!animate) draw();
      };
      window.addEventListener("resize", onResize);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (onResize && typeof window !== "undefined") {
        window.removeEventListener("resize", onResize);
      }
    };
  }, [still]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-amber/10 blur-3xl" />
      <canvas
        ref={canvasRef}
        className="relative h-full w-full rounded-2xl border border-line bg-panel/60"
        aria-hidden="true"
      />
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
