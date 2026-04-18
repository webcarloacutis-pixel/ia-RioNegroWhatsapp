import { cn } from "@/lib/utils";

type BadgeProps = {
  children: React.ReactNode;
  tone?: "default" | "info" | "success" | "warning" | "danger";
  className?: string;
};

const toneClasses: Record<NonNullable<BadgeProps["tone"]>, string> = {
  default: "bg-surface text-foreground",
  info: "bg-primary-soft text-primary",
  success: "bg-[#dbf2e8] text-success",
  warning: "bg-[#faebcf] text-[#93661c]",
  danger: "bg-[#f9d8d8] text-[#a33434]",
};

export function Badge({ children, tone = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
