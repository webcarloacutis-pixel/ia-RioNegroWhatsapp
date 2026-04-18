"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { PanelCard } from "@/components/ui/panel-card";
import { StatCard } from "@/components/ui/stat-card";
import { formatCompactNumber, formatDateTime, formatDeliveryModeLabel, formatTypeLabel } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

type DashboardOverviewProps = {
  data: DashboardData;
};

const pieColors = ["#173f73", "#0d7b82", "#f2b24d", "#1f8f62", "#c77d4f"];

export function DashboardOverview({ data }: DashboardOverviewProps) {
  return (
    <div className="space-y-6">
      <section className="panel-card overflow-hidden rounded-[34px] px-7 py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge tone="info">Centro de operaciones</Badge>
            <h1 className="mt-4 text-4xl text-foreground">
              Controla comunicados oficiales, simulaciones y conocimiento ciudadano desde un solo lugar.
            </h1>
            <p className="mt-4 text-base leading-8 text-muted">
              Este panel esta orientado a demo institucional: muestra impacto, orden operativo y deja lista la futura integracion con tu bot de WhatsApp.
            </p>
          </div>
          <div className="rounded-[28px] border border-border bg-white/70 px-5 py-4">
            <p className="text-sm font-semibold text-muted">Estado del canal</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">Modo demo activo</p>
            <p className="mt-2 text-sm text-muted">
              Los envios se procesan con logs y audiencias simuladas.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Usuarios simulados"
          value={formatCompactNumber(data.stats.users)}
          note="Cobertura total calculada a partir de los segmentos registrados."
          badge="Segmentado"
        />
        <StatCard
          label="Mensajes gestionados"
          value={formatCompactNumber(data.stats.messages)}
          note="Incluye envios demo, manuales y programados."
          badge="Operativo"
        />
        <StatCard
          label="Comunicados activos"
          value={formatCompactNumber(data.stats.activeAnnouncements)}
          note="Piezas listas para ser simuladas o enviadas."
          badge="Programados"
        />
        <StatCard
          label="Segmentos disponibles"
          value={formatCompactNumber(data.stats.segments)}
          note="Zonas y coberturas listas para segmentar."
          badge="Territorio"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <PanelCard className="space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Ritmo de entregas
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Actividad de los ultimos 7 dias</h2>
          </div>
          <div className="h-80 min-h-[320px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={320}>
              <AreaChart data={data.messageTrend}>
                <defs>
                  <linearGradient id="dashboardTrend" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#173f73" stopOpacity={0.36} />
                    <stop offset="100%" stopColor="#173f73" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(22,36,51,0.08)" />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="deliveries"
                  stroke="#173f73"
                  strokeWidth={3}
                  fill="url(#dashboardTrend)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>

        <PanelCard className="space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Tipologia
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Uso por tipo de comunicado</h2>
          </div>
          <div className="h-80 min-h-[320px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={320}>
              <PieChart>
                <Pie
                  data={data.typeBreakdown}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={65}
                  outerRadius={108}
                  paddingAngle={4}
                >
                  {data.typeBreakdown.map((entry, index) => (
                    <Cell key={entry.label} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid gap-2">
            {data.typeBreakdown.map((item, index) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: pieColors[index % pieColors.length] }}
                  />
                  <span className="font-medium">{item.label}</span>
                </div>
                <span className="text-muted">{item.value}</span>
              </div>
            ))}
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Proximos envios
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Comunicados listos para salir</h2>
          </div>
          <div className="space-y-4">
            {data.upcomingAnnouncements.map((announcement) => (
              <article
                key={announcement.id}
                className="rounded-[26px] border border-border bg-white p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-foreground">
                      {announcement.title}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-muted">
                      {announcement.message}
                    </p>
                  </div>
                  <Badge tone="info">{formatTypeLabel(announcement.displayType)}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted">
                  <span>{formatDateTime(announcement.scheduledAt)}</span>
                  <span>•</span>
                  <span>{announcement.location ?? "Sin lugar definido"}</span>
                  <span>•</span>
                  <span>{announcement.segment?.name ?? "Cobertura general"}</span>
                </div>
              </article>
            ))}
          </div>
        </PanelCard>

        <PanelCard className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Actividad reciente
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Ultimos movimientos del canal</h2>
          </div>
          <div className="space-y-3">
            {data.recentLogs.map((log) => (
              <div key={log.id} className="rounded-[24px] bg-surface px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-foreground">{log.announcementTitle}</p>
                  <Badge tone={log.mode === "DEMO" ? "warning" : "success"}>
                    {formatDeliveryModeLabel(log.mode)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {log.segmentName ?? "Cobertura general"} • {formatCompactNumber(log.deliveredCount)} usuarios
                </p>
                <p className="mt-1 text-sm text-muted">{formatDateTime(log.createdAt)}</p>
              </div>
            ))}
          </div>
        </PanelCard>
      </section>
    </div>
  );
}
