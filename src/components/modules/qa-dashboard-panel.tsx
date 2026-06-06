"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  FileJson,
  FileText,
  Gauge,
  LineChart as LineChartIcon,
  Moon,
  Pencil,
  Play,
  Plus,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelCard } from "@/components/ui/panel-card";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  QaCategoryMetric,
  QaDashboardData,
  QaRunRecord,
  QaScenario,
  QaScenarioResult,
  QaTestStatus,
} from "@/lib/types";

type QaDashboardPanelProps = {
  initialData: QaDashboardData;
};

type ViewKey =
  | "resumen"
  | "simulaciones"
  | "resultados"
  | "metricas"
  | "historial"
  | "regresiones"
  | "exportacion";

type ScenarioFormState = {
  category: string;
  title: string;
  description: string;
  input: string;
  expectedBehavior: string;
  expectedKeywords: string;
  forbiddenKeywords: string;
  active: boolean;
};

type TooltipPayload = {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
};

const views: Array<{ key: ViewKey; label: string; icon: typeof Gauge }> = [
  { key: "resumen", label: "Resumen", icon: Gauge },
  { key: "simulaciones", label: "Simulaciones", icon: Play },
  { key: "resultados", label: "Resultados", icon: ClipboardCheck },
  { key: "metricas", label: "Metricas", icon: BarChart3 },
  { key: "historial", label: "Historial", icon: LineChartIcon },
  { key: "regresiones", label: "Regresiones", icon: ShieldAlert },
  { key: "exportacion", label: "Exportacion", icon: Download },
];

const defaultCategories = [
  "Informacion municipal",
  "Tramites",
  "Atencion ciudadana",
  "Horarios",
  "Dependencias",
  "Seguridad",
  "Casos ambiguos",
  "Casos extremos",
  "Integraciones",
  "Memoria",
  "Contexto",
  "Bilingue",
  "Alucinaciones",
  "Prompt Injection",
];

const emptyForm: ScenarioFormState = {
  category: defaultCategories[0],
  title: "",
  description: "",
  input: "",
  expectedBehavior: "",
  expectedKeywords: "",
  forbiddenKeywords: "",
  active: true,
};

const pieColors = ["#1f8f62", "#b34b4b", "#f2b24d", "#173f73"];

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CO").format(value);
}

function formatPercent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
}

