"use client";

import { useMemo, useState } from "react";
import { Copy, MessageCircleMore, Phone, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelCard } from "@/components/ui/panel-card";
import type { AssistantConversationThread } from "@/lib/types";

type AssistantConversationsPanelProps = {
  threads: AssistantConversationThread[];
};

function formatThreadTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBubbleTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AssistantConversationsPanel({
  threads,
}: AssistantConversationsPanelProps) {
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState(threads[0]?.sessionId ?? "");

  const filteredThreads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return threads;
    }

    return threads.filter((thread) => {
      return [
        thread.title,
        thread.phoneNumber ?? "",
        thread.lastMessage,
        ...thread.exchanges.map((exchange) => exchange.userMessage),
        ...thread.exchanges.map((exchange) => exchange.assistantReply),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [search, threads]);

  const activeThread =
    filteredThreads.find((thread) => thread.sessionId === selectedSessionId) ??
    filteredThreads[0] ??
    null;

  async function handleCopyPhone(phoneNumber: string | null) {
    if (!phoneNumber) {
      toast.error("Esta conversacion no tiene numero de WhatsApp.");
      return;
    }

    try {
      await navigator.clipboard.writeText(phoneNumber);
      toast.success("Numero copiado.");
    } catch {
      toast.error("No se pudo copiar el numero.");
    }
  }

  return (
    <div className="space-y-8">
      <section className="panel-card rounded-[34px] px-7 py-8">
        <div className="flex flex-wrap gap-3">
          <Badge tone="info">Bandeja conversacional</Badge>
          <Badge tone="success">Webhook UltraMsg</Badge>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h1 className="text-4xl text-foreground">Registro completo de conversaciones del bot</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted">
              Revisa quien escribio, que pregunto, a que hora lo hizo y como respondio el
              asistente, en una vista tipo chat para seguimiento operativo.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] bg-white/80 px-4 py-4 shadow-sm">
              <p className="text-sm text-muted">Chats registrados</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{threads.length}</p>
            </div>
            <div className="rounded-[24px] bg-white/80 px-4 py-4 shadow-sm">
              <p className="text-sm text-muted">Mensajes visibles</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {threads.reduce((total, thread) => total + thread.messageCount, 0)}
              </p>
            </div>
            <div className="rounded-[24px] bg-white/80 px-4 py-4 shadow-sm">
              <p className="text-sm text-muted">Canal principal</p>
              <p className="mt-2 text-sm font-semibold text-foreground">WhatsApp + panel</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <PanelCard className="overflow-hidden p-0">
          <div className="border-b border-border px-5 py-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Conversaciones
            </p>
            <h2 className="mt-2 text-2xl text-foreground">Bandeja tipo WhatsApp Web</h2>
            <div className="mt-4 relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por numero, pregunta o respuesta"
                className="pl-11"
              />
            </div>
          </div>

          <div className="max-h-[780px] space-y-2 overflow-y-auto px-3 py-3">
            {filteredThreads.length ? (
              filteredThreads.map((thread) => {
                const isActive = activeThread?.sessionId === thread.sessionId;

                return (
                  <button
                    key={thread.sessionId}
                    type="button"
                    onClick={() => setSelectedSessionId(thread.sessionId)}
                    className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                      isActive
                        ? "border-primary/30 bg-[#eaf4ff]"
                        : "border-transparent bg-surface hover:border-border hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{thread.title}</p>
                        <p className="mt-1 truncate text-sm text-muted">{thread.lastMessage}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted">
                        {formatThreadTime(thread.lastActivityAt)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone={thread.channel === "WHATSAPP" ? "success" : "info"}>
                        {thread.channel === "WHATSAPP" ? "WhatsApp" : "Panel"}
                      </Badge>
                      <Badge tone="default">{thread.messageCount} mensajes</Badge>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[24px] border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted">
                No hay conversaciones que coincidan con la busqueda.
              </div>
            )}
          </div>
        </PanelCard>

        <PanelCard className="overflow-hidden p-0">
          {activeThread ? (
            <>
              <div className="border-b border-border bg-white px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-12 items-center justify-center rounded-full bg-[#dff2ea] text-[#0f766e]">
                      <MessageCircleMore className="size-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{activeThread.title}</p>
                      <p className="text-sm text-muted">
                        {activeThread.channel === "WHATSAPP"
                          ? "Conversacion recibida por webhook"
                          : "Conversacion interna del panel"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeThread.phoneNumber ? (
                      <Button
                        variant="secondary"
                        className="gap-2"
                        onClick={() => void handleCopyPhone(activeThread.phoneNumber)}
                      >
                        <Copy className="size-4" />
                        Copiar numero
                      </Button>
                    ) : null}
                    <Badge tone="info">{activeThread.exchangeCount} turnos</Badge>
                  </div>
                </div>
              </div>

              <div className="max-h-[780px] space-y-6 overflow-y-auto bg-[#efeae2] px-5 py-5">
                {activeThread.exchanges.map((exchange) => (
                  <div key={exchange.id} className="space-y-3">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-[22px] rounded-br-md bg-[#d9fdd3] px-4 py-3 shadow-sm">
                        <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
                          {exchange.userMessage}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted">
                          <span className="font-semibold uppercase tracking-[0.18em]">Usuario</span>
                          <span>{formatBubbleTime(exchange.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-start">
                      <div className="max-w-[88%] rounded-[22px] rounded-bl-md bg-white px-4 py-3 shadow-sm">
                        <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
                          {exchange.assistantReply}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold uppercase tracking-[0.18em]">
                              Asistente
                            </span>
                            <Badge tone="default">{exchange.topic}</Badge>
                          </div>
                          <span>{formatBubbleTime(exchange.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border bg-white px-5 py-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[20px] bg-surface px-4 py-4">
                    <p className="text-sm text-muted">Ultima actividad</p>
                    <p className="mt-2 font-semibold text-foreground">
                      {formatThreadTime(activeThread.lastActivityAt)}
                    </p>
                  </div>
                  <div className="rounded-[20px] bg-surface px-4 py-4">
                    <p className="text-sm text-muted">Numero</p>
                    <p className="mt-2 font-semibold text-foreground">
                      {activeThread.phoneNumber ?? "Sesion del panel"}
                    </p>
                  </div>
                  <div className="rounded-[20px] bg-surface px-4 py-4">
                    <p className="text-sm text-muted">Canal</p>
                    <div className="mt-2 inline-flex items-center gap-2 font-semibold text-foreground">
                      <Phone className="size-4 text-primary" />
                      {activeThread.channel === "WHATSAPP" ? "Webhook UltraMsg" : "Panel de prueba"}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[620px] items-center justify-center bg-surface px-6 text-center text-sm text-muted">
              Todavia no hay chats registrados para mostrar en la bandeja.
            </div>
          )}
        </PanelCard>
      </div>
    </div>
  );
}
