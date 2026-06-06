"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  Filter,
  FlaskConical,
  Layers3,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { clientLogger } from "@/lib/client-logger";
import {
  KNOWLEDGE_CATEGORY_SUGGESTIONS,
  KNOWLEDGE_INTENT_SUGGESTIONS,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import {
  getKnowledgeCategoryLabel,
  getKnowledgeIntentLabel,
} from "@/lib/knowledge-metadata";
import { cn } from "@/lib/utils";
import type {
  KnowledgeEntrySummary,
  KnowledgeListResult,
  KnowledgeTestAnswerResult,
} from "@/lib/types";

type KnowledgeManagerProps = {
  initialData: KnowledgeListResult;
};

type KnowledgeFilters = {
  q: string;
  category: string;
  intent: string;
  sourceName: string;
  sourceType: string;
  isActive: string;
  isOfficial: string;
  needsReview: string;
  lowConfidence: string;
  tag: string;
  page: number;
  pageSize: number;
};

type KnowledgeFormState = {
  question: string;
  answer: string;
  category: string;
  intent: string;
  shortAnswer: string;
  tagsText: string;
  aliasesText: string;
  sourceUrl: string;
  sourceName: string;
  sourceType: string;
  isOfficial: boolean;
  isActive: boolean;
  needsReview: boolean;
  confidence: number;
  lastVerifiedAt: string;
};

const initialFilters: KnowledgeFilters = {
  q: "",
  category: "",
  intent: "",
  sourceName: "",
  sourceType: "",
  isActive: "",
  isOfficial: "",
  needsReview: "",
  lowConfidence: "",
  tag: "",
  page: 1,
  pageSize: 24,
};

const emptyForm: KnowledgeFormState = {
  question: "",
  answer: "",
  category: KNOWLEDGE_CATEGORY_SUGGESTIONS[0],
  intent: "",
  shortAnswer: "",
  tagsText: "",
  aliasesText: "",
  sourceUrl: "",
  sourceName: "",
  sourceType: "manual_admin",
  isOfficial: false,
  isActive: true,
  needsReview: false,
  confidence: 0.8,
  lastVerifiedAt: "",
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function splitList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n;]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function toFormState(entry?: KnowledgeEntrySummary): KnowledgeFormState {
  if (!entry) return emptyForm;

  return {
    question: entry.question,
    answer: entry.answer,
    category: entry.category,
    intent: entry.intent ?? "",
    shortAnswer: entry.shortAnswer ?? "",
    tagsText: entry.tags.join(", "),
    aliasesText: entry.aliases.join("\n"),
    sourceUrl: entry.sourceUrl ?? "",
    sourceName: entry.sourceName ?? "",
    sourceType: entry.sourceType,
    isOfficial: entry.isOfficial,
    isActive: entry.isActive,
    needsReview: entry.needsReview,
    confidence: entry.confidence,
    lastVerifiedAt: formatDateTimeInput(entry.lastVerifiedAt),
  };
}

function toPayload(form: KnowledgeFormState) {
  return {
    question: form.question,
    answer: form.answer,
    category: form.category,
    intent: form.intent || null,
    shortAnswer: form.shortAnswer || null,
    tags: splitList(form.tagsText),
    aliases: splitList(form.aliasesText),
    sourceUrl: form.sourceUrl || null,
    sourceName: form.sourceName || null,
    sourceType: form.sourceType,
    isOfficial: form.isOfficial,
    isActive: form.isActive,
    needsReview: form.needsReview,
    confidence: Number(form.confidence),
    lastVerifiedAt: form.lastVerifiedAt ? new Date(form.lastVerifiedAt).toISOString() : null,
  };
}

function sourceTypeLabel(value: string) {
  return value.replace(/_/g, " ");
}

function buildQuery(filters: KnowledgeFilters) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === "" || value === null || value === undefined) continue;
    params.set(key, String(value));
  }

  return params.toString();
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function toCsv(items: KnowledgeEntrySummary[]) {
  const headers = [
    "id",
    "question",
    "category",
    "intent",
    "shortAnswer",
    "sourceName",
    "sourceUrl",
    "sourceType",
    "isOfficial",
    "isActive",
    "needsReview",
    "confidence",
    "updatedAt",
  ];
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = items.map((item) =>
    [
      item.id,
      item.question,
      item.category,
      item.intent,
      item.shortAnswer,
      item.sourceName,
      item.sourceUrl,
      item.sourceType,
      item.isOfficial,
      item.isActive,
      item.needsReview,
      item.confidence,
      item.updatedAt,
    ]
      .map(escape)
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

export function KnowledgeManager({ initialData }: KnowledgeManagerProps) {
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState<KnowledgeFilters>(initialFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailEntry, setDetailEntry] = useState<KnowledgeEntrySummary | null>(null);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntrySummary | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<KnowledgeEntrySummary | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [form, setForm] = useState<KnowledgeFormState>(emptyForm);
  const [bulkCategory, setBulkCategory] = useState<string>(KNOWLEDGE_CATEGORY_SUGGESTIONS[0]);
  const [testQuestion, setTestQuestion] = useState("");
  const [testResult, setTestResult] = useState<KnowledgeTestAnswerResult | null>(null);
  const [lastKnowledgeRequestId, setLastKnowledgeRequestId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedItems = useMemo(
    () => data.items.filter((item) => selectedIds.has(item.id)),
    [data.items, selectedIds],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      startTransition(async () => {
        try {
          clientLogger.info("knowledge", "loading", {
            path: "/api/knowledge",
            page: filters.page,
            pageSize: filters.pageSize,
          });
          const response = await fetch(`/api/knowledge?${buildQuery(filters)}`);
          const requestId = response.headers.get("x-request-id");
          const payload = await response.json();

          if (!response.ok) {
            clientLogger.error("knowledge", "request failed", {
              status: response.status,
              path: "/api/knowledge",
              requestId: payload.requestId ?? requestId,
              message: payload.error,
            });
            throw new Error(payload.error ?? "No se pudo cargar la base.");
          }

          setLastKnowledgeRequestId(requestId ?? payload.requestId ?? null);
          setData(payload.data);
          if (payload.data?.fallback) {
            clientLogger.warn("knowledge", "fallback demo shown", {
              requestId: requestId ?? payload.requestId,
              path: "/api/knowledge",
            });
          }
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "No se pudo cargar la base.");
        }
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [filters]);

  function updateFilters(patch: Partial<KnowledgeFilters>) {
    setFilters((current) => ({
      ...current,
      ...patch,
      page: patch.page ?? 1,
    }));
  }

  function openCreate() {
    setEditingEntry(null);
    setForm({ ...emptyForm });
    setIsEditorOpen(true);
  }

  function openEdit(entry: KnowledgeEntrySummary) {
    setEditingEntry(entry);
    setForm(toFormState(entry));
    setIsEditorOpen(true);
  }

  async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, options);
    const requestId = response.headers.get("x-request-id");
    const payload = await response.json();

    if (!response.ok) {
      const diagnosticId = payload.requestId ?? requestId;
      clientLogger.error("knowledge", "request failed", {
        status: response.status,
        path: url,
        requestId: diagnosticId,
        message: payload.error,
      });
      throw new Error(
        diagnosticId
          ? `${payload.error ?? "No se pudo procesar la solicitud."} Codigo: ${diagnosticId}`
          : payload.error ?? "No se pudo procesar la solicitud.",
      );
    }

    setLastKnowledgeRequestId(requestId ?? payload.requestId ?? null);
    return payload.data as T;
  }

  async function reload() {
    const result = await apiRequest<KnowledgeListResult>(`/api/knowledge?${buildQuery(filters)}`);
    setData(result);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const isEdit = Boolean(editingEntry);
      const url = isEdit ? `/api/knowledge/${editingEntry?.id}` : "/api/knowledge";

      await apiRequest(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });

      toast.success(isEdit ? "Ficha actualizada." : "Ficha creada.");
      setEditingEntry(null);
      setForm({ ...emptyForm });
      setIsEditorOpen(false);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }

  async function handleToggleActive(entry: KnowledgeEntrySummary) {
    try {
      const updated = await apiRequest<KnowledgeEntrySummary>(
        `/api/knowledge/${entry.id}/toggle-active`,
        { method: "POST" },
      );
      toast.success(updated.isActive ? "Ficha activada." : "Ficha desactivada.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar.");
    }
  }

  async function handleMarkReviewed(entry: KnowledgeEntrySummary) {
    try {
      await apiRequest<KnowledgeEntrySummary>(`/api/knowledge/${entry.id}/mark-reviewed`, {
        method: "POST",
      });
      toast.success("Ficha marcada como revisada.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo marcar.");
    }
  }

  async function handleDelete(entry: KnowledgeEntrySummary) {
    try {
      await apiRequest<{ id: string }>(`/api/knowledge/${entry.id}`, {
        method: "DELETE",
      });
      toast.success("Ficha eliminada correctamente.");
      setDeletingEntry(null);
      setDetailEntry((current) => (current?.id === entry.id ? null : current));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(entry.id);
        return next;
      });
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar la ficha.");
    }
  }

  async function handleBulk(action: "activate" | "deactivate" | "markReviewed" | "changeCategory") {
    if (!selectedIds.size) return;

    try {
      const result = await apiRequest<{ updated: number }>("/api/knowledge/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          action,
          category: action === "changeCategory" ? bulkCategory : undefined,
        }),
      });

      toast.success(`${result.updated} fichas actualizadas.`);
      setSelectedIds(new Set());
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo aplicar la accion.");
    }
  }

  async function handleTestAnswer(entryId?: string, questionOverride?: string) {
    const question = (questionOverride ?? testQuestion).trim();
    if (!question) {
      toast.error("Escribe una pregunta para Eva.");
      return;
    }

    try {
      const result = await apiRequest<KnowledgeTestAnswerResult>("/api/knowledge/test-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, entryId }),
      });
      setTestResult(result);
      if (questionOverride) {
        setTestQuestion(questionOverride);
      }
      if (result.wouldSayUnknown) {
        toast.warning("Eva no encontro una ficha suficientemente relacionada.");
      } else {
        toast.success("Eva encontro una ficha relacionada.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo probar con Eva.");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function exportSelected(format: "json" | "csv") {
    const items = selectedItems.length ? selectedItems : data.items;

    if (format === "json") {
      downloadFile(
        "eva-knowledge.json",
        JSON.stringify(items, null, 2),
        "application/json;charset=utf-8",
      );
      return;
    }

    downloadFile("eva-knowledge.csv", toCsv(items), "text/csv;charset=utf-8");
  }

  const summaryCards = [
    { label: "Total", value: data.summary.total },
    { label: "Activos", value: data.summary.active },
    { label: "Revision", value: data.summary.needsReview },
    { label: "Oficiales", value: data.summary.official },
    { label: "Baja confianza", value: data.summary.lowConfidence },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-border bg-white px-6 py-7 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge tone="info">Eva</Badge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">
              Base de conocimiento
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
              Informacion oficial, respuestas cortas, fuentes y estados de revision.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="gap-2" onClick={() => reload()}>
              <RefreshCw className="size-4" />
              Actualizar
            </Button>
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="size-4" />
              Nueva ficha
            </Button>
          </div>
        </div>

        {data.fallback ? (
          <div className="mt-5 rounded-2xl border border-[#f1d7a4] bg-[#fff7e8] px-4 py-3 text-sm text-[#7c5719]">
            No se pudo conectar con la base de conocimiento real. Se estan mostrando datos demo.
            {lastKnowledgeRequestId ? (
              <span className="ml-1 font-semibold">Codigo de diagnostico: {lastKnowledgeRequestId}</span>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((item) => (
          <div key={item.label} className="rounded-[22px] border border-border bg-white px-5 py-4">
            <p className="text-sm font-semibold text-muted">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[28px] border border-border bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-10"
              value={filters.q}
              onChange={(event) => updateFilters({ q: event.target.value })}
              placeholder="Buscar"
            />
          </div>
          <Select
            className="max-w-[220px]"
            value={filters.category}
            onChange={(event) => updateFilters({ category: event.target.value })}
          >
            <option value="">Categoria</option>
            {KNOWLEDGE_CATEGORY_SUGGESTIONS.map((category) => (
              <option key={category} value={category}>
                {getKnowledgeCategoryLabel(category)}
              </option>
            ))}
          </Select>
          <Select
            className="max-w-[190px]"
            value={filters.intent}
            onChange={(event) => updateFilters({ intent: event.target.value })}
          >
            <option value="">Intencion</option>
            {KNOWLEDGE_INTENT_SUGGESTIONS.map((intent) => (
              <option key={intent} value={intent}>
                {getKnowledgeIntentLabel(intent)}
              </option>
            ))}
          </Select>
          <Select
            className="max-w-[190px]"
            value={filters.sourceName}
            onChange={(event) => updateFilters({ sourceName: event.target.value })}
          >
            <option value="">Fuente</option>
            {data.facets.sources.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </Select>
          <Select
            className="max-w-[170px]"
            value={filters.isActive}
            onChange={(event) => updateFilters({ isActive: event.target.value })}
          >
            <option value="">Estado</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </Select>
          <Select
            className="max-w-[180px]"
            value={filters.needsReview}
            onChange={(event) => updateFilters({ needsReview: event.target.value })}
          >
            <option value="">Revision</option>
            <option value="true">Requiere revision</option>
            <option value="false">Revisado</option>
          </Select>
          <Button
            variant={filters.lowConfidence === "true" ? "primary" : "secondary"}
            className="gap-2"
            onClick={() =>
              updateFilters({ lowConfidence: filters.lowConfidence === "true" ? "" : "true" })
            }
          >
            <Filter className="size-4" />
            Baja confianza
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {data.facets.categories.slice(0, 14).map((facet) => (
            <button
              key={facet.value}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition",
                filters.category === facet.value
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-muted hover:border-primary hover:text-primary",
              )}
              onClick={() =>
                updateFilters({ category: filters.category === facet.value ? "" : facet.value })
              }
            >
              {getKnowledgeCategoryLabel(facet.label)} {facet.count}
            </button>
          ))}
        </div>
      </section>

      {selectedIds.size ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-primary/20 bg-primary-soft px-5 py-4">
          <div>
            <p className="font-semibold text-primary">{selectedIds.size} seleccionadas</p>
            <p className="text-sm text-primary/75">Acciones masivas disponibles</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => handleBulk("activate")}>
              Activar
            </Button>
            <Button variant="secondary" onClick={() => handleBulk("deactivate")}>
              Desactivar
            </Button>
            <Button variant="secondary" onClick={() => handleBulk("markReviewed")}>
              Marcar revisadas
            </Button>
            <Select
              className="w-[210px]"
              value={bulkCategory}
              onChange={(event) => setBulkCategory(event.target.value)}
            >
              {KNOWLEDGE_CATEGORY_SUGGESTIONS.map((category) => (
                <option key={category} value={category}>
                  {getKnowledgeCategoryLabel(category)}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={() => handleBulk("changeCategory")}>
              Cambiar categoria
            </Button>
            <Button variant="secondary" className="gap-2" onClick={() => exportSelected("json")}>
              <Download className="size-4" />
              JSON
            </Button>
            <Button variant="secondary" className="gap-2" onClick={() => exportSelected("csv")}>
              <Download className="size-4" />
              CSV
            </Button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted">
                {data.pagination.total} resultados
              </p>
              <h2 className="text-2xl font-semibold text-foreground">Fichas de conocimiento</h2>
            </div>
            {isPending ? <Loader2 className="size-5 animate-spin text-primary" /> : null}
          </div>

          {data.items.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.items.map((entry) => (
                <KnowledgeCard
                  key={entry.id}
                  entry={entry}
                  selected={selectedIds.has(entry.id)}
                  onSelect={() => toggleSelected(entry.id)}
                  onDetail={() => setDetailEntry(entry)}
                  onEdit={() => openEdit(entry)}
                  onTest={() => handleTestAnswer(entry.id, entry.question)}
                  onToggleActive={() => handleToggleActive(entry)}
                  onMarkReviewed={() => handleMarkReviewed(entry)}
                  onDelete={() => setDeletingEntry(entry)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-border bg-white px-6 py-10 text-center text-muted">
              No encontramos resultados con esos filtros.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-border bg-white px-4 py-3">
            <p className="text-sm text-muted">
              Pagina {data.pagination.page} de {data.pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={filters.page <= 1}
                onClick={() => updateFilters({ page: Math.max(1, filters.page - 1) })}
              >
                Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={filters.page >= data.pagination.totalPages}
                onClick={() => updateFilters({ page: filters.page + 1 })}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[24px] border border-border bg-white p-5">
            <div className="flex items-center gap-2">
              <FlaskConical className="size-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Probar con Eva</h2>
            </div>
            <Textarea
              className="mt-4 min-h-[110px]"
              value={testQuestion}
              onChange={(event) => setTestQuestion(event.target.value)}
              placeholder="Pregunta"
            />
            <Button className="mt-3 w-full gap-2" onClick={() => handleTestAnswer()}>
              <FlaskConical className="size-4" />
              Probar
            </Button>
            {testResult ? (
              <div className="mt-4 rounded-2xl bg-surface p-4">
                <Badge tone={testResult.wouldSayUnknown ? "warning" : "success"}>
                  Confianza {formatPercent(testResult.confidence)}
                </Badge>
                <p className="mt-3 text-sm leading-6 text-foreground">{testResult.answer}</p>
                {testResult.usedItems.length ? (
                  <div className="mt-3 space-y-1 text-xs text-muted">
                    {testResult.usedItems.map((item) => (
                      <p key={item.id}>{item.question}</p>
                    ))}
                  </div>
                ) : testResult.wouldSayUnknown ? (
                  <p className="mt-3 text-xs font-semibold text-[#7c5719]">
                    Eva no encontro una ficha suficientemente relacionada. Revisa la pregunta,
                    variantes o categoria.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-[24px] border border-border bg-white p-5">
            <div className="flex items-center gap-2">
              <Layers3 className="size-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Conflictos</h2>
            </div>
            <div className="mt-4 space-y-3">
              {data.conflicts.length ? (
                data.conflicts.map((conflict) => (
                  <div key={conflict.id} className="rounded-2xl border border-border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-foreground">{conflict.topic}</p>
                      <Badge tone={conflict.status === "open" ? "warning" : "success"}>
                        {conflict.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted">{conflict.category ?? "Sin categoria"}</p>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted">
                  No hay conflictos abiertos.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-[24px] border border-border bg-white p-5">
            <div className="flex items-center gap-2">
              <Tags className="size-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Tags</h2>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.facets.tags.slice(0, 18).map((tag) => (
                <button
                  key={tag.value}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    filters.tag === tag.value
                      ? "bg-primary text-white"
                      : "bg-surface text-muted hover:text-primary",
                  )}
                  onClick={() => updateFilters({ tag: filters.tag === tag.value ? "" : tag.value })}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </section>

      {detailEntry ? (
        <DetailPanel
          entry={detailEntry}
          testQuestion={testQuestion}
          onSetTestQuestion={setTestQuestion}
          onClose={() => setDetailEntry(null)}
          onEdit={() => openEdit(detailEntry)}
          onTest={() => handleTestAnswer(detailEntry.id)}
        />
      ) : null}

      {isEditorOpen ? (
        <EditDialog
          entry={editingEntry}
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          onClose={() => {
            setEditingEntry(null);
            setForm({ ...emptyForm });
            setIsEditorOpen(false);
          }}
        />
      ) : null}

      {deletingEntry ? (
        <DeleteConfirmDialog
          entry={deletingEntry}
          onCancel={() => setDeletingEntry(null)}
          onConfirm={() => handleDelete(deletingEntry)}
        />
      ) : null}
    </div>
  );
}

type KnowledgeCardProps = {
  entry: KnowledgeEntrySummary;
  selected: boolean;
  onSelect: () => void;
  onDetail: () => void;
  onEdit: () => void;
  onTest: () => void;
  onToggleActive: () => void;
  onMarkReviewed: () => void;
  onDelete: () => void;
};

function KnowledgeCard({
  entry,
  selected,
  onSelect,
  onDetail,
  onEdit,
  onTest,
  onToggleActive,
  onMarkReviewed,
  onDelete,
}: KnowledgeCardProps) {
  return (
    <article className="rounded-[24px] border border-border bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          checked={selected}
          onChange={onSelect}
          aria-label="Seleccionar ficha"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <Badge tone="info">{getKnowledgeCategoryLabel(entry.category)}</Badge>
            <Badge tone={entry.isActive ? "success" : "danger"}>
              {entry.isActive ? "Activo" : "Inactivo"}
            </Badge>
            {entry.isOfficial ? <Badge tone="success">Oficial</Badge> : null}
            {entry.needsReview ? <Badge tone="warning">Requiere revision</Badge> : null}
          </div>
          <h3 className="mt-4 text-xl font-semibold leading-7 text-foreground">{entry.question}</h3>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">
            {entry.shortAnswer || entry.answer}
          </p>
        </div>
      </div>

      <div className="mt-4 text-sm text-muted">
        <p>Actualizada: {formatDate(entry.updatedAt)}</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="secondary" className="gap-2" onClick={onDetail}>
          <Eye className="size-4" />
          Ver
        </Button>
        <Button variant="secondary" className="gap-2" onClick={onEdit}>
          <Edit3 className="size-4" />
          Editar
        </Button>
        <Button variant="secondary" className="gap-2" onClick={onTest}>
          <FlaskConical className="size-4" />
          Probar
        </Button>
        <Button variant="secondary" className="gap-2" onClick={onToggleActive}>
          <Power className="size-4" />
          {entry.isActive ? "Desactivar" : "Activar"}
        </Button>
        {entry.needsReview ? (
          <Button variant="secondary" className="gap-2" onClick={onMarkReviewed}>
            <CheckCircle2 className="size-4" />
            Revisada
          </Button>
        ) : null}
        <Button variant="ghost" className="gap-2 text-danger" onClick={onDelete}>
          <Trash2 className="size-4" />
          Eliminar
        </Button>
      </div>
    </article>
  );
}

type DetailPanelProps = {
  entry: KnowledgeEntrySummary;
  testQuestion: string;
  onSetTestQuestion: (value: string) => void;
  onClose: () => void;
  onEdit: () => void;
  onTest: () => void;
};

function DetailPanel({
  entry,
  testQuestion,
  onSetTestQuestion,
  onClose,
  onEdit,
  onTest,
}: DetailPanelProps) {
  return (
    <div className="fixed inset-0 z-40 bg-[#0f1d2c66] backdrop-blur-sm">
      <aside className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="info">{getKnowledgeCategoryLabel(entry.category)}</Badge>
              {entry.intent ? <Badge>{getKnowledgeIntentLabel(entry.intent)}</Badge> : null}
              {entry.isOfficial ? <Badge tone="success">Oficial</Badge> : null}
              {entry.needsReview ? <Badge tone="warning">Requiere revision</Badge> : null}
            </div>
            <h2 className="mt-4 text-3xl font-semibold text-foreground">{entry.question}</h2>
          </div>
          <button
            className="flex size-10 items-center justify-center rounded-full bg-surface text-muted"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <DetailBlock label="Respuesta corta" value={entry.shortAnswer || "Sin respuesta corta"} />
          <DetailBlock label="Contenido completo" value={entry.answer} />
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailBlock label="Fuente" value={entry.sourceName ?? "Sin fuente"} />
            <DetailBlock label="Tipo de fuente" value={sourceTypeLabel(entry.sourceType)} />
            <DetailBlock label="URL fuente" value={entry.sourceUrl ?? "Sin URL"} />
            <DetailBlock label="Confianza" value={formatPercent(entry.confidence)} />
            <DetailBlock label="Activo" value={entry.isActive ? "Si" : "No"} />
            <DetailBlock label="Necesita revision" value={entry.needsReview ? "Si" : "No"} />
            <DetailBlock
              label="Ultima verificacion"
              value={entry.lastVerifiedAt ? formatDate(entry.lastVerifiedAt) : "Pendiente"}
            />
            <DetailBlock label="Creado" value={formatDate(entry.createdAt)} />
            <DetailBlock label="Actualizado" value={formatDate(entry.updatedAt)} />
          </div>

          <div className="rounded-[22px] bg-surface p-4">
            <p className="text-sm font-semibold text-foreground">Tags y aliases</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[...entry.tags, ...entry.aliases].length ? (
                [...entry.tags, ...entry.aliases].map((item) => (
                  <span key={item} className="rounded-full bg-white px-3 py-1 text-xs text-muted">
                    {item}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted">Sin tags ni aliases</span>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-border p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <p className="font-semibold text-foreground">Vista previa de Eva</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">{entry.shortAnswer || entry.answer}</p>
            <Textarea
              className="mt-4"
              value={testQuestion}
              onChange={(event) => onSetTestQuestion(event.target.value)}
              placeholder="Pregunta"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button className="gap-2" onClick={onTest}>
                <FlaskConical className="size-4" />
                Probar con Eva
              </Button>
              <Button variant="secondary" className="gap-2" onClick={onEdit}>
                <Edit3 className="size-4" />
                Editar
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 break-words text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}

function DeleteConfirmDialog({
  entry,
  onCancel,
  onConfirm,
}: {
  entry: KnowledgeEntrySummary;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1d2c66] px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[24px] border border-border bg-white p-6 shadow-2xl">
        <Badge tone="danger">Eliminar ficha</Badge>
        <h2 className="mt-4 text-2xl font-semibold text-foreground">
          Eva dejara de usar esta informacion
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          Seguro que quieres eliminar esta ficha? Esta accion quitara la informacion de la base de
          conocimiento.
        </p>
        <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm font-semibold text-foreground">
          {entry.question}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm}>
            Eliminar ficha
          </Button>
        </div>
      </div>
    </div>
  );
}

type EditDialogProps = {
  entry: KnowledgeEntrySummary | null;
  form: KnowledgeFormState;
  setForm: React.Dispatch<React.SetStateAction<KnowledgeFormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

function EditDialog({ entry, form, setForm, onSubmit, onClose }: EditDialogProps) {
  const isOfficialScraped =
    entry?.isOfficial && (entry.sourceType === "official_website" || entry.sourceType === "scraped_official");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0f1d2c66] px-4 py-8 backdrop-blur-sm">
      <form
        className="mx-auto max-w-3xl rounded-[24px] border border-border bg-white p-6 shadow-2xl"
        onSubmit={onSubmit}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge tone="info">{entry ? "Editar" : "Nueva ficha"}</Badge>
            <h2 className="mt-3 text-3xl font-semibold text-foreground">
              {entry ? "Editar ficha" : "Agregar informacion para Eva"}
            </h2>
          </div>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-full bg-surface text-muted"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        {isOfficialScraped ? (
          <div className="mt-5 rounded-2xl border border-[#f1d7a4] bg-[#fff7e8] px-4 py-3 text-sm text-[#7c5719]">
            Estas editando un dato obtenido de una fuente oficial.
          </div>
        ) : null}

        <div className="mt-6 grid gap-5">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-foreground">Pregunta o tema</span>
            <Input
              value={form.question}
              onChange={(event) =>
                setForm((current) => ({ ...current, question: event.target.value }))
              }
              placeholder="Ej. Donde queda el restaurante Las Delicias?"
              required
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Categoria</span>
            <Select
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value }))
              }
            >
              {KNOWLEDGE_CATEGORY_SUGGESTIONS.map((category) => (
                <option key={category} value={category}>
                  {getKnowledgeCategoryLabel(category)}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-foreground">Respuesta que Eva debe dar</span>
            <Textarea
              className="min-h-[180px]"
              value={form.answer}
              onChange={(event) =>
                setForm((current) => ({ ...current, answer: event.target.value }))
              }
              placeholder="Ej. El restaurante Las Delicias queda en el centro de Rionegro..."
              required
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={form.isActive}
              onChange={(event) =>
                setForm((current) => ({ ...current, isActive: event.target.checked }))
              }
            />
            <span className="text-sm font-semibold text-foreground">
              Eva puede usar esta informacion
            </span>
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-foreground">
              Otras formas en que la gente puede preguntar
            </span>
            <Textarea
              className="min-h-[110px]"
              value={form.aliasesText}
              onChange={(event) =>
                setForm((current) => ({ ...current, aliasesText: event.target.value }))
              }
              placeholder={"ubicacion restaurante las delicias\ndonde esta las delicias\ncomo llego al restaurante las delicias"}
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">{entry ? "Guardar cambios" : "Crear ficha"}</Button>
        </div>
      </form>
    </div>
  );
}