function formatDate(value: string | null) {
  if (!value) return "Sin ejecutar";

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function keywordsToArray(value: string) {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function scenarioToForm(scenario: QaScenario): ScenarioFormState {
  return {
    category: scenario.category,
    title: scenario.title,
    description: scenario.description,
    input: scenario.input,
    expectedBehavior: scenario.expectedBehavior,
    expectedKeywords: (scenario.expectedKeywords ?? []).join(", "),
    forbiddenKeywords: (scenario.forbiddenKeywords ?? []).join(", "),
    active: scenario.active,
  };
}

function statusTone(status: QaTestStatus): "success" | "warning" | "danger" {
  if (status === "PASS") return "success";
  if (status === "WARNING") return "warning";
  return "danger";
}

function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-border bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      {payload.map((entry) => (
        <p key={`${entry.dataKey}-${entry.name}`} className="mt-1 text-sm font-semibold text-foreground">
          {entry.name ?? entry.dataKey}: {formatNumber(entry.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

function ProgressBar({ value, tone = "success" }: { value: number; tone?: "success" | "warning" | "danger" }) {
  const color =
    tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-success";

  return (
    <div className="h-2 w-full rounded-full bg-surface">
      <div
        className={cn("h-2 rounded-full transition-all", color)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">{eyebrow}</p>
        <h2 className="mt-2 text-2xl text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function CategoryMetricRow({ item }: { item: QaCategoryMetric }) {
  const tone = item.fail > 0 ? "danger" : item.warning > 0 ? "warning" : "success";

  return (
    <article className="rounded-[22px] border border-border bg-white px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{item.category}</p>
          <p className="mt-1 text-sm text-muted">
            {item.total} casos - {item.pass} pass - {item.fail} fail - {item.warning} warning
          </p>
        </div>
        <Badge tone={tone}>{formatPercent(item.percentage)}</Badge>
      </div>
      <div className="mt-3">
        <ProgressBar value={item.percentage} tone={tone} />
      </div>
    </article>
  );
}

function ResultStatusBadge({ result }: { result: QaScenarioResult }) {
  return (
    <Badge tone={statusTone(result.status)} className="gap-1.5">
      {result.status === "PASS" ? <CheckCircle2 className="size-3.5" /> : null}
      {result.status === "WARNING" ? <AlertTriangle className="size-3.5" /> : null}
      {result.status === "FAIL" ? <XCircle className="size-3.5" /> : null}
      {result.status}
    </Badge>
  );
}

function ScenarioStatusBadge({ scenario }: { scenario: QaScenario }) {
  return scenario.active ? <Badge tone="success">Activo</Badge> : <Badge tone="warning">Inactivo</Badge>;
}

export function QaDashboardPanel({ initialData }: QaDashboardPanelProps) {
  const [data, setData] = useState(initialData);
  const [activeView, setActiveView] = useState<ViewKey>("resumen");
  const [darkMode, setDarkMode] = useState(false);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [form, setForm] = useState<ScenarioFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(
    initialData.latestResults[0]?.id ?? null,
  );

  const selectedResult = useMemo(
    () => data.latestResults.find((item) => item.id === selectedResultId) ?? data.latestResults[0] ?? null,
    [data.latestResults, selectedResultId],
  );
  const categories = useMemo(
    () => Array.from(new Set([...defaultCategories, ...data.scenarios.map((item) => item.category)])),
    [data.scenarios],
  );
  const scenarioStats = useMemo(() => {
    const active = data.scenarios.filter((item) => item.active).length;
    return {
      total: data.scenarios.length,
      active,
      inactive: data.scenarios.length - active,
    };
  }, [data.scenarios]);

  useEffect(() => {
    if (!running) return;

    setRunProgress(12);
    const interval = window.setInterval(() => {
      setRunProgress((value) => Math.min(92, value + 7));
    }, 500);

    return () => window.clearInterval(interval);
  }, [running]);

  async function refreshDashboard() {
    const response = await fetch("/api/qa-dashboard");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "No se pudo actualizar QA.");
    }

    setData(payload.data);
    setSelectedResultId(payload.data.latestResults[0]?.id ?? null);
  }

  async function runAllTests() {
    try {
      setRunning(true);
      setRunProgress(0);

      const response = await fetch("/api/qa-dashboard/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeInactive: false, evaluatorMode: "rules" }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo ejecutar QA.");
      }

      setRunProgress(100);
      await refreshDashboard();
      toast.success("Suite QA ejecutada.");
      setActiveView("resultados");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo ejecutar QA.");
    } finally {
      window.setTimeout(() => {
        setRunning(false);
        setRunProgress(0);
      }, 650);
    }
  }

  async function saveScenario() {
    try {
      setSaving(true);
      const payload = {
        ...form,
        expectedKeywords: keywordsToArray(form.expectedKeywords),
        forbiddenKeywords: keywordsToArray(form.forbiddenKeywords),
      };
      const response = await fetch(
        editingId ? `/api/qa-dashboard/scenarios/${editingId}` : "/api/qa-dashboard/scenarios",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo guardar el escenario.");
      }

      setForm(emptyForm);
      setEditingId(null);
      await refreshDashboard();
      toast.success(editingId ? "Escenario actualizado." : "Escenario creado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el escenario.");
    } finally {
      setSaving(false);
    }
  }

  async function patchScenario(id: string, patch: Partial<QaScenario>) {
    const response = await fetch(`/api/qa-dashboard/scenarios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.error ?? "No se pudo actualizar el escenario.");
    }

    await refreshDashboard();
  }

  async function duplicateScenario(id: string) {
    try {
      const response = await fetch(`/api/qa-dashboard/scenarios/${id}/duplicate`, {
        method: "POST",
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo duplicar el escenario.");
      }

      await refreshDashboard();
      toast.success("Escenario duplicado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo duplicar el escenario.");
    }
  }

  async function deleteScenario(id: string) {
    if (!window.confirm("Eliminar este escenario QA?")) return;

    try {
      const response = await fetch(`/api/qa-dashboard/scenarios/${id}`, { method: "DELETE" });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo eliminar el escenario.");
      }

      await refreshDashboard();
      toast.success("Escenario eliminado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el escenario.");
    }
  }

  function editScenario(scenario: QaScenario) {
    setEditingId(scenario.id);
    setForm(scenarioToForm(scenario));
    setActiveView("simulaciones");
  }

  function downloadReport(format: "json" | "csv" | "pdf") {
    window.location.href = `/api/qa-dashboard/export?format=${format}`;
  }

  const chartFallback = [{ label: "Sin datos", value: 0 }];
  const historicalData = data.charts.historicalEvolution.length
    ? data.charts.historicalEvolution
    : chartFallback;
  const responseTimeData = data.charts.responseTimeTrend.length
    ? data.charts.responseTimeTrend
    : chartFallback;
  const errorDistribution = data.charts.errorDistribution.length
    ? data.charts.errorDistribution
    : chartFallback;

  return (
    <div
      className={cn(
        "space-y-8 transition-colors",
        darkMode && "rounded-[34px] bg-[#111827] p-4 shadow-2xl shadow-[#111827]/20",
      )}
    >
      <section
        className={cn(
          "rounded-[34px] border px-7 py-8 shadow-xl",
          darkMode
            ? "border-white/10 bg-[#172033] text-white"
            : "border-border bg-white/95 text-foreground",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-3">
            <Badge tone={data.summary.failed > 0 ? "danger" : "success"}>
              {formatPercent(data.summary.passRate)} pass rate
            </Badge>
            <Badge tone={data.summary.regressionCount > 0 ? "danger" : "info"}>
              {data.summary.regressionCount} regresiones
            </Badge>
            <Badge tone={data.summary.hallucinationCount > 0 ? "warning" : "success"}>
              {data.summary.hallucinationCount} alucinaciones
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="gap-2" onClick={() => setDarkMode((value) => !value)}>
              <Moon className="size-4" />
              Dark mode
            </Button>
            <Button className="gap-2" onClick={runAllTests} disabled={running}>
              <Play className="size-4" />
              {running ? "Ejecutando" : "Run all tests"}
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px] xl:items-end">
          <div>
            <p className={cn("text-sm font-semibold uppercase tracking-[0.28em]", darkMode ? "text-white/62" : "text-muted")}>
              QA Dashboard
            </p>
            <h1 className={cn("mt-2 text-4xl", darkMode ? "text-white" : "text-foreground")}>
              Evaluacion profesional del chatbot
            </h1>
            <p className={cn("mt-4 max-w-3xl text-base leading-8", darkMode ? "text-white/72" : "text-muted")}>
              Suite de escenarios, regresiones, alucinaciones, prompt injection, metricas y
              exportacion para medir la calidad del bot de la Alcaldia de Rionegro.
            </p>
          </div>
          <div className={cn("rounded-[26px] px-5 py-5", darkMode ? "bg-white/8" : "bg-surface")}>
            <div className="flex items-center justify-between gap-3">
              <p className={cn("text-sm font-semibold", darkMode ? "text-white/70" : "text-muted")}>
                Progreso de ejecucion
              </p>
              <span className={cn("text-sm font-semibold", darkMode ? "text-white" : "text-foreground")}>
                {running ? `${runProgress}%` : "Listo"}
              </span>
            </div>
            <div className="mt-3">
              <ProgressBar value={running ? runProgress : data.summary.passRate} tone={data.summary.failed ? "danger" : "success"} />
            </div>
            <p className={cn("mt-3 text-sm", darkMode ? "text-white/64" : "text-muted")}>
              Ultima corrida: {formatDate(data.summary.lastRun)}
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        {views.map((view) => {
          const Icon = view.icon;
          const active = activeView === view.key;

          return (
            <button
              key={view.key}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition",
                active
                  ? "border-primary bg-primary text-white"
                  : darkMode
                    ? "border-white/10 bg-white/6 text-white/74 hover:bg-white/12"
                    : "border-border bg-white text-foreground hover:bg-surface",
              )}
              onClick={() => setActiveView(view.key)}
            >
              <Icon className="size-4" />
              {view.label}
            </button>
          );
        })}
      </section>

      {activeView === "resumen" ? (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="PASS RATE"
              value={formatPercent(data.summary.passRate)}
              note={`${data.summary.passed}/${data.summary.totalTests} casos pasaron.`}
              badge="QA"
            />
            <StatCard
              label="CONFIDENCE SCORE"
              value={formatPercent(data.summary.confidenceScore)}
              note="Promedio objetivo calculado por la suite."
              badge="Score"
            />
            <StatCard
              label="TOTAL TESTS"
              value={formatNumber(data.summary.totalTests || scenarioStats.active)}
              note={`${scenarioStats.active} activos y ${scenarioStats.inactive} inactivos.`}
              badge="Casos"
            />
            <StatCard
              label="AVERAGE RESPONSE TIME"
              value={formatSeconds(data.summary.averageResponseTimeMs)}
              note={`Ultima ejecucion: ${formatDate(data.summary.lastRun)}.`}
              badge="Tiempo"
            />
            <StatCard
              label="PASSED"
              value={formatNumber(data.summary.passed)}
              note="Casos con score y reglas dentro de rango."
              badge="PASS"
            />
            <StatCard
              label="FAILED"
              value={formatNumber(data.summary.failed)}
              note="Casos que requieren correccion o base de conocimiento."
              badge="FAIL"
            />
            <StatCard
              label="WARNING"
              value={formatNumber(data.summary.warnings)}
              note="Casos no rotos, pero con riesgo de calidad."
              badge="WARN"
            />
            <StatCard
              label="LAST RUN"
              value={data.summary.lastRun ? "Ejecutado" : "Pendiente"}
              note={formatDate(data.summary.lastRun)}
              badge="Historial"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <PanelCard className="space-y-5">
              <SectionHeader eyebrow="Categorias" title="Pass rate por categoria" />
              <div className="grid gap-3 md:grid-cols-2">
                {data.categoryMetrics.map((item) => (
                  <CategoryMetricRow key={item.category} item={item} />
                ))}
              </div>
            </PanelCard>

            <PanelCard className="space-y-5">
              <SectionHeader eyebrow="Riesgo" title="Alucinaciones detectadas" />
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Enlaces", data.hallucinations.links, "URLs no oficiales."],
                  ["Correos", data.hallucinations.emails, "Correos no esperados."],
                  ["Telefonos", data.hallucinations.phones, "Telefonos no esperados."],
                  ["Direcciones", data.hallucinations.addresses, "Direcciones no esperadas."],
                  ["Horarios", data.hallucinations.hours, "Horarios no esperados."],
                ].map(([label, value, note]) => (
                  <article key={label} className="rounded-[22px] border border-border bg-white px-4 py-4">
                    <p className="text-sm font-semibold text-muted">{label}</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {formatNumber(Number(value))}
                    </p>
                    <p className="mt-2 text-sm text-muted">{note}</p>
                  </article>
                ))}
              </div>
            </PanelCard>
          </section>
        </div>
      ) : null}

      {activeView === "simulaciones" ? (
        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <PanelCard className="space-y-5">
            <SectionHeader
              eyebrow="Escenarios"
              title={editingId ? "Editar escenario" : "Crear escenario"}
              action={
                editingId ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyForm);
                    }}
                  >
                    Cancelar
                  </Button>
                ) : null
              }
            />

            <div className="grid gap-4">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-muted">Categoria</span>
                <Select
                  value={form.category}
                  onChange={(event) => setForm((value) => ({ ...value, category: event.target.value }))}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-muted">Titulo</span>
                <Input
                  value={form.title}
                  onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
                  placeholder="Consultar impuesto predial"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-muted">Descripcion</span>
                <Input
                  value={form.description}
                  onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
                  placeholder="Que valida este caso"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-muted">Input</span>
                <Textarea
                  value={form.input}
                  onChange={(event) => setForm((value) => ({ ...value, input: event.target.value }))}
                  placeholder="Como pago el impuesto predial?"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-muted">Expected behavior</span>
                <Textarea
                  value={form.expectedBehavior}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, expectedBehavior: event.target.value }))
                  }
                  placeholder="Debe mencionar predial y no inventar enlaces"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-muted">Expected keywords</span>
                  <Input
                    value={form.expectedKeywords}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, expectedKeywords: event.target.value }))
                    }
                    placeholder="predial, Rionegro"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-muted">Forbidden keywords</span>
                  <Input
                    value={form.forbiddenKeywords}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, forbiddenKeywords: event.target.value }))
                    }
                    placeholder="http://, undefined"
                  />
                </label>
              </div>
              <label className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-sm font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((value) => ({ ...value, active: event.target.checked }))}
                />
                Activo
              </label>
              <Button className="gap-2" onClick={saveScenario} disabled={saving}>
                <Plus className="size-4" />
                {saving ? "Guardando" : editingId ? "Actualizar escenario" : "Crear escenario"}
              </Button>
            </div>
          </PanelCard>

          <PanelCard className="space-y-5">
            <SectionHeader
              eyebrow="Biblioteca"
              title={`${data.scenarios.length} escenarios configurados`}
              action={
                <Button className="gap-2" onClick={runAllTests} disabled={running}>
                  <Play className="size-4" />
                  Run all tests
                </Button>
              }
            />
            <div className="space-y-3">
              {data.scenarios.map((scenario) => (
                <article key={scenario.id} className="rounded-[24px] border border-border bg-white px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{scenario.title}</p>
                        <ScenarioStatusBadge scenario={scenario} />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted">{scenario.description}</p>
                      <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">{scenario.input}</p>
                    </div>
                    <Badge tone="info">{scenario.category}</Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" className="gap-2" onClick={() => editScenario(scenario)}>
                      <Pencil className="size-4" />
                      Editar
                    </Button>
                    <Button variant="ghost" className="gap-2" onClick={() => duplicateScenario(scenario.id)}>
                      <Copy className="size-4" />
                      Duplicar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        patchScenario(scenario.id, { active: !scenario.active }).catch((error) =>
                          toast.error(error instanceof Error ? error.message : "No se pudo actualizar."),
                        )
                      }
                    >
                      {scenario.active ? "Desactivar" : "Activar"}
                    </Button>
                    <Button variant="danger" className="gap-2" onClick={() => deleteScenario(scenario.id)}>
                      <Trash2 className="size-4" />
                      Eliminar
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </PanelCard>
        </section>
      ) : null}

      {activeView === "resultados" ? (
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <PanelCard className="space-y-5">
            <SectionHeader eyebrow="Resultados" title="Tabla de ejecucion" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-muted">
                  <tr>
                    <th className="px-3 py-2">Caso</th>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Tiempo</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {data.latestResults.map((result) => (
                    <tr
                      key={result.id}
                      className={cn(
                        "cursor-pointer rounded-2xl bg-white transition hover:bg-surface",
                        selectedResult?.id === result.id && "outline outline-2 outline-primary",
                      )}
                      onClick={() => setSelectedResultId(result.id)}
                    >
                      <td className="rounded-l-2xl px-3 py-3 font-semibold text-foreground">
                        {result.caseTitle}
                        {result.wasRegression ? (
                          <span className="ml-2 rounded-full bg-[#f9d8d8] px-2 py-0.5 text-xs text-[#a33434]">
                            regression
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-muted">{result.category}</td>
                      <td className="px-3 py-3">
                        <ResultStatusBadge result={result} />
                      </td>
                      <td className="px-3 py-3 text-muted">{formatSeconds(result.responseTimeMs)}</td>
                      <td className="px-3 py-3 font-semibold text-foreground">{result.score}</td>
                      <td className="rounded-r-2xl px-3 py-3 text-muted">{formatDate(result.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelCard>

          <PanelCard className="space-y-5">
            <SectionHeader eyebrow="Detalle" title={selectedResult?.caseTitle ?? "Sin resultado"} />
            {selectedResult ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <ResultStatusBadge result={selectedResult} />
                  <Badge tone="info">Score {selectedResult.score}</Badge>
                  {selectedResult.wasRegression ? <Badge tone="danger">REGRESSION DETECTED</Badge> : null}
                </div>
                <div className="rounded-[22px] bg-surface px-4 py-4">
                  <p className="text-sm font-semibold text-muted">Mensaje enviado</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">{selectedResult.input}</p>
                </div>
                <div className="rounded-[22px] bg-white px-4 py-4">
                  <p className="text-sm font-semibold text-muted">Respuesta del bot</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {selectedResult.botReply}
                  </p>
                </div>
                <div className="rounded-[22px] bg-surface px-4 py-4">
                  <p className="text-sm font-semibold text-muted">Resultado esperado</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">{selectedResult.expectedBehavior}</p>
                </div>
                <div className="rounded-[22px] bg-white px-4 py-4">
                  <p className="text-sm font-semibold text-muted">Diferencias detectadas</p>
                  <div className="mt-2 space-y-2">
                    {selectedResult.differences.length ? (
                      selectedResult.differences.map((item) => (
                        <p key={item} className="rounded-2xl bg-surface px-3 py-2 text-sm text-foreground">
                          {item}
                        </p>
                      ))
                    ) : (
                      <p className="text-sm text-muted">Sin diferencias criticas.</p>
                    )}
                  </div>
                </div>
                <div className="rounded-[22px] bg-white px-4 py-4">
                  <p className="text-sm font-semibold text-muted">Motivo del fail</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    {selectedResult.failureReason ?? "No aplica."}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">Ejecuta la suite QA para ver resultados.</p>
            )}
          </PanelCard>
        </section>
      ) : null}

      {activeView === "metricas" ? (
        <div className="space-y-6">
          <section className="grid gap-6 xl:grid-cols-2">
            <PanelCard className="space-y-5">
              <SectionHeader eyebrow="Grafica" title="Pass Rate por categoria" />
              <div className="h-80 min-h-[320px] w-full min-w-[280px] overflow-hidden">
                <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={320}>
                  <BarChart data={data.charts.passRateByCategory.length ? data.charts.passRateByCategory : chartFallback}>
                    <CartesianGrid vertical={false} stroke="rgba(22,36,51,0.08)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} hide />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(23,63,115,0.06)" }} />
                    <Bar dataKey="value" fill="#173f73" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>

            <PanelCard className="space-y-5">
              <SectionHeader eyebrow="Historico" title="Evolucion historica" />
              <div className="h-80 min-h-[320px] w-full min-w-[280px] overflow-hidden">
                <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={320}>
                  <LineChart data={historicalData}>
                    <CartesianGrid vertical={false} stroke="rgba(22,36,51,0.08)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="value" stroke="#1f8f62" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>

            <PanelCard className="space-y-5">
              <SectionHeader eyebrow="Rendimiento" title="Tiempo de respuesta" />
              <div className="h-80 min-h-[320px] w-full min-w-[280px] overflow-hidden">
                <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={320}>
                  <LineChart data={responseTimeData}>
                    <CartesianGrid vertical={false} stroke="rgba(22,36,51,0.08)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="value" stroke="#0d7b82" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>

            <PanelCard className="space-y-5">
              <SectionHeader eyebrow="Errores" title="Distribucion de errores" />
              <div className="h-80 min-h-[320px] w-full min-w-[280px] overflow-hidden">
                <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={320}>
                  <PieChart>
                    <Tooltip content={<ChartTooltip />} />
                    <Pie
                      data={errorDistribution}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={70}
                      outerRadius={115}
                      paddingAngle={4}
                    >
                      {errorDistribution.map((entry, index) => (
                        <Cell key={entry.label} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>
          </section>

          <PanelCard className="space-y-5">
            <SectionHeader eyebrow="Semana" title="Tendencia semanal" />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {(data.charts.weeklyTrend.length ? data.charts.weeklyTrend : chartFallback).map((point) => (
                <article key={point.label} className="rounded-[22px] bg-white px-4 py-4">
                  <p className="font-semibold text-foreground">{point.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-primary">{formatPercent(point.value)}</p>
                </article>
              ))}
            </div>
          </PanelCard>
        </div>
      ) : null}

      {activeView === "historial" ? (
        <PanelCard className="space-y-5">
          <SectionHeader eyebrow="Historial" title="Corridas recientes" />
          <div className="space-y-3">
            {data.history.length ? (
              data.history.map((run: QaRunRecord) => (
                <article key={run.id} className="rounded-[24px] border border-border bg-white px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-foreground">{run.id}</p>
                      <p className="mt-1 text-sm text-muted">{formatDate(run.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={run.summary.failed > 0 ? "danger" : "success"}>
                        {formatPercent(run.summary.passRate)}
                      </Badge>
                      <Badge tone="info">{run.summary.totalTests} casos</Badge>
                      <Badge tone={run.summary.regressionCount ? "danger" : "success"}>
                        {run.summary.regressionCount} regresiones
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-4">
                    <ProgressBar value={run.summary.passRate} tone={run.summary.failed ? "danger" : "success"} />
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted">Sin corridas registradas todavia.</p>
            )}
          </div>
        </PanelCard>
      ) : null}

      {activeView === "regresiones" ? (
        <PanelCard className="space-y-5">
          <SectionHeader eyebrow="Regresiones" title="Casos que antes pasaban y ahora fallan" />
          {data.regressions.length ? (
            <div className="space-y-3">
              <Badge tone="danger" className="gap-2">
                <AlertTriangle className="size-4" />
                REGRESSION DETECTED
              </Badge>
              {data.regressions.map((result) => (
                <article key={result.id} className="rounded-[24px] border border-[#b34b4b]/30 bg-[#fff5f5] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{result.caseTitle}</p>
                      <p className="mt-1 text-sm text-muted">{result.category}</p>
                    </div>
                    <ResultStatusBadge result={result} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-foreground">
                    {result.failureReason ?? "El caso cambio de PASS a FAIL."}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] bg-[#f0fdf4] px-5 py-5">
              <Badge tone="success">Sin regresiones</Badge>
              <p className="mt-3 text-sm leading-6 text-muted">
                La ultima corrida no tiene casos que hayan cambiado de PASS a FAIL.
              </p>
            </div>
          )}
        </PanelCard>
      ) : null}

      {activeView === "exportacion" ? (
        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <PanelCard className="space-y-5">
            <SectionHeader eyebrow="Export report" title="Descargar reporte QA" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Button className="gap-2" onClick={() => downloadReport("pdf")}>
                <FileText className="size-4" />
                PDF
              </Button>
              <Button variant="secondary" className="gap-2" onClick={() => downloadReport("csv")}>
                <Download className="size-4" />
                CSV
              </Button>
              <Button variant="ghost" className="gap-2" onClick={() => downloadReport("json")}>
                <FileJson className="size-4" />
                JSON
              </Button>
            </div>
            <div className="rounded-[24px] bg-surface px-4 py-4 text-sm leading-6 text-muted">
              <p>Run: {data.summary.runId}</p>
              <p>Pass rate: {formatPercent(data.summary.passRate)}</p>
              <p>Confidence score: {formatPercent(data.summary.confidenceScore)}</p>
              <p>Average response: {formatSeconds(data.summary.averageResponseTimeMs)}</p>
            </div>
          </PanelCard>

          <PanelCard className="space-y-5">
            <SectionHeader eyebrow="Cobertura" title="Baterias especiales" />
            <div className="grid gap-3 md:grid-cols-2">
              {["Prompt Injection", "Alucinaciones", "Casos extremos", "Memoria", "Bilingue", "Integraciones"].map((category) => {
                const count = data.scenarios.filter((item) => item.category === category).length;

                return (
                  <article key={category} className="rounded-[22px] bg-white px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-foreground">{category}</p>
                      <Badge tone={count ? "success" : "warning"}>{count}</Badge>
                    </div>
                  </article>
                );
              })}
            </div>
          </PanelCard>
        </section>
      ) : null}
    </div>
  );
}
