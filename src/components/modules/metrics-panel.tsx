"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { PanelCard } from "@/components/ui/panel-card";
import { StatCard } from "@/components/ui/stat-card";
import {
  formatCompactNumber,
  formatDateTime,
  formatDeliveryModeLabel,
} from "@/lib/format";
import type { AssistantAnalyticsSummary, MetricsData } from "@/lib/types";

type MetricsPanelProps = {
  data: MetricsData;
  assistantAnalytics: AssistantAnalyticsSummary;
};

type TooltipPayload = {
  color?: string;
  dataKey?: string;
  name?: string;
  value?: number;
};

function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-[18px] border border-border bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      {payload.map((entry) => (
        <p key={`${entry.dataKey}-${entry.name}`} className="mt-1 text-sm font-semibold text-foreground">
          {formatCompactNumber(entry.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-border bg-surface px-4 py-5">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

export function MetricsPanel({ data, assistantAnalytics }: MetricsPanelProps) {
  const deliveryTrend =
    data.deliveryTrend.length > 0 ? data.deliveryTrend : [{ label: "Sin datos", deliveries: 0 }];
  const assistantTrend =
    assistantAnalytics.dailyUsage.length > 0
      ? assistantAnalytics.dailyUsage
      : [{ label: "Sin datos", value: 0 }];
  const typeMax = Math.max(...data.typeUsage.map((item) => item.value), 1);
  const segmentMax = Math.max(...data.segmentReach.map((item) => item.value), 1);

  return (
    <div className="space-y-8">
      <section className="panel-card rounded-[34px] px-7 py-8">
        <div className="flex flex-wrap gap-3">
          <Badge tone="info">Analitica ejecutiva</Badge>
          <Badge tone="success">Vista reforzada</Badge>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h1 className="text-4xl text-foreground">Metricas listas para presentar a la alcaldia</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted">
              Mejoramos esta vista para que no se rompa con datos vacíos, textos largos ni
              pantallas pequeñas, y para que sea más clara al mostrar uso del canal y del
              asistente.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] bg-white/85 px-4 py-4 shadow-sm">
              <p className="text-sm text-muted">Topico top del bot</p>
              <p className="mt-2 text-lg font-semibold leading-7 text-foreground">
                {assistantAnalytics.totals.topTopic}
              </p>
            </div>
            <div className="rounded-[24px] bg-white/85 px-4 py-4 shadow-sm">
              <p className="text-sm text-muted">Pregunta frecuente</p>
              <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-foreground">
                {assistantAnalytics.totals.topQuestion}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ejecuciones"
          value={formatCompactNumber(data.totals.executedMessages)}
          note="Cantidad total de envios y simulaciones registrados."
          badge="Total"
        />
        <StatCard
          label="Alcance estimado"
          value={formatCompactNumber(data.totals.deliveredUsers)}
          note="Usuarios impactados segun la audiencia definida."
          badge="Usuarios"
        />
        <StatCard
          label="Simulaciones demo"
          value={formatCompactNumber(data.totals.demoExecutions)}
          note="Envios demostrativos para presentacion institucional."
          badge="Demo"
        />
        <StatCard
          label="Tipo mas usado"
          value={data.totals.mostUsedType}
          note="Categoria con mayor recurrencia en comunicados."
          badge="Top"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <PanelCard className="space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Tendencia
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Comportamiento de ejecuciones</h2>
          </div>
          <div className="h-80 min-h-[320px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={320}>
              <BarChart data={deliveryTrend} barGap={8}>
                <CartesianGrid vertical={false} stroke="rgba(22,36,51,0.08)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(23,63,115,0.06)" }} />
                <Bar dataKey="deliveries" fill="#173f73" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>

        <PanelCard className="space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Comparativo
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Tipos de comunicados mas usados</h2>
          </div>
          <div className="space-y-3">
            {data.typeUsage.length ? (
              data.typeUsage.map((item) => {
                const width = `${Math.max(6, (item.value / typeMax) * 100)}%`;

                return (
                  <div key={item.label} className="rounded-[24px] bg-surface px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-foreground">{item.label}</p>
                      <span className="text-sm font-semibold text-primary">{item.value}</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white">
                      <div className="h-2 rounded-full bg-primary" style={{ width }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyBlock
                title="Sin tipos registrados"
                body="Todavia no hay comunicados suficientes para construir el comparativo por categoria."
              />
            )}
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Alcance territorial
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Rendimiento por segmento</h2>
          </div>
          <div className="space-y-3">
            {data.segmentReach.length ? (
              data.segmentReach.map((segment) => {
                const width = `${Math.max(8, (segment.value / segmentMax) * 100)}%`;

                return (
                  <div
                    key={segment.label}
                    className="rounded-[24px] border border-border bg-white px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-foreground">{segment.label}</p>
                      <span className="text-sm text-muted">
                        {formatCompactNumber(segment.value)} usuarios
                      </span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-surface">
                      <div className="h-2 rounded-full bg-accent" style={{ width }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyBlock
                title="Sin segmentos con alcance"
                body="Cuando existan envios o simulaciones, aqui veras que audiencias fueron las mas impactadas."
              />
            )}
          </div>
        </PanelCard>

        <PanelCard className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Demo reciente
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Ultimas simulaciones</h2>
          </div>
          <div className="space-y-3">
            {data.recentDemoLogs.length ? (
              data.recentDemoLogs.map((log) => (
                <div key={log.id} className="rounded-[24px] bg-surface px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-foreground">{log.announcementTitle}</p>
                    <Badge tone="warning">{formatDeliveryModeLabel(log.mode)}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {log.segmentName ?? "Cobertura general"} ·{" "}
                    {formatCompactNumber(log.deliveredCount)} usuarios
                  </p>
                  <p className="mt-1 text-sm text-muted">{formatDateTime(log.createdAt)}</p>
                </div>
              ))
            ) : (
              <EmptyBlock
                title="No hay simulaciones recientes"
                body="Todavia no se han ejecutado demostraciones manuales o demo en esta sesion."
              />
            )}
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Chatbot oficial
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Uso del asistente de Rionegro</h2>
          </div>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Consultas totales"
              value={formatCompactNumber(assistantAnalytics.totals.totalQueries)}
              note="Preguntas registradas en la capa conversacional."
              badge="Chatbot"
            />
            <StatCard
              label="Consultas hoy"
              value={formatCompactNumber(assistantAnalytics.totals.todayQueries)}
              note="Uso diario del canal oficial inteligente."
              badge="Hoy"
            />
            <StatCard
              label="Tema mas consultado"
              value={assistantAnalytics.totals.topTopic}
              note="Categoria con mas preguntas ciudadanas."
              badge="Top"
            />
            <StatCard
              label="Pregunta frecuente"
              value={assistantAnalytics.totals.topQuestion}
              note="Consulta mas repetida en el asistente."
              badge="FAQ"
            />
          </section>

          <div className="h-80 min-h-[320px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={320}>
              <BarChart data={assistantTrend} barGap={8}>
                <CartesianGrid vertical={false} stroke="rgba(22,36,51,0.08)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(13,123,130,0.08)" }} />
                <Bar dataKey="value" fill="#0f766e" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>

        <PanelCard className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Consultas recientes
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Trazabilidad del asistente</h2>
          </div>
          <div className="space-y-3">
            {assistantAnalytics.recentQueries.length ? (
              assistantAnalytics.recentQueries.map((query) => (
                <div
                  key={`${query.createdAt}-${query.message}`}
                  className="rounded-[24px] bg-surface px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-foreground">{query.topic}</p>
                    <Badge tone="info">Canal oficial</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">{query.message}</p>
                  <p className="mt-1 text-sm text-muted">{formatDateTime(query.createdAt)}</p>
                </div>
              ))
            ) : (
              <EmptyBlock
                title="Sin trazabilidad reciente"
                body="Cuando el asistente reciba consultas reales o de prueba, aqui se mostrara el historial reciente."
              />
            )}
          </div>
        </PanelCard>
      </section>
    </div>
  );
}
