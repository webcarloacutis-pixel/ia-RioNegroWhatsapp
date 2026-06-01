"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  Eye,
  FileText,
  MessageSquareWarning,
  Search,
  ShieldX,
  Siren,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelCard } from "@/components/ui/panel-card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import type {
  CitizenReportListResult,
  CitizenReportPriority,
  CitizenReportStatus,
  CitizenReportSummary,
} from "@/lib/types";

type CitizenReportsManagerProps = {
  initialData: CitizenReportListResult;
};

const statusLabels: Record<CitizenReportStatus, string> = {
  pending: "Pendiente",
  reviewing: "En revision",
  approved: "Aprobado",
  rejected: "Rechazado",
  converted_to_mass_message: "Convertido a comunicado",
  attended: "Atendido",
  resolved: "Resuelto",
};

const priorityLabels: Record<CitizenReportPriority, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

function getStatusTone(status: CitizenReportStatus) {
  if (status === "resolved" || status === "attended" || status === "approved") {
    return "success" as const;
  }

  if (status === "rejected") {
    return "danger" as const;
  }

  if (status === "pending" || status === "reviewing") {
    return "warning" as const;
  }

  return "info" as const;
}

function getPriorityTone(priority: CitizenReportPriority) {
  if (priority === "urgent") return "danger" as const;
  if (priority === "high") return "warning" as const;
  if (priority === "low") return "default" as const;
  return "info" as const;
}

