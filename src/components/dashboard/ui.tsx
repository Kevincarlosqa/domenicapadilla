import type { ComponentProps, ReactNode } from "react";
import type { BookingStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl leading-tight md:text-4xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-2xl border border-line/80 bg-paper p-4 shadow-[0_1px_0_rgba(23,20,18,0.03)] md:p-5", className)} {...props} />;
}

export function CardTitle({ children, hint, className }: { children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-baseline justify-between gap-3", className)}>
      <h2 className="text-sm font-semibold tracking-tight">{children}</h2>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

const buttonVariants = {
  primary: "bg-ink text-paper hover:bg-ink-soft",
  secondary: "border border-line bg-paper text-ink hover:bg-sand",
  ghost: "text-ink hover:bg-sand",
  danger: "bg-danger text-white hover:bg-danger/90",
  rose: "bg-rose text-white hover:bg-rose-deep",
};

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: keyof typeof buttonVariants; size?: "sm" | "md" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-rose";

export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

const STATUS_STYLE: Record<BookingStatus, string> = {
  PENDING: "bg-[#fbecd6] text-[#7a4a10]",
  CONFIRMED: "bg-[#e3efe8] text-[#24603f]",
  IN_PROGRESS: "bg-[#e5e8f6] text-[#33407e]",
  COMPLETED: "bg-sand text-ink-soft",
  CANCELLED: "bg-[#f5e1e1] text-[#8a2c2c]",
  NO_SHOW: "bg-[#f1dce6] text-[#7c2754]",
};

export const STATUS_BLOCK: Record<BookingStatus, string> = {
  PENDING: "bg-[#fbecd6] border-[#e2b673] text-[#5e3a0c]",
  CONFIRMED: "bg-blush border-rose/40 text-ink",
  IN_PROGRESS: "bg-[#e5e8f6] border-[#8d98d6] text-[#252f63]",
  COMPLETED: "bg-sand border-linen text-ink-soft",
  CANCELLED: "bg-[#f5e1e1] border-[#d9a0a0] text-[#8a2c2c] line-through",
  NO_SHOW: "bg-[#f1dce6] border-[#cf93b2] text-[#7c2754]",
};

export function StatusBadge({ status, label }: { status: BookingStatus; label: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[status])}>{label}</span>;
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-sand px-2 py-0.5 text-[11px] font-medium text-ink-soft", className)}>{children}</span>;
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      {icon ? <div className="text-nude">{icon}</div> : null}
      <p className="font-display text-xl">{title}</p>
      {children ? <div className="max-w-sm text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-sand/70", className)} />;
}

export function Delta({ current, previous, invert = false, format = "pct" }: { current: number; previous: number; invert?: boolean; format?: "pct" | "pts" }) {
  if (!previous && !current) return <span className="text-xs text-muted">—</span>;
  const diff = format === "pts" ? (current - previous) * 100 : previous ? ((current - previous) / previous) * 100 : 100;
  const good = invert ? diff < 0 : diff > 0;
  const flat = Math.abs(diff) < 0.5;
  return (
    <span className={cn("text-xs font-medium", flat ? "text-muted" : good ? "text-success" : "text-danger")}>
      {flat ? "≈" : diff > 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(format === "pts" ? 1 : 0)}
      {format === "pts" ? " pts" : "%"}
    </span>
  );
}
