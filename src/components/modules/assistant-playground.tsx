"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  CheckCheck,
  CheckCircle2,
  FlaskConical,
  MapPin,
  MoreVertical,
  Phone,
  RefreshCcw,
  SendHorizontal,
  Sparkles,
  UserRound,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import {
  ASSISTANT_ROUTE_LABELS,
  ASSISTANT_TOPIC_LABELS,
} from "@/lib/constants";
import type {
  AssistantAnalyticsSummary,
  AssistantReplyMeta,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelCard } from "@/components/ui/panel-card";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantTurn } from "@/server/assistant-session";

type TestScenario = {
  title: string;
  prompt: string;
  goal: string;
};

type AssistantPlaygroundProps = {
  initialHistory: AssistantTurn[];
  analytics: AssistantAnalyticsSummary;
  sampleQuestions: string[];
  rules: string[];
  testScenarios: TestScenario[];
  mayorName: string;
  contactEmail: string;
  contactPhone: string;
};

function formatTurnTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatInstitutionalIntent(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AssistantPlayground({
  initialHistory,
  analytics,
  sampleQuestions,
  rules,
  testScenarios,
  mayorName,
  contactEmail,
  contactPhone,
}: AssistantPlaygroundProps) {
  const [history, setHistory] = useState<AssistantTurn[]>(initialHistory);
  const [message, setMessage] = useState("");
  const [zone, setZone] = useState("");
  const [userType, setUserType] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastMeta, setLastMeta] = useState<AssistantReplyMeta | null>(null);
  const sessionId = useMemo(() => "panel-demo-session", []);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = chatViewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  }, [history]);

  async function submitPrompt(content: string) {
    const trimmed = content.trim();

    if (!trimmed) {
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          message: trimmed,
          profile: {
            zone: zone || null,
            userType: userType || null,
          },
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo procesar el mensaje.");
      }

      setHistory(payload.data.history);
      setLastMeta(payload.data.meta);
      setMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo consultar el asistente.");
    } finally {
      setIsSending(false);
    }
  }

  async function sendMessage(prefilled?: string) {
    await submitPrompt(prefilled ?? message);
  }

  async function resetConversation() {
    try {
      const response = await fetch("/api/assistant/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo reiniciar la conversacion.");
      }

      setHistory(payload.data.history);
      setLastMeta(null);
      toast.success("Conversacion reiniciada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo reiniciar.");
    }
  }

  async function runSmokeTest() {
    try {
      await resetConversation();

      for (const scenario of testScenarios.slice(0, 4)) {
        await submitPrompt(scenario.prompt);
      }

      toast.success("Prueba rapida completada.");
    } catch {
      toast.error("No se pudo ejecutar la prueba rapida.");
    }
  }

  return (
    <div className="space-y-8">
      <section className="panel-card overflow-hidden rounded-[34px] px-7 py-8">
        <div className="flex flex-wrap gap-3">
          <Badge tone="info">Asistente oficial</Badge>
          <Badge tone="success">Vista tipo WhatsApp</Badge>
          <Badge tone="success">Asistente listo</Badge>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr] xl:items-end">
          <div>
            <h1 className="text-4xl text-foreground">
              Simulador del asistente con apariencia de chat real
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted">
              Rediseñamos el laboratorio para que se vea como un teléfono con WhatsApp abierto,
              sea más claro al probar conversaciones y deje mejor lectura del contexto ciudadano.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] bg-white/80 px-4 py-4 shadow-sm">
              <p className="text-sm text-muted">Consultas hoy</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {analytics.totals.todayQueries}
              </p>
            </div>
            <div className="rounded-[24px] bg-white/80 px-4 py-4 shadow-sm">
              <p className="text-sm text-muted">Tema top</p>
              <p className="mt-2 text-base font-semibold leading-6 text-foreground">
                {analytics.totals.topTopic}
              </p>
            </div>
            <div className="rounded-[24px] bg-white/80 px-4 py-4 shadow-sm">
              <p className="text-sm text-muted">Estado</p>
              <div className="mt-2 text-sm font-semibold text-foreground">Atencion activa</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_26rem]">
        <section className="space-y-6">
          <PanelCard className="overflow-hidden p-0">
            <div className="border-b border-border px-6 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
                    Sandbox conversacional
                  </p>
                  <h2 className="mt-2 text-2xl text-foreground">
                    Prueba el bot como si fuera un WhatsApp real
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" className="gap-2" onClick={resetConversation}>
                    <RefreshCcw className="size-4" />
                    Reiniciar
                  </Button>
                  <Button variant="ghost" className="gap-2" onClick={() => void runSmokeTest()}>
                    <FlaskConical className="size-4" />
                    Prueba rapida
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MapPin className="size-4" />
                  Zona o barrio
                </span>
                <Input
                  value={zone}
                  onChange={(event) => setZone(event.target.value)}
                  placeholder="Ej. San Antonio o Centro"
                />
              </label>
              <label className="block space-y-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <UserRound className="size-4" />
                  Tipo de usuario
                </span>
                <Input
                  value={userType}
                  onChange={(event) => setUserType(event.target.value)}
                  placeholder="Ej. Ciudadano, comerciante, familia"
                />
              </label>
            </div>

            <div className="bg-[linear-gradient(180deg,rgba(11,36,53,0.06),rgba(23,63,115,0.02))] px-4 py-6 sm:px-6">
              <div className="mx-auto w-full max-w-[48rem] overflow-hidden rounded-[2rem] border border-white/40 bg-[#e9edef] shadow-[0_30px_90px_rgba(9,22,34,0.18)]">
                <div className="flex items-center justify-between border-b border-black/5 bg-[#f0f2f5] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                    <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                    <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                  </div>
                  <div className="rounded-full bg-white px-4 py-1 text-xs font-semibold text-muted shadow-sm">
                    WhatsApp Web Demo
                  </div>
                  <div className="w-[4.5rem]" />
                </div>

                <div className="grid min-h-[30rem] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_16rem]">
                  <div className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-3 bg-[#1f6f5c] px-4 py-3 text-white">
                      <button className="rounded-full p-1 text-white/90">
                        <ArrowLeft className="size-4" />
                      </button>
                      <div className="flex size-10 items-center justify-center rounded-full bg-white/15 text-white">
                        <Bot className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">Asistente Rionegro</p>
                        <p className="truncate text-[11px] text-white/80">En linea</p>
                      </div>
                      <div className="flex items-center gap-1 text-white/90">
                        <button className="rounded-full p-1.5">
                          <Video className="size-4" />
                        </button>
                        <button className="rounded-full p-1.5">
                          <Phone className="size-4" />
                        </button>
                        <button className="rounded-full p-1.5">
                          <MoreVertical className="size-4" />
                        </button>
                      </div>
                    </div>

                    <div
                      ref={chatViewportRef}
                      className="min-h-[18rem] max-h-[20rem] space-y-3 overflow-y-auto px-4 py-4 sm:min-h-[21rem] sm:max-h-[23rem] xl:min-h-[24rem] xl:max-h-[24rem]"
                      style={{
                        backgroundColor: "#efeae2",
                        backgroundImage:
                          "radial-gradient(rgba(17,27,33,0.04) 1px, transparent 1px), radial-gradient(rgba(17,27,33,0.03) 1px, transparent 1px)",
                        backgroundPosition: "0 0, 12px 12px",
                        backgroundSize: "24px 24px",
                      }}
                    >
                      {history.length === 0 ? (
                        <div className="flex justify-start">
                          <div className="max-w-[85%] rounded-[1.3rem] rounded-tl-md bg-white px-4 py-3 shadow-sm">
                            <p className="text-sm leading-7 text-foreground">
                              Hola. Puedes preguntarme por eventos, noticias, secretarias,
                              sedes oficiales, San Nicolas, aeropuerto, salud y otros lugares de
                              Rionegro.
                            </p>
                            <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-muted">
                              <span>10:31</span>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {history.map((turn, index) => {
                        const isAssistant = turn.role === "assistant";

                        return (
                          <div
                            key={`${turn.createdAt}-${index}`}
                            className={cn("flex", isAssistant ? "justify-start" : "justify-end")}
                          >
                            <div
                              className={cn(
                                "max-w-[86%] px-4 py-3 shadow-sm",
                                isAssistant
                                  ? "rounded-[1.3rem] rounded-tl-md bg-white"
                                  : "rounded-[1.3rem] rounded-tr-md bg-[#d9fdd3]",
                              )}
                            >
                              <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">
                                {isAssistant ? <Bot className="size-3" /> : null}
                                <span>{isAssistant ? "Asistente" : "Usuario"}</span>
                              </div>
                              <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
                                {turn.content}
                              </p>
                              <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-muted">
                                <span>{formatTurnTime(turn.createdAt)}</span>
                                {!isAssistant ? (
                                  <CheckCheck className="size-3.5 text-[#53bdeb]" />
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t border-black/5 bg-[#f0f2f5] px-4 py-3">
                      <div className="rounded-[1.4rem] bg-white p-2 shadow-sm">
                        <Textarea
                          value={message}
                          onChange={(event) => setMessage(event.target.value)}
                          className="min-h-18 border-0 px-3 py-2 shadow-none focus:border-transparent"
                          placeholder="Escribe una pregunta ciudadana. Ej. Donde queda San Nicolas?"
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void sendMessage();
                            }
                          }}
                        />
                        <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-2">
                          <p className="text-xs text-muted">
                            Enter envia. Shift + Enter crea salto de linea.
                          </p>
                          <Button
                            className="gap-2 rounded-full bg-[#1f6f5c] px-5 hover:bg-[#175545]"
                            onClick={() => void sendMessage()}
                            disabled={isSending}
                          >
                            <SendHorizontal className="size-4" />
                            {isSending ? "Enviando..." : "Enviar"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <aside className="border-t border-black/5 bg-[#f0f2f5] px-3 py-4 xl:border-l xl:border-t-0">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                      Atajos
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1 xl:block xl:space-y-2 xl:overflow-visible xl:pb-0">
                      {sampleQuestions.slice(0, 6).map((question) => (
                        <button
                          key={question}
                          className="min-w-[13rem] rounded-full border border-[#d0d7dd] bg-white px-3 py-2 text-left text-xs text-foreground transition hover:border-[#1f6f5c] hover:text-[#1f6f5c] xl:w-full xl:min-w-0"
                          onClick={() => void sendMessage(question)}
                          disabled={isSending}
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          </PanelCard>

          <PanelCard className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
                  Preguntas sugeridas
                </p>
                <h2 className="mt-2 text-2xl text-foreground">Consultas para validar el bot</h2>
              </div>
              <Badge tone="info">QA guiado</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {testScenarios.map((scenario) => (
                <button
                  key={scenario.title}
                  className="rounded-[24px] border border-border bg-white px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  onClick={() => void sendMessage(scenario.prompt)}
                  disabled={isSending}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{scenario.title}</p>
                      <p className="mt-1 text-sm text-muted">{scenario.goal}</p>
                    </div>
                    <Sparkles className="mt-1 size-4 shrink-0 text-accent" />
                  </div>
                  <p className="mt-3 rounded-[18px] bg-surface px-3 py-2 text-sm text-foreground">
                    {scenario.prompt}
                  </p>
                </button>
              ))}
            </div>
          </PanelCard>
        </section>

        <aside className="space-y-6">
          <PanelCard className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Lectura del turno
            </p>
            <h2 className="text-2xl text-foreground">Ultimo turno del asistente</h2>
            {lastMeta ? (
              <div className="space-y-3">
                <div className="grid gap-3">
                  <div className="rounded-[22px] bg-surface px-4 py-4">
                    <p className="text-sm text-muted">Tema detectado</p>
                    <p className="mt-2 font-semibold text-foreground">
                      {ASSISTANT_TOPIC_LABELS[lastMeta.topic]}
                    </p>
                  </div>
                  <div className="rounded-[22px] bg-surface px-4 py-4">
                    <p className="text-sm text-muted">Enfoque aplicado</p>
                    <p className="mt-2 font-semibold text-foreground">
                      {ASSISTANT_ROUTE_LABELS[lastMeta.route]}
                    </p>
                  </div>
                  <div className="rounded-[22px] bg-surface px-4 py-4">
                    <p className="text-sm text-muted">Intencion institucional</p>
                    <p className="mt-2 font-semibold text-foreground">
                      {formatInstitutionalIntent(lastMeta.institutionalIntent)}
                    </p>
                  </div>
                  <div className="rounded-[22px] bg-surface px-4 py-4">
                    <p className="text-sm text-muted">Respuesta</p>
                    <p className="mt-2 font-semibold text-foreground">
                      {lastMeta.usedOpenAI ? "Mas conversacional" : "Directa y guiada"}
                    </p>
                  </div>
                  <div className="rounded-[22px] bg-surface px-4 py-4">
                    <p className="text-sm text-muted">Perfil aplicado</p>
                    <p className="mt-2 font-semibold text-foreground">
                      {lastMeta.profile.zone ?? "Sin zona"} /{" "}
                      {lastMeta.profile.userType ?? "Sin tipo"}
                    </p>
                  </div>
                </div>
                <div className="rounded-[22px] bg-surface px-4 py-4">
                  <p className="text-sm text-muted">Fuentes usadas</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lastMeta.sources.length ? (
                      lastMeta.sources.map((source) => (
                        <Badge key={`${source.type}-${source.title}`} tone="info">
                          {source.title}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted">
                        No hubo fuentes concretas para esta respuesta.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[22px] bg-surface px-4 py-4 text-sm text-muted">
                Envia una consulta para ver el tema detectado, el enfoque aplicado y las fuentes
                usadas por el asistente.
              </div>
            )}
          </PanelCard>

          <PanelCard className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Directrices
            </p>
            <h2 className="text-2xl text-foreground">Como debe responder</h2>
            <div className="space-y-3">
              {rules.map((rule) => (
                <div key={rule} className="rounded-[22px] bg-surface px-4 py-3 text-sm text-muted">
                  {rule}
                </div>
              ))}
            </div>
          </PanelCard>

          <PanelCard className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Resumen rapido
            </p>
            <h2 className="text-2xl text-foreground">Estado del laboratorio</h2>
            <div className="grid gap-3">
              <div className="rounded-[22px] bg-surface px-4 py-4">
                <p className="text-sm text-muted">Mensajes en sesion</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{history.length}</p>
              </div>
              <div className="rounded-[22px] bg-surface px-4 py-4">
                <p className="text-sm text-muted">Consultas acumuladas</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">
                  {analytics.totals.totalQueries}
                </p>
              </div>
              <div className="rounded-[22px] bg-surface px-4 py-4">
                <p className="text-sm text-muted">Consultas de hoy</p>
                <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  {analytics.totals.todayQueries}
                </div>
              </div>
            </div>
          </PanelCard>

          <PanelCard className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              Contacto oficial
            </p>
            <h2 className="text-2xl text-foreground">Base institucional</h2>
            <div className="space-y-3 text-sm leading-7 text-muted">
              <p>
                <span className="font-semibold text-foreground">Alcalde:</span> {mayorName}
              </p>
              <p>
                <span className="font-semibold text-foreground">Correo:</span> {contactEmail}
              </p>
              <p>
                <span className="font-semibold text-foreground">Telefono:</span> {contactPhone}
              </p>
            </div>
          </PanelCard>
        </aside>
      </div>
    </div>
  );
}
