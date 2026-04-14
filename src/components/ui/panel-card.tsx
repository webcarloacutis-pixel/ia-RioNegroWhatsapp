import { cn } from "@/lib/utils";

type PanelCardProps = {
  children: React.ReactNode;
  className?: string;
};

export function PanelCard({ children, className }: PanelCardProps) {
  return <section className={cn("panel-card rounded-[28px] p-6", className)}>{children}</section>;
}
