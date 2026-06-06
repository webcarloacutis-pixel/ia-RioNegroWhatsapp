"use client";

import { useState, useTransition } from "react";
import { Activity, Database, EyeOff, RefreshCw, ShieldCheck, Terminal } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/ui/panel-card";

type EnvDiagnostics = {
  ok: boolean;
  database: Record<string, boolean>;
  ultramsg: Record<string, boolean>;
  openai: Record<string, boolean>;
  cloudinary: Record<string, boolean>;
  scheduler: Record<string, boolean>;
  security: Record<string, boolean>;
  requestId?: string;
};

type DbDiagnostics = {
  ok: boolean;
  connected: boolean;
  responseMs: number;
  tables: Record<string, boolean>;
  issues: Array<{
    table: string;
    problem: string;
    suggestion: string;
  }>;
  requestId?: string;
};

type SafeLogEntry = {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  module: string;
  message: string;
  requestId?: string;
  meta?: unknown;
};

type DiagnosticsOverview = {
  env: EnvDiagnostics;
  db: DbDiagnostics;
  logs: SafeLogEntry[];
};

type DiagnosticsPanelProps = {
  initialData: DiagnosticsOverview;
};

const groupLabels: Record<string, string> = {
  database: "Base de datos",
  ultramsg: "UltraMsg",
  openai: "OpenAI",
  cloudinary: "Cloudinary",
  scheduler: "Scheduler",
  security: "Seguridad",
};

function statusTone(ok: boolean) {
  return ok ? "success" : "warning";
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "No serializable";
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "No se pudo ejecutar el diagnostico.");
  }

  return payload as T;
}

export function DiagnosticsPanel({ initialData }: DiagnosticsPanelProps) {
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();

  function refreshAll() {
    startTransition(async () => {
      try {
        const [env, db] = await Promise.all([
          fetchJson<EnvDiagnostics>("/api/admin/system/env-check"),
          fetchJson<DbDiagnostics>("/api/admin/system/db-check"),
        ]);

        setData((current) => ({ ...current, env, db }));
        toast.success("Diagnostico actualizado.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo actualizar.");
      }
    });
  }

  function refreshDb() {
    startTransition(async () => {
      try {
        const db = await fetchJson<DbDiagnostics>("/api/admin/system/db-check");
        setData((current) => ({ ...current, db }));
        toast.success("DB revisada.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo probar DB.");
      }
    });
  }

  function refreshEnv() {
    startTransition(async () => {
      try {
        const env = await fetchJson<EnvDiagnostics>("/api/admin/system/env-check");
        setData((current) => ({ ...current, env }));
        toast.success("Variables revisadas.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo revisar variables.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-border bg-white px-6 py-7 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge tone="info">Diagnostico seguro</Badge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">
              Observabilidad del sistema
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
              Checks de Render, Prisma, variables y ultimos logs seguros sin mostrar secretos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="gap-2" onClick={refreshEnv} disabled={isPending}>
              <ShieldCheck className="size-4" />
              Probar variables
            </Button>
            <Button variant="secondary" className="gap-2" onClick={refreshDb} disabled={isPending}>
              <Database className="size-4" />
              Probar DB
            </Button>
            <Button className="gap-2" onClick={refreshAll} disabled={isPending}>
              <RefreshCw className="size-4" />
              Actualizar todo
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <PanelCard className="space-y-3">
          <Badge tone={statusTone(data.db.connected)}>DB</Badge>
          <p className="text-3xl font-semibold text-foreground">
            {data.db.connected ? "Conectada" : "Sin conexion"}
          </p>
          <p className="text-sm text-muted">{data.db.responseMs}ms</p>
          {data.db.requestId ? (
            <p className="text-xs text-muted">requestId: {data.db.requestId}</p>
          ) : null}
        </PanelCard>

        <PanelCard className="space-y-3">
          <Badge tone={statusTone(data.env.ok)}>Variables</Badge>
          <p className="text-3xl font-semibold text-foreground">
            {data.env.ok ? "Completas" : "Revisar"}
          </p>
          <p className="text-sm text-muted">Solo se muestran booleanos, nunca valores.</p>
          {data.env.requestId ? (
            <p className="text-xs text-muted">requestId: {data.env.requestId}</p>
          ) : null}
        </PanelCard>

        <PanelCard className="space-y-3">
          <Badge tone="info">Logs</Badge>
          <p className="text-3xl font-semibold text-foreground">{data.logs.length}</p>
          <p className="text-sm text-muted">Entradas recientes sanitizadas.</p>
        </PanelCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <PanelCard className="space-y-5">
          <div className="flex items-center gap-2">
            <Database className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold text-foreground">Tablas principales</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(data.db.tables).map(([table, exists]) => (
              <div key={table} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                <span className="font-semibold text-foreground">{table}</span>
                <Badge tone={exists ? "success" : "danger"}>{exists ? "OK" : "Falta"}</Badge>
              </div>
            ))}
          </div>
          {data.db.issues.length ? (
            <div className="space-y-2">
              {data.db.issues.map((issue) => (
                <div key={`${issue.table}-${issue.problem}`} className="rounded-2xl bg-[#fff7e8] px-4 py-3 text-sm text-[#7c5719]">
                  {issue.table}: {issue.problem}. {issue.suggestion}
                </div>
              ))}
            </div>
          ) : null}
        </PanelCard>

        <PanelCard className="space-y-5">
          <div className="flex items-center gap-2">
            <EyeOff className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold text-foreground">Variables seguras</h2>
          </div>
          <div className="space-y-4">
            {Object.entries(data.env)
              .filter(([key]) => key !== "ok" && key !== "requestId")
              .map(([group, values]) => (
                <div key={group} className="rounded-2xl bg-white px-4 py-4">
                  <p className="font-semibold text-foreground">{groupLabels[group] ?? group}</p>
                  <div className="mt-3 space-y-2">
                    {Object.entries(values as Record<string, boolean>).map(([name, present]) => (
                      <div key={name} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted">{name}</span>
                        <Badge tone={present ? "success" : "warning"}>
                          {present ? "Configurada" : "Falta"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </PanelCard>
      </section>

      <PanelCard className="space-y-5">
        <div className="flex items-center gap-2">
          <Terminal className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold text-foreground">Logs recientes</h2>
        </div>
        <div className="space-y-3">
          {data.logs.length ? (
            data.logs.map((log, index) => (
              <article key={`${log.timestamp}-${index}`} className="rounded-2xl bg-white px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Activity className="size-4 text-primary" />
                    <p className="font-semibold text-foreground">[{log.module}] {log.message}</p>
                  </div>
                  <Badge tone={log.level === "error" ? "danger" : log.level === "warn" ? "warning" : "info"}>
                    {log.level}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {log.timestamp} {log.requestId ? `- ${log.requestId}` : ""}
                </p>
                {log.meta ? (
                  <pre className="mt-3 max-h-44 overflow-auto rounded-xl bg-surface p-3 text-xs text-muted">
                    {safeJson(log.meta)}
                  </pre>
                ) : null}
              </article>
            ))
          ) : (
            <p className="rounded-2xl bg-white px-4 py-4 text-sm text-muted">
              Todavia no hay logs recientes en memoria.
            </p>
          )}
        </div>
      </PanelCard>
    </div>
  );
}
