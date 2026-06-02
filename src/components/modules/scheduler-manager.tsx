"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Clock3, PlayCircle, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/ui/panel-card";
import {
  formatCompactNumber,
  formatDateTime,
  formatDeliveryModeLabel,
  formatStatusLabel,
} from "@/lib/format";
import type { SchedulerData } from "@/lib/types";

type SchedulerManagerProps = {
  data: SchedulerData;
};

function getStatusTone(status: SchedulerData["scheduledAnnouncements"][number]["status"]) {
  if (status === "SENT" || status === "SENT_REAL") return "success";
  if (status === "FAILED" || status === "BLOCKED_BY_SAFE_MODE") return "danger";
  if (status === "SENT_SIMULATED") return "warning";
  return "warning";
}

export function SchedulerManager({ data }: SchedulerManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function request(url: string, options?: RequestInit) {
    const response = await fetch(url, options);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "No se pudo procesar la solicitud.");
    }

    return payload.data;
  }

  async function handleSimulate(id: string) {
    try {
      const result = await request(`/api/announcements/${id}/simulate`, { method: "POST" });
      toast.success(result.feedback);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo simular.");
    }
  }

  async function handleSendNow(id: string) {
    try {
      const result = await request(`/api/announcements/${id}/send`, { method: "POST" });
      toast.success(result.feedback);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar.");
    }
  }

  async function handleRunScheduler() {
    try {
      const result = await request("/api/scheduler/run", { method: "POST" });
      const failedCount = Array.isArray(result.processed)
        ? result.processed.filter((item: { status: string }) => item.status === "FAILED").length
        : 0;

      if (failedCount > 0) {
        toast.error(
          `Se enviaron ${result.processedCount} comunicado(s) y fallaron ${failedCount}. Revisa la bitacora.`,
        );
      } else {
        toast.success(
          result.processedCount > 0
            ? `Se procesaron ${result.processedCount} comunicado(s).`
            : "No habia comunicados pendientes para este ciclo.",
        );
      }
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo ejecutar el scheduler.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel-card rounded-[34px] px-7 py-8">
        <Badge tone="info">Programador de envios</Badge>
        <h1 className="mt-4 text-4xl text-foreground">
          Supervisa el pipeline de salida del canal oficial
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-muted">
          Este modulo combina agenda de comunicados, modo demo y un worker que revisa piezas
          vencidas para enviarlas automaticamente cuando corresponda.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button className="gap-2" onClick={handleRunScheduler} disabled={isPending}>
            <PlayCircle className="size-4" />
            Procesar pendientes
          </Button>
          <Badge tone="warning">Worker con validacion UltraMsg</Badge>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
                Cola de salida
              </p>
              <h2 className="mt-2 text-2xl text-foreground">Comunicados programados</h2>
            </div>
            <Badge tone="info">{data.scheduledAnnouncements.length} pendientes</Badge>
          </div>

          <div className="space-y-4">
            {data.scheduledAnnouncements.map((announcement) => (
              <article
                key={announcement.id}
                className="rounded-[28px] border border-border bg-white p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-foreground">{announcement.title}</p>
                    <p className="mt-2 text-sm leading-7 text-muted">{announcement.message}</p>
                  </div>
                  <Badge tone={getStatusTone(announcement.status)}>
                    {formatStatusLabel(announcement.status)}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
                  <span className="inline-flex items-center gap-2">
                    <Clock3 className="size-4" />
                    {formatDateTime(announcement.scheduledAt)}
                  </span>
                  <span>-</span>
                  <span>{announcement.location ?? "Sin lugar definido"}</span>
                  <span>-</span>
                  <span>{announcement.segment?.name ?? "Cobertura general"}</span>
                  <span>-</span>
                  <span>
                    {announcement.segment
                      ? `${formatCompactNumber(announcement.segment.estimatedUsers)} usuarios estimados`
                      : "Cobertura general municipal"}
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    variant="ghost"
                    className="gap-2"
                    onClick={() => handleSimulate(announcement.id)}
                  >
                    <Sparkles className="size-4" />
                    Simular envio
                  </Button>
                  <Button className="gap-2" onClick={() => handleSendNow(announcement.id)}>
                    <Send className="size-4" />
                    Enviar ahora
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </PanelCard>

        <PanelCard className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Bitacora demo
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Logs recientes de actividad</h2>
          </div>

          <div className="space-y-3">
            {data.recentLogs.map((log) => (
              <div key={log.id} className="rounded-[24px] bg-surface px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-foreground">{log.announcementTitle}</p>
                  <Badge
                    tone={
                      log.status === "FAILED"
                        ? "danger"
                        : log.mode === "DEMO"
                          ? "warning"
                          : "success"
                    }
                  >
                    {log.status === "FAILED" ? "Fallido" : formatDeliveryModeLabel(log.mode)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted">{log.details ?? "Evento registrado"}.</p>
                <p className="mt-2 text-sm text-muted">{formatDateTime(log.createdAt)}</p>
              </div>
            ))}
          </div>
        </PanelCard>
      </div>
    </div>
  );
}
