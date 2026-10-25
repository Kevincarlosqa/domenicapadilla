import { cn } from "@/lib/utils";

/**
 * Brazo del asterisco DP (apunta hacia arriba desde el centro): nace casi en un punto,
 * se abre en abanico con los lados levemente curvos y termina en un corte cóncavo centrado.
 * Es simétrico respecto a su eje: las dos puntas son idénticas y quedan a la misma altura.
 */
const PETAL = "M -1.5 0 C -2.6 -17 -6 -31 -13.5 -46.5 Q 0 -43 13.5 -46.5 C 6 -31 2.6 -17 1.5 0 Z";

/** Cinco brazos cada 72°, con el de arriba levemente inclinado a la izquierda como en el logo original. */
const ARM_ANGLES = [-14, 58, 130, 202, 274];

export function LogoMark({ className, title = "Doménica Padilla" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="-50 -50 100 100" className={cn("h-8 w-8", className)} role="img" aria-label={title} fill="currentColor">
      {ARM_ANGLES.map((r) => (
        <path key={r} d={PETAL} transform={`rotate(${r})`} />
      ))}
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="h-[1.35em] w-[1.35em]" title="" />
      <span className="font-display text-[1.35em] leading-none tracking-tight">
        Doménica <em className="italic">Padilla</em>
      </span>
    </span>
  );
}

export { ARM_ANGLES, PETAL };
