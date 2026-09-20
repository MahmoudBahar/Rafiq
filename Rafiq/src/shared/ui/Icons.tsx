import Svg, { Circle, Path, Rect } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color: string;
  strokeWidth?: number;
}

function Base({ size = 16, children }: { size?: number; children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

const strokeProps = (color: string, strokeWidth: number) => ({
  stroke: color,
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none' as const,
});

export function PinIcon({ size, color, strokeWidth = 2.2 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Path d="M12 21s-7-5.7-7-11a7 7 0 0 1 14 0c0 5.3-7 11-7 11z" {...s} />
      <Circle cx="12" cy="10" r="2.6" {...s} />
    </Base>
  );
}

export function CrosshairIcon({ size, color, strokeWidth = 2 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Circle cx="12" cy="12" r="3" {...s} />
      <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" {...s} />
      <Circle cx="12" cy="12" r="8" {...s} />
    </Base>
  );
}

export function GearIcon({ size, color, strokeWidth = 1.8 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Circle cx="12" cy="12" r="3.2" {...s} />
      <Path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"
        {...s}
      />
    </Base>
  );
}

/** Back chevron for an RTL app: points toward the start side (right). */
export function ChevronBackIcon({ size, color, strokeWidth = 2.2 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Path d="M9 6l6 6-6 6" {...s} />
    </Base>
  );
}

/** Forward chevron for an RTL app: points toward the end side (left). */
export function ChevronForwardIcon({ size, color, strokeWidth = 2.2 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Path d="M15 6l-6 6 6 6" {...s} />
    </Base>
  );
}

export function ChevronDownIcon({ size, color, strokeWidth = 2.2 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Path d="M6 9l6 6 6-6" {...s} />
    </Base>
  );
}

export function CalendarIcon({ size, color, strokeWidth = 1.9 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Rect x="3" y="5" width="18" height="16" rx="2.5" {...s} />
      <Path d="M8 3v4M16 3v4M3 10h18" {...s} />
    </Base>
  );
}

export function PlusIcon({ size, color, strokeWidth = 2.2 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Path d="M12 5v14M5 12h14" {...s} />
    </Base>
  );
}

export function MinusIcon({ size, color, strokeWidth = 2.2 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Path d="M5 12h14" {...s} />
    </Base>
  );
}

export function ClockIcon({ size, color, strokeWidth = 2 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Circle cx="12" cy="12" r="9" {...s} />
      <Path d="M12 7v5l3 2" {...s} />
    </Base>
  );
}

export function MoonIcon({ size, color, strokeWidth = 1.8 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Path d="M17 3a9 9 0 1 0 4 8 7 7 0 0 1-4-8z" {...s} />
    </Base>
  );
}

/** The azkar tab: an open book. The crescent is kept for the moon itself. */
export function AzkarIcon({ size, color, strokeWidth = 1.8 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Path d="M12 6.6C9.8 5 7 4.4 3.5 4.6v13c3.5-.2 6.3.4 8.5 2" {...s} />
      <Path d="M12 6.6c2.2-1.6 5-2.2 8.5-2v13c-3.5-.2-6.3.4-8.5 2" {...s} />
      <Path d="M12 6.6v13" {...s} />
    </Base>
  );
}

export function TasbihIcon({ size, color, strokeWidth = 1.8 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Circle cx="12" cy="5" r="2" {...s} />
      <Circle cx="6" cy="11" r="2" {...s} />
      <Circle cx="18" cy="11" r="2" {...s} />
      <Circle cx="9" cy="18" r="2" {...s} />
      <Circle cx="15" cy="18" r="2" {...s} />
    </Base>
  );
}

export function CompassIcon({ size, color, strokeWidth = 1.8 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Circle cx="12" cy="12" r="9" {...s} />
      <Path d="M15 9l-2 5-4 1 2-5z" {...s} />
    </Base>
  );
}

export function SunIcon({ size, color, strokeWidth = 2 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Circle cx="12" cy="12" r="4" {...s} />
      <Path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        {...s}
      />
    </Base>
  );
}

export function SunriseIcon({ size, color, strokeWidth = 2 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Path d="M7 15a5 5 0 0 1 10 0" {...s} />
      <Path d="M12 4v3M4.2 8.2l1.5 1.5M19.8 8.2l-1.5 1.5M2 15h2M20 15h2M3 19h18" {...s} />
    </Base>
  );
}

export function MonitorIcon({ size, color, strokeWidth = 2 }: IconProps) {
  const s = strokeProps(color, strokeWidth);
  return (
    <Base size={size}>
      <Rect x="3" y="4" width="18" height="13" rx="2" {...s} />
      <Path d="M8 21h8M12 17v4" {...s} />
    </Base>
  );
}
