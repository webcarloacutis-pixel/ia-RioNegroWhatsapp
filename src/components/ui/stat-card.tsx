import { Badge } from "@/components/ui/badge";
import { PanelCard } from "@/components/ui/panel-card";

type StatCardProps = {
  label: string;
  value: string;
  note: string;
  badge?: string;
};

export function StatCard({ label, value, note, badge }: StatCardProps) {
  return (
    <PanelCard className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted">{label}</p>
        {badge ? <Badge tone="info">{badge}</Badge> : null}
      </div>
      <div>
        <p className="break-words text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl">
          {value}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">{note}</p>
      </div>
    </PanelCard>
  );
}
