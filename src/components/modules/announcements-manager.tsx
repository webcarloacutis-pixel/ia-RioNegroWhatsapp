"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Edit3, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelCard } from "@/components/ui/panel-card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ANNOUNCEMENT_TYPE_VALUES } from "@/lib/constants";
import { formatDateTime, formatTypeLabel, toDateTimeLocalValue } from "@/lib/format";
import type { AnnouncementSummary, SegmentSummary } from "@/lib/types";

type AnnouncementsManagerProps = {
  announcements: AnnouncementSummary[];
  segments: SegmentSummary[];
};

type AnnouncementFormState = {
  title: string;
  message: string;
  location: string;
  type: string;
  scheduledAt: string;
  segmentId: string;
};

const initialForm: AnnouncementFormState = {
  title: "",
  message: "",
  location: "",
  type: "GENERAL",
  scheduledAt: "",
  segmentId: "",
};

export function AnnouncementsManager({
  announcements,
  segments,
}: AnnouncementsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AnnouncementFormState>(initialForm);

  const sortedAnnouncements = useMemo(
    () =>
      [...announcements].sort(
        (left, right) =>
          new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime(),
      ),
    [announcements],
  );
  const availableTypes = useMemo(
    () =>
      Array.from(
        new Set([
          ...ANNOUNCEMENT_TYPE_VALUES,
          ...announcements.map((announcement) => announcement.displayType),
          form.type,
        ]),
      ).filter(Boolean),
    [announcements, form.type],
  );

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function request(url: string, options?: RequestInit) {
    const response = await fetch(url, options);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "No se pudo procesar la solicitud.");
    }

    return payload.data;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const url = editingId ? `/api/announcements/${editingId}` : "/api/announcements";
      const method = editingId ? "PATCH" : "POST";
      await request(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          location: form.location || null,
          segmentId: form.segmentId || null,
        }),
      });

      toast.success(editingId ? "Comunicado actualizado." : "Comunicado creado.");
      resetForm();
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Deseas eliminar este comunicado?");
    if (!confirmed) return;

    try {
      await request(`/api/announcements/${id}`, { method: "DELETE" });
      toast.success("Comunicado eliminado.");
      if (editingId === id) resetForm();
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar.");
    }
  }

  async function handleSimulate(id: string) {
    try {
      const data = await request(`/api/announcements/${id}/simulate`, {
        method: "POST",
      });
      toast.success(data.feedback);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo simular el envio.");
    }
  }

  async function handleSendNow(id: string) {
    try {
      const data = await request(`/api/announcements/${id}/send`, {
        method: "POST",
      });
      toast.success(data.feedback);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar.");
    }
  }

  function startEditing(announcement: AnnouncementSummary) {
    setEditingId(announcement.id);
    setForm({
      title: announcement.title,
      message: announcement.message,
      location: announcement.location ?? "",
      type: announcement.displayType,
      scheduledAt: toDateTimeLocalValue(announcement.scheduledAt),
      segmentId: announcement.segment?.id ?? "",
    });
  }

  return (
    <div className="space-y-6">
      <section className="panel-card rounded-[34px] px-7 py-8">
        <Badge tone="info">Modulo de comunicados</Badge>
        <h1 className="mt-4 text-4xl text-foreground">Crea, organiza y activa informacion oficial</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-muted">
          Disenado para que el equipo de la Alcaldia pueda cargar mensajes claros, programarlos y
          enviarlos por WhatsApp a numeros generales o a los destinatarios asociados a cada
          segmento.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              {editingId ? "Editar comunicado" : "Nuevo comunicado"}
            </p>
            <h2 className="mt-2 text-2xl text-foreground">
              {editingId ? "Actualiza la pieza seleccionada" : "Carga un nuevo mensaje institucional"}
            </h2>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Titulo</span>
              <Input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Ej. Jornada de desparasitacion gratuita"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-foreground">Tipo</span>
                <Input
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, type: event.target.value }))
                  }
                  list="announcement-type-options"
                  placeholder="Ej. Evento, Feria de empleo o Salud publica"
                />
                <datalist id="announcement-type-options">
                  {availableTypes.map((type) => (
                    <option key={type} value={type}>
                      {formatTypeLabel(type)}
                    </option>
                  ))}
                </datalist>
                <p className="text-xs text-muted">
                  Puedes elegir una categoria existente o escribir una nueva.
                </p>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-foreground">Fecha y hora</span>
                <Input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scheduledAt: event.target.value }))
                  }
                />
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Lugar</span>
              <Input
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({ ...current, location: event.target.value }))
                }
                placeholder="Ej. Biblioteca Baldomero Sanin"
              />
            </label>

            <label className="block space-y-2">
              <span className="flex items-center justify-between gap-3 text-sm font-semibold text-foreground">
                <span>Segmento</span>
                <Link
                  href="/dashboard/segmentacion"
                  className="text-xs font-medium text-primary transition hover:opacity-80"
                >
                  Crear o editar segmentos
                </Link>
              </span>
              <Select
                value={form.segmentId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, segmentId: event.target.value }))
                }
              >
                <option value="">Cobertura general</option>
                {segments.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.name} ({segment.recipientCount} numeros)
                  </option>
                ))}
              </Select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Mensaje</span>
              <Textarea
                value={form.message}
                onChange={(event) =>
                  setForm((current) => ({ ...current, message: event.target.value }))
                }
                placeholder="Escribe el comunicado con tono institucional y foco ciudadano."
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isPending}>
                {editingId ? "Actualizar comunicado" : "Crear comunicado"}
              </Button>
              {editingId ? (
                <Button variant="ghost" onClick={resetForm}>
                  Cancelar edicion
                </Button>
              ) : null}
            </div>
          </form>
        </PanelCard>

        <PanelCard className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
                Bandeja institucional
              </p>
              <h2 className="mt-2 text-2xl text-foreground">Comunicados creados</h2>
            </div>
            <Badge tone="info">{sortedAnnouncements.length} registrados</Badge>
          </div>

          <div className="space-y-4">
            {sortedAnnouncements.map((announcement) => (
              <article
                key={announcement.id}
                className="rounded-[28px] border border-border bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-foreground">{announcement.title}</p>
                      <Badge tone="info">{formatTypeLabel(announcement.displayType)}</Badge>
                      <Badge tone={announcement.status === "SENT" ? "success" : "warning"}>
                        {announcement.status === "SENT" ? "Enviado" : "Programado"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-muted">{announcement.message}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
                  <span>{formatDateTime(announcement.scheduledAt)}</span>
                  <span>-</span>
                  <span>{announcement.location ?? "Sin lugar definido"}</span>
                  <span>-</span>
                  <span>{announcement.segment?.name ?? "Cobertura general"}</span>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    className="gap-2"
                    onClick={() => startEditing(announcement)}
                  >
                    <Edit3 className="size-4" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    className="gap-2"
                    onClick={() => handleSimulate(announcement.id)}
                  >
                    <Sparkles className="size-4" />
                    Simular envio
                  </Button>
                  <Button
                    variant="primary"
                    className="gap-2"
                    onClick={() => handleSendNow(announcement.id)}
                  >
                    <Send className="size-4" />
                    Enviar ahora
                  </Button>
                  <Button
                    variant="danger"
                    className="gap-2"
                    onClick={() => handleDelete(announcement.id)}
                  >
                    <Trash2 className="size-4" />
                    Eliminar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </PanelCard>
      </div>
    </div>
  );
}
