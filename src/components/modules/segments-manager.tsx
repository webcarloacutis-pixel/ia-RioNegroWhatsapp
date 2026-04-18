"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Edit3, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelCard } from "@/components/ui/panel-card";
import { Textarea } from "@/components/ui/textarea";
import { formatCompactNumber, formatDate } from "@/lib/format";
import type { SegmentSummary } from "@/lib/types";

type SegmentsManagerProps = {
  segments: SegmentSummary[];
};

type SegmentFormState = {
  name: string;
  description: string;
  estimatedUsers: string;
  recipientPhones: string;
};

const initialForm: SegmentFormState = {
  name: "",
  description: "",
  estimatedUsers: "0",
  recipientPhones: "",
};

export function SegmentsManager({ segments }: SegmentsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SegmentFormState>(initialForm);

  async function request(url: string, options?: RequestInit) {
    const response = await fetch(url, options);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "No se pudo procesar la solicitud.");
    }

    return payload.data;
  }

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const url = editingId ? `/api/segments/${editingId}` : "/api/segments";
      const method = editingId ? "PATCH" : "POST";
      await request(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          description: form.description || null,
          estimatedUsers: Number(form.estimatedUsers),
          recipientPhones: form.recipientPhones,
        }),
      });

      toast.success(editingId ? "Segmento actualizado." : "Segmento creado.");
      resetForm();
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Deseas eliminar este segmento?")) return;

    try {
      await request(`/api/segments/${id}`, { method: "DELETE" });
      toast.success("Segmento eliminado.");
      if (editingId === id) resetForm();
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar.");
    }
  }

  function startEditing(segment: SegmentSummary) {
    setEditingId(segment.id);
    setForm({
      name: segment.name,
      description: segment.description ?? "",
      estimatedUsers: String(segment.estimatedUsers),
      recipientPhones: segment.recipientPhones.join("\n"),
    });
  }

  return (
    <div className="space-y-6">
      <section className="panel-card rounded-[34px] px-7 py-8">
        <Badge tone="info">Segmentacion ciudadana</Badge>
        <h1 className="mt-4 text-4xl text-foreground">
          Define coberturas, zonas y audiencias del municipio
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-muted">
          Usa segmentos por cobertura institucional, frentes de atencion o comunidades
          especificas para asociar comunicados y presentar envios con alcance localizado.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              {editingId ? "Editar segmento" : "Nuevo segmento"}
            </p>
            <h2 className="mt-2 text-2xl text-foreground">
              {editingId ? "Ajusta el territorio seleccionado" : "Agrega una nueva audiencia"}
            </h2>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Nombre</span>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Ej. Cultura y bibliotecas"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Descripcion</span>
              <Textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                className="min-h-28"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Usuarios estimados</span>
              <Input
                type="number"
                min="0"
                value={form.estimatedUsers}
                onChange={(event) =>
                  setForm((current) => ({ ...current, estimatedUsers: event.target.value }))
                }
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">
                Numeros de WhatsApp del segmento
              </span>
              <Textarea
                value={form.recipientPhones}
                onChange={(event) =>
                  setForm((current) => ({ ...current, recipientPhones: event.target.value }))
                }
                className="min-h-28"
                placeholder={"+573108853250\n+573162215323"}
              />
              <p className="text-xs text-muted">
                Puedes pegar varios numeros separados por linea, coma o punto y coma.
              </p>
            </label>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isPending}>
                {editingId ? "Actualizar segmento" : "Crear segmento"}
              </Button>
              {editingId ? (
                <Button variant="ghost" onClick={resetForm}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        </PanelCard>

        <PanelCard className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
                Mapa de audiencias
              </p>
              <h2 className="mt-2 text-2xl text-foreground">Segmentos configurados</h2>
            </div>
            <Badge tone="info">{segments.length} segmentos</Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {segments.map((segment) => (
              <article key={segment.id} className="rounded-[28px] border border-border bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-foreground">{segment.name}</p>
                  <Badge tone="success">
                    {formatCompactNumber(segment.estimatedUsers)} usuarios
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted">
                  {segment.description ?? "Sin descripcion adicional."}
                </p>
                <div className="mt-4 text-sm text-muted">
                  <p>{segment.activeAnnouncements} comunicado(s) asociados</p>
                  <p className="mt-1">
                    {segment.recipientCount} numero(s) de WhatsApp asociado(s)
                  </p>
                  <p className="mt-1">Creado el {formatDate(segment.createdAt)}</p>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="secondary" className="gap-2" onClick={() => startEditing(segment)}>
                    <Edit3 className="size-4" />
                    Editar
                  </Button>
                  <Button variant="danger" className="gap-2" onClick={() => handleDelete(segment.id)}>
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
