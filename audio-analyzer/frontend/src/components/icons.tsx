import type { SVGProps } from "react";

const base = (props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export function IconWave(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 12h2l2-6 3 14 3-11 2 7 2-4h4" />
    </svg>
  );
}

export function IconSpeaker(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <circle cx="12" cy="14" r="4" />
      <circle cx="12" cy="6" r="1" />
    </svg>
  );
}

export function IconRoom(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 21V9l9-6 9 6v12" />
      <path d="M3 21h18" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

export function IconGauge(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="m13.4 10.6 3.6-3.6" />
      <path d="M4 18a8 8 0 1 1 16 0" />
    </svg>
  );
}

export function IconTransfer(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h12" />
      <path d="m13 4 3 3-3 3" />
      <path d="M20 17H8" />
      <path d="m11 14-3 3 3 3" />
    </svg>
  );
}

export function IconList(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

export function IconMic(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
    </svg>
  );
}

export function IconChip(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
    </svg>
  );
}

export function IconUsb(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="21" r="1" />
      <path d="M12 21V7" />
      <path d="m8 11 4-4 4 4" />
      <path d="M12 13h4l1-3" />
      <path d="M16 7h2" />
    </svg>
  );
}
