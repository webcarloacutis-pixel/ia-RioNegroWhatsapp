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

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CO").format(value);
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function rate(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
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

function SimulationMetricCard({
  label,
  value,
  note,
  tone = "info",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  return (
    <article className="rounded-[24px] border border-border bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted">{label}</p>
        <Badge tone={tone}>{tone === "success" ? "OK" : tone === "danger" ? "Error" : "QA"}</Badge>
      </div>
      <p className="mt-3 break-words text-2xl font-semibold leading-tight text-foreground">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">{note}</p>
    </article>
  );
}

function ChartBar({
  label,
  value,
  total,
  tone = "ok",
}: {
  label: string;
  value: number;
  total: number;
  tone?: QaModuleMetric["status"];
}) {
  return (
    <div className="rounded-[22px] bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-foreground">{label}</p>
        <span className="text-sm text-muted">
          {formatNumber(value)} · {percent(rate(value, total))}
        </span>
      </div>
      <div className="mt-3">
        <ProgressBar value={rate(value, total)} tone={tone} />
      </div>
    </div>
  );
}

function TimeBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div className="rounded-[22px] bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-foreground">{label}</p>
        <span className="text-sm text-muted">{formatNumber(value)}ms</span>
      </div>
      <div className="mt-3">
        <ProgressBar value={rate(value, max || 1)} tone="warning" />
      </div>
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
  const simulationSuccessRate = simulation ? rate(simulation.success, simulation.total) : 0;
  const simulationIgnoredRate = simulation ? rate(simulation.ignored, simulation.total) : 0;
  const simulationReportRate = simulation
    ? rate(simulation.citizenReportsCreated, simulation.total)
    : 0;
  const simulationFailedRate = simulation ? rate(simulation.failed, simulation.total) : 0;
  const generalMessages = simulation
    ? Math.max(0, simulation.total - simulation.citizenReportsCreated)
    : 0;
  const nonAnnouncementMessages = simulation
    ? Math.max(0, simulation.total - simulation.announcementsSimulated)
    : 0;
  const maxTiming = simulation
    ? Math.max(simulation.avgMs, simulation.p95Ms, simulation.p99Ms, 1)
    : 1;
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

      {simulation ? (
        <section className="space-y-6">
          <PanelCard className="space-y-4 border border-[#15803d]/20 bg-[#f0fdf4]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <Badge tone={simulation.dryRun ? "success" : "danger"}>
                  {simulation.dryRun ? "Simulacion segura" : "Ejecucion real"}
                </Badge>
                <h2 className="mt-3 text-2xl text-foreground">
                  Simulacion segura / dry-run
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  No se enviaron mensajes reales ni se consumieron creditos de OpenAI,
                  ElevenLabs o UltraMsg.
                </p>
              </div>
              <div className="rounded-[22px] bg-white px-4 py-3 text-sm text-muted">
                Generada: {formatGeneratedAt(simulation.generatedAt)}
              </div>
            </div>
          </PanelCard>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SimulationMetricCard
              label="Total simulados"
              value={formatNumber(simulation.total)}
              note="Mensajes generados por el escenario de QA."
            />
            <SimulationMetricCard
              label="Exitosos"
              value={formatNumber(simulation.success)}
              note={`Tasa de exito ${percent(simulationSuccessRate)}.`}
              tone="success"
            />
            <SimulationMetricCard
              label="Fallidos"
              value={formatNumber(simulation.failed)}
              note={`Tasa de fallo ${percent(simulationFailedRate)}.`}
              tone={simulation.failed > 0 ? "danger" : "success"}
            />
            <SimulationMetricCard
              label="Ignorados"
              value={formatNumber(simulation.ignored)}
              note={`Tasa de ignorados ${percent(simulationIgnoredRate)}.`}
              tone="warning"
            />
            <SimulationMetricCard
              label="Reportes detectados"
              value={formatNumber(simulation.intentDetected)}
              note="Intenciones de denuncia o alerta detectadas."
            />
            <SimulationMetricCard
              label="Reportes ciudadanos creados"
              value={formatNumber(simulation.citizenReportsCreated)}
              note={`Tasa de reportes ${percent(simulationReportRate)}.`}
            />
            <SimulationMetricCard
              label="Comunicados simulados"
              value={formatNumber(simulation.announcementsSimulated)}
              note="Casos de comunicados procesados en mock."
            />
            <SimulationMetricCard
              label="Respuestas generadas"
              value={formatNumber(simulation.responsesGenerated)}
              note="Respuestas controladas sin llamadas pagas."
            />
            <SimulationMetricCard
              label="Tasa de error"
              value={percent(simulationFailedRate)}
              note="Fallos internos sobre el total simulado."
              tone={simulation.failed > 0 ? "danger" : "success"}
            />
            <SimulationMetricCard
              label="Modo"
              value={simulation.dryRun ? "Dry-run" : "Real"}
              note="Indica si hubo riesgo de envio real."
              tone={simulation.dryRun ? "success" : "danger"}
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <PanelCard className="space-y-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
                  Resultado
                </p>
                <h2 className="mt-2 text-2xl text-foreground">
                  Exito vs ignorados vs fallidos
                </h2>
              </div>
              <div className="space-y-3">
                <ChartBar label="Exitosos" value={simulation.success} total={simulation.total} />
                <ChartBar
                  label="Ignorados"
                  value={simulation.ignored}
                  total={simulation.total}
                  tone="warning"
                />
                <ChartBar
                  label="Fallidos"
                  value={simulation.failed}
                  total={simulation.total}
                  tone="fail"
                />
              </div>
            </PanelCard>

            <PanelCard className="space-y-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
                  Ciudadania
                </p>
                <h2 className="mt-2 text-2xl text-foreground">
                  Reportes creados vs mensajes generales
                </h2>
              </div>
              <div className="space-y-3">
                <ChartBar
                  label="Reportes creados"
                  value={simulation.citizenReportsCreated}
                  total={simulation.total}
                />
                <ChartBar
                  label="Mensajes generales"
                  value={generalMessages}
                  total={simulation.total}
                  tone="warning"
                />
              </div>
            </PanelCard>

            <PanelCard className="space-y-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
                  Comunicados
                </p>
                <h2 className="mt-2 text-2xl text-foreground">Comunicados simulados</h2>
              </div>
              <div className="space-y-3">
                <ChartBar
                  label="Comunicados simulados"
                  value={simulation.announcementsSimulated}
                  total={simulation.total}
                />
                <ChartBar
                  label="Otros mensajes"
                  value={nonAnnouncementMessages}
                  total={simulation.total}
                  tone="warning"
                />
              </div>
            </PanelCard>

            <PanelCard className="space-y-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
                  Rendimiento
                </p>
                <h2 className="mt-2 text-2xl text-foreground">
                  Tiempo promedio, p95 y p99
                </h2>
              </div>
              <div className="space-y-3">
                <TimeBar label="Promedio" value={simulation.avgMs} max={maxTiming} />
                <TimeBar label="p95" value={simulation.p95Ms} max={maxTiming} />
                <TimeBar label="p99" value={simulation.p99Ms} max={maxTiming} />
              </div>
            </PanelCard>
          </section>
        </section>
      ) : (
        <PanelCard className="space-y-3">
          <Badge tone="warning">Sin simulacion</Badge>
          <h2 className="text-2xl text-foreground">No hay resultados de simulacion</h2>
          <p className="text-sm leading-6 text-muted">
            Ejecuta `npm run simulate:1000` con las variables mock activas para generar
            `simulation-results/latest.json`.
          </p>
        </PanelCard>
      )}

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
              Seguridad
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Modo de pruebas</h2>
          </div>
          <div className="rounded-[24px] bg-surface px-4 py-4 text-sm leading-6 text-muted">
            <p>
              Simulacion: {simulation?.dryRun ? "dry-run seguro" : "sin dato"}
            </p>
            <p>
              Creditos consumidos: {simulation?.dryRun ? "0" : "revisar configuracion"}
            </p>
            <p>
              Archivo: `simulation-results/latest.json`
            </p>
          </div>
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
