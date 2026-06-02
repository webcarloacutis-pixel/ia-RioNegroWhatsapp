import { Badge } from "@/components/ui/badge";
import { PanelCard } from "@/components/ui/panel-card";
import { StatCard } from "@/components/ui/stat-card";
import type { buildQaSnapshot, QaModuleMetric } from "@/server/qa-service";

type QaSnapshot = Awaited<ReturnType<typeof buildQaSnapshot>>;

type SystemStatusPanelProps = {
  snapshot: QaSnapshot;
};

const statusTone: Record<QaModuleMetric["status"], "success" | "warning" | "danger"> = {
  ok: "success",
  warning: "warning",
  fail: "danger",
};

const statusLabel: Record<QaModuleMetric["status"], string> = {
  ok: "OK",
  warning: "Atencion",
  fail: "Falla",
};

function percent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
}

function ProgressBar({
  value,
  tone = "ok",
}: {
  value: number;
  tone?: QaModuleMetric["status"];
}) {
  const width = `${Math.min(100, Math.max(0, value))}%`;
  const color =
    tone === "fail" ? "bg-[#c2410c]" : tone === "warning" ? "bg-[#d97706]" : "bg-[#15803d]";

  return (
    <div className="h-2 w-full min-w-[180px] rounded-full bg-surface">
      <div className={`h-2 rounded-full ${color}`} style={{ width }} />
    </div>
  );
}

function ModuleRow({ item }: { item: QaModuleMetric }) {
  return (
    <article className="rounded-[24px] border border-border bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{item.module}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{item.details}</p>
        </div>
        <Badge tone={statusTone[item.status]}>{statusLabel[item.status]}</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_120px] md:items-center">
        <ProgressBar value={item.successRate} tone={item.status} />
        <p className="text-sm font-semibold text-foreground">
          Exito {percent(item.successRate)}
        </p>
      </div>
    </article>
  );
}

function ErrorTypeList({ errors }: { errors?: Record<string, number> }) {
  const entries = Object.entries(errors ?? {});

  if (!entries.length) {
    return <p className="text-sm text-muted">Sin errores relevantes registrados.</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-sm">
          <span className="font-medium text-foreground">{label}</span>
          <span className="text-muted">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function SystemStatusPanel({ snapshot }: SystemStatusPanelProps) {
  const simulation = snapshot.simulation;
  const moduleStatusBars = [
    { label: "OK", value: snapshot.summary.ok, tone: "ok" as const },
    { label: "Atencion", value: snapshot.summary.warning, tone: "warning" as const },
    { label: "Falla", value: snapshot.summary.fail, tone: "fail" as const },
  ];
  const maxModuleStatus = Math.max(...moduleStatusBars.map((item) => item.value), 1);

  return (
    <div className="space-y-8">
      <section className="panel-card rounded-[34px] px-7 py-8">
        <div className="flex flex-wrap gap-3">
          <Badge tone={snapshot.ok ? "success" : "danger"}>
            {snapshot.ok ? "Sistema operativo" : "Revisar fallas"}
          </Badge>
          <Badge tone="info">QA y observabilidad</Badge>
        </div>
        <div className="mt-5 max-w-4xl">
          <h1 className="text-4xl text-foreground">Estado del Sistema</h1>
          <p className="mt-3 text-base leading-8 text-muted">
            Vista de diagnostico para revisar salud de APIs, base de datos, UltraMsg,
            comunicados, denuncias y simulaciones sin exponer secretos ni enviar mensajes reales.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Salud de modulos"
          value={percent(snapshot.summary.successRate)}
          note={`${snapshot.summary.ok}/${snapshot.summary.totalModules} modulos en OK.`}
          badge="General"
        />
        <StatCard
          label="Tasa de error"
          value={percent(snapshot.summary.errorRate)}
          note={`${snapshot.summary.fail} modulo(s) en falla controlada.`}
          badge="Errores"
        />
        <StatCard
          label="Base de datos"
          value={snapshot.diagnostics.db.connected ? "OK" : "Falla"}
          note={`${snapshot.diagnostics.db.responseMs}ms de respuesta en diagnostico.`}
          badge="Prisma"
        />
        <StatCard
          label="UltraMsg"
          value={snapshot.diagnostics.ultramsg.configured ? "Configurado" : "Incompleto"}
          note={
            snapshot.diagnostics.ultramsg.safeMode
              ? "Safe mode activo: envios proactivos reales bloqueados."
              : "Listo para envio real si hay destinatarios."
          }
          badge={snapshot.diagnostics.ultramsg.dryRun ? "Dry-run" : "Canal"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <PanelCard className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Modulos
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Resumen por estado</h2>
          </div>
          <div className="space-y-4">
            {moduleStatusBars.map((item) => {
              const width = (item.value / maxModuleStatus) * 100;

              return (
                <div key={item.label} className="rounded-[24px] bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-foreground">{item.label}</p>
                    <span className="text-sm text-muted">{item.value}</span>
                  </div>
                  <div className="mt-3">
                    <ProgressBar value={width} tone={item.tone} />
                  </div>
                </div>
              );
            })}
          </div>
        </PanelCard>

        <PanelCard className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Simulacion
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Ultima prueba de 1000 usuarios</h2>
          </div>
          {simulation ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] bg-surface px-4 py-4">
                  <p className="text-sm text-muted">Procesados</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {simulation.success}/{simulation.total}
                  </p>
                </div>
                <div className="rounded-[22px] bg-surface px-4 py-4">
                  <p className="text-sm text-muted">Error</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {percent(simulation.errorRate)}
                  </p>
                </div>
              </div>
              <ProgressBar value={100 - simulation.errorRate} />
              <div className="grid gap-2 text-sm text-muted">
                <span>Promedio: {simulation.avgMs}ms</span>
                <span>p95: {simulation.p95Ms}ms</span>
                <span>p99: {simulation.p99Ms}ms</span>
                <span>Reportes creados: {simulation.citizenReportsCreated}</span>
                <span>Comunicados simulados: {simulation.announcementsSimulated}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-border bg-surface px-4 py-5">
              <p className="font-semibold text-foreground">Sin simulacion registrada</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Ejecuta `npm run simulate:1000` para generar resultados locales.
              </p>
            </div>
          )}
        </PanelCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Estado tecnico
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Detalle por modulo</h2>
          </div>
          <div className="space-y-3">
            {snapshot.modules.map((item) => (
              <ModuleRow key={item.module} item={item} />
            ))}
          </div>
        </PanelCard>

        <PanelCard className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Fallos
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Tipos de errores</h2>
          </div>
          <ErrorTypeList errors={simulation?.errorsByType} />
          <div className="rounded-[24px] bg-surface px-4 py-4 text-sm leading-6 text-muted">
            <p>
              Comunicados programados: {snapshot.diagnostics.announcements.ok
                ? snapshot.diagnostics.announcements.counts?.scheduled
                : "sin dato"}
            </p>
            <p>
              Vencidos pendientes: {snapshot.diagnostics.announcements.ok
                ? snapshot.diagnostics.announcements.counts?.due
                : "sin dato"}
            </p>
            <p>
              Reportes urgentes: {snapshot.diagnostics.citizenReports.ok
                ? snapshot.diagnostics.citizenReports.counts?.urgent
                : "sin dato"}
            </p>
          </div>
        </PanelCard>
      </section>
    </div>
  );
}