export function CitizenReportsManager({ initialData }: CitizenReportsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reports, setReports] = useState(initialData.reports);
  const [selectedId, setSelectedId] = useState(initialData.reports[0]?.id ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const selectedReport =
    reports.find((report) => report.id === selectedId) ?? reports[0] ?? null;
  const [adminNotes, setAdminNotes] = useState(selectedReport?.adminNotes ?? "");

  const filteredReports = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return reports.filter((report) => {
      const matchesStatus = !statusFilter || report.status === statusFilter;
      const matchesSearch =
        !normalizedSearch ||
        [
          report.description,
          report.location,
          report.category,
          report.reporterPhone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [reports, search, statusFilter]);

  async function request<T>(url: string, options?: RequestInit) {
    const response = await fetch(url, options);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "No se pudo procesar la solicitud.");
    }

    return payload.data as T;
  }

  function replaceReport(report: CitizenReportSummary) {
    setReports((current) =>
      current.map((item) => (item.id === report.id ? report : item)),
    );
    setSelectedId(report.id);
    setAdminNotes(report.adminNotes ?? "");
  }

  async function updateStatus(id: string, status: CitizenReportStatus) {
    try {
      const report = await request<CitizenReportSummary>(
        `/api/admin/citizen-reports/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      replaceReport(report);
      toast.success(`Reporte marcado como ${statusLabels[status].toLowerCase()}.`);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar.");
    }
  }

  async function saveNotes() {
    if (!selectedReport) return;

    try {
      const report = await request<CitizenReportSummary>(
        `/api/admin/citizen-reports/${selectedReport.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminNotes }),
        },
      );
      replaceReport(report);
      toast.success("Notas internas guardadas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron guardar las notas.");
    }
  }

  async function convertToMassMessage(id: string) {
    try {
      const data = await request<{
        report: CitizenReportSummary;
        massMessageId: string;
      }>(`/api/admin/citizen-reports/${id}/convert-to-mass-message`, {
        method: "POST",
      });
      replaceReport(data.report);
      toast.success("Borrador de comunicado creado. No se envio automaticamente.");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el borrador.");
    }
  }

  function selectReport(report: CitizenReportSummary) {
    setSelectedId(report.id);
    setAdminNotes(report.adminNotes ?? "");
  }

  return (
    <div className="space-y-6">
      <section className="panel-card rounded-[34px] px-7 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Badge tone="warning">Canal ciudadano</Badge>
            <h1 className="mt-4 text-4xl text-foreground">Denuncias y Reportes</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted">
              Revisa reportes enviados por WhatsApp antes de tomar acciones o convertirlos en
              comunicados oficiales.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-white px-4 py-3">
              <p className="text-2xl font-semibold text-foreground">
                {initialData.summary.pending}
              </p>
              <p className="text-xs text-muted">Pendientes</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3">
              <p className="text-2xl font-semibold text-danger">
                {initialData.summary.urgent}
              </p>
              <p className="text-xs text-muted">Urgentes</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3">
              <p className="text-2xl font-semibold text-foreground">
                {initialData.summary.total}
              </p>
              <p className="text-xs text-muted">Total</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <PanelCard className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
                Bandeja
              </p>
              <h2 className="mt-2 text-2xl text-foreground">Reportes recientes</h2>
            </div>
            <Badge tone="info">{filteredReports.length} visibles</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input
                className="pl-11"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar descripcion, ubicacion o telefono"
              />
            </label>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-3">
            {filteredReports.length ? (
              filteredReports.map((report) => (
                <button
                  key={report.id}
                  className="w-full rounded-[24px] border border-border bg-white p-4 text-left transition hover:border-primary/40"
                  onClick={() => selectReport(report)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={getStatusTone(report.status)}>
                      {statusLabels[report.status]}
                    </Badge>
                    <Badge tone={getPriorityTone(report.priority)}>
                      {priorityLabels[report.priority]}
                    </Badge>
                    {report.images.length ? <Badge tone="info">Imagen</Badge> : null}
                  </div>
                  <p className="mt-3 line-clamp-2 font-semibold text-foreground">
                    {report.title ?? report.description}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
                    {report.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                    <span>{report.category ?? "Otro"}</span>
                    <span>-</span>
                    <span>{report.location ?? "Sin ubicacion"}</span>
                    <span>-</span>
                    <span>{formatDateTime(report.createdAt)}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-[24px] bg-surface p-5 text-sm text-muted">
                No hay reportes con los filtros seleccionados.
              </div>
            )}
          </div>
        </PanelCard>

        <PanelCard className="space-y-5">
          {selectedReport ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
                    Detalle
                  </p>
                  <h2 className="mt-2 text-2xl text-foreground">
                    {selectedReport.title ?? "Reporte ciudadano"}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={getStatusTone(selectedReport.status)}>
                    {statusLabels[selectedReport.status]}
                  </Badge>
                  <Badge tone={getPriorityTone(selectedReport.priority)}>
                    {priorityLabels[selectedReport.priority]}
                  </Badge>
                </div>
              </div>

              <div className="rounded-[24px] bg-surface p-5">
                <p className="text-sm font-semibold text-foreground">Descripcion</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted">
                  {selectedReport.description}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <InfoRow label="Categoria" value={selectedReport.category ?? "Otro"} />
                <InfoRow label="Tipo" value={selectedReport.type} />
                <InfoRow label="Ubicacion" value={selectedReport.location ?? "Sin dato"} />
                <InfoRow label="Telefono" value={selectedReport.reporterPhone ?? "Sin dato"} />
                <InfoRow label="WhatsApp ID" value={selectedReport.whatsappMessageId ?? "Sin dato"} />
                <InfoRow label="Fecha" value={formatDateTime(selectedReport.createdAt)} />
              </div>

              {selectedReport.images.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedReport.images.map((image) => (
                    <a
                      key={image.id}
                      href={image.url}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-[24px] border border-border bg-white"
                    >
                      <div className="relative aspect-video bg-surface">
                        <Image
                          src={image.url}
                          alt={image.filename ?? "Imagen del reporte ciudadano"}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <p className="truncate px-4 py-3 text-xs text-muted">
                        {image.filename ?? image.mimeType ?? "Ver imagen"}
                      </p>
                    </a>
                  ))}
                </div>
              ) : null}

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-foreground">Notas internas</span>
                <Textarea
                  value={adminNotes}
                  onChange={(event) => setAdminNotes(event.target.value)}
                  placeholder="Agrega seguimiento, dependencia responsable o decision del equipo."
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  className="gap-2"
                  disabled={isPending}
                  onClick={() => updateStatus(selectedReport.id, "reviewing")}
                >
                  <Eye className="size-4" />
                  En revision
                </Button>
                <Button
                  variant="secondary"
                  className="gap-2"
                  disabled={isPending}
                  onClick={() => updateStatus(selectedReport.id, "attended")}
                >
                  <CheckCircle2 className="size-4" />
                  Atendido
                </Button>
                <Button
                  variant="secondary"
                  className="gap-2"
                  disabled={isPending}
                  onClick={() => updateStatus(selectedReport.id, "resolved")}
                >
                  <CheckCircle2 className="size-4" />
                  Resuelto
                </Button>
                <Button
                  variant="danger"
                  className="gap-2"
                  disabled={isPending}
                  onClick={() => updateStatus(selectedReport.id, "rejected")}
                >
                  <ShieldX className="size-4" />
                  Rechazar
                </Button>
                <Button
                  variant="primary"
                  className="gap-2"
                  disabled={isPending}
                  onClick={() => convertToMassMessage(selectedReport.id)}
                >
                  <Siren className="size-4" />
                  Convertir en alerta masiva
                </Button>
                <Button variant="ghost" className="gap-2" onClick={saveNotes}>
                  <FileText className="size-4" />
                  Guardar notas
                </Button>
              </div>

              {selectedReport.massMessageId ? (
                <div className="rounded-[24px] border border-primary/20 bg-primary-soft p-4">
                  <p className="text-sm font-semibold text-primary">
                    Borrador creado: {selectedReport.massMessageId}
                  </p>
                  <Link
                    href="/dashboard/comunicados"
                    className="mt-2 inline-flex text-sm font-semibold text-primary"
                  >
                    Ir a comunicados
                  </Link>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[28px] bg-surface p-8 text-center">
              <MessageSquareWarning className="size-10 text-muted" />
              <p className="mt-4 text-lg font-semibold text-foreground">
                Sin reportes seleccionados
              </p>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted">
                Cuando lleguen denuncias o reportes por WhatsApp, apareceran aqui para revision.
              </p>
            </div>
          )}
        </PanelCard>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
