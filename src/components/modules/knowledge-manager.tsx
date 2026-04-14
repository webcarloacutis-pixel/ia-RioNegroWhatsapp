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
import { KNOWLEDGE_CATEGORY_SUGGESTIONS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { KnowledgeEntrySummary } from "@/lib/types";

type KnowledgeManagerProps = {
  entries: KnowledgeEntrySummary[];
};

type KnowledgeFormState = {
  question: string;
  answer: string;
  category: string;
};

const initialForm: KnowledgeFormState = {
  question: "",
  answer: "",
  category: KNOWLEDGE_CATEGORY_SUGGESTIONS[0],
};

export function KnowledgeManager({ entries }: KnowledgeManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<KnowledgeFormState>(initialForm);

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
      const url = editingId ? `/api/knowledge/${editingId}` : "/api/knowledge";
      const method = editingId ? "PATCH" : "POST";

      await request(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      toast.success(editingId ? "Entrada actualizada." : "Entrada creada.");
      resetForm();
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("¿Deseas eliminar esta entrada?")) return;

    try {
      await request(`/api/knowledge/${id}`, { method: "DELETE" });
      toast.success("Entrada eliminada.");
      if (editingId === id) resetForm();
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar.");
    }
  }

  function startEditing(entry: KnowledgeEntrySummary) {
    setEditingId(entry.id);
    setForm({
      question: entry.question,
      answer: entry.answer,
      category: entry.category,
    });
  }

  return (
    <div className="space-y-6">
      <section className="panel-card rounded-[34px] px-7 py-8">
        <Badge tone="info">Base de conocimiento</Badge>
        <h1 className="mt-4 text-4xl text-foreground">Organiza respuestas que luego usara la IA municipal</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-muted">
          Esta biblioteca centraliza preguntas frecuentes, categorias y respuestas institucionales para alimentar el futuro asistente conversacional.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              {editingId ? "Editar respuesta" : "Nueva entrada"}
            </p>
            <h2 className="mt-2 text-2xl text-foreground">
              {editingId ? "Ajusta la ficha seleccionada" : "Carga conocimiento institucional"}
            </h2>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Pregunta</span>
              <Input
                value={form.question}
                onChange={(event) =>
                  setForm((current) => ({ ...current, question: event.target.value }))
                }
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Categoria</span>
              <Input
                list="knowledge-categories"
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({ ...current, category: event.target.value }))
                }
              />
              <datalist id="knowledge-categories">
                {KNOWLEDGE_CATEGORY_SUGGESTIONS.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Respuesta</span>
              <Textarea
                value={form.answer}
                onChange={(event) =>
                  setForm((current) => ({ ...current, answer: event.target.value }))
                }
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isPending}>
                {editingId ? "Actualizar entrada" : "Crear entrada"}
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
                Catalogo FAQ
              </p>
              <h2 className="mt-2 text-2xl text-foreground">Entradas cargadas</h2>
            </div>
            <Badge tone="info">{entries.length} fichas</Badge>
          </div>

          <div className="space-y-4">
            {entries.map((entry) => (
              <article key={entry.id} className="rounded-[28px] border border-border bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-semibold text-foreground">{entry.question}</p>
                      <Badge tone="info">{entry.category}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-muted">{entry.answer}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted">Actualizado el {formatDate(entry.updatedAt)}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="secondary" className="gap-2" onClick={() => startEditing(entry)}>
                    <Edit3 className="size-4" />
                    Editar
                  </Button>
                  <Button variant="danger" className="gap-2" onClick={() => handleDelete(entry.id)}>
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
