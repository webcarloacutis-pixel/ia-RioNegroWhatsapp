"use client";

import { cn } from "@/lib/utils";

type AlcaldiaLogoProps = {
  className?: string;
  compact?: boolean;
  invert?: boolean;
};

export function AlcaldiaLogo({
  className,
  compact = false,
  invert = false,
}: AlcaldiaLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[22px] border shadow-sm",
          compact ? "h-12 w-12 rounded-[18px]" : "h-16 w-16",
          invert
            ? "border-white/20 bg-white/10"
            : "border-[#b98a2f]/25 bg-[linear-gradient(180deg,#f6d07f,#d9a23f)]",
        )}
      >
        <div
          className={cn(
            "relative flex h-[78%] w-[62%] items-center justify-center rounded-b-[40%] rounded-t-[20%] border-2",
            invert ? "border-white/70 bg-white/10" : "border-[#9a6a1f] bg-[#f7e3a8]",
          )}
        >
          <div
            className={cn(
              "absolute top-[28%] h-3 w-3 rounded-sm border",
              invert ? "border-white/80 bg-white/30" : "border-[#8d2b24] bg-[#b53a31]",
            )}
          />
          <div
            className={cn(
              "absolute bottom-[22%] h-5 w-5 rounded-full border",
              invert ? "border-white/55 bg-white/15" : "border-[#aa7d28] bg-[#e3be67]",
            )}
          />
        </div>
      </div>

      <div className={cn("min-w-0", compact ? "space-y-0.5" : "space-y-1")}>
        <p
          className={cn(
            "font-semibold leading-none",
            compact ? "text-sm" : "text-lg",
            invert ? "text-white" : "text-foreground",
          )}
        >
          Alcaldia de Rionegro
        </p>
        <p
          className={cn(
            "leading-none",
            compact ? "text-[11px]" : "text-xs",
            invert ? "text-white/75" : "text-muted",
          )}
        >
          Departamento de Antioquia
        </p>
      </div>
    </div>
  );
}
