"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  BarChart3,
  BookOpenText,
  Bot,
  Activity,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquareShare,
  Radar,
  ShieldCheck,
  Send,
  Siren,
  Stethoscope,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChannelRuntimeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/comunicados", label: "Comunicados", icon: MessageSquareShare },
  { href: "/dashboard/denuncias", label: "Denuncias y Reportes", icon: Siren },
  { href: "/dashboard/programador", label: "Programador", icon: Send },
  { href: "/dashboard/asistente", label: "Asistente IA", icon: Bot },
  { href: "/dashboard/conversaciones", label: "Conversaciones", icon: MessageCircle },
  { href: "/dashboard/qa-dashboard", label: "QA Dashboard", icon: ShieldCheck },
  { href: "/dashboard/base-conocimiento", label: "Base de conocimiento", icon: BookOpenText },
  { href: "/dashboard/segmentacion", label: "Segmentacion", icon: Radar },
  { href: "/dashboard/metricas", label: "Metricas", icon: BarChart3 },
  { href: "/dashboard/estado-sistema", label: "Estado del Sistema", icon: Activity },
  { href: "/dashboard/diagnostico", label: "Diagnostico", icon: Stethoscope },
];

type AppShellProps = {
  adminEmail: string;
  channelStatus: ChannelRuntimeStatus;
  children: React.ReactNode;
};

export function AppShell({ adminEmail, channelStatus, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pendingReportsCount, setPendingReportsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadPendingReportsCount() {
      try {
        const response = await fetch("/api/admin/citizen-reports?status=pending&limit=1");

        if (!response.ok) return;

        const payload = await response.json();
        const count = Number(payload.data?.summary?.pending ?? 0);

        if (!cancelled) {
          setPendingReportsCount(count);
        }
      } catch {
        // El badge es informativo; si falla, la navegacion sigue funcionando.
      }
    }

    void loadPendingReportsCount();
    const interval = window.setInterval(loadPendingReportsCount, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo cerrar la sesion.");
      }

      toast.success("Sesion cerrada.");
      router.push("/login");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cerrar la sesion.");
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
      <div
        className={cn(
          "fixed inset-0 z-30 bg-[#0f1d2ccc]/40 backdrop-blur-sm transition lg:hidden",
          isSidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full w-[280px] flex-col border-r border-white/30 bg-[#102947] px-5 py-6 text-white shadow-2xl shadow-[#102947]/20 transition lg:static lg:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60">
              Municipio de Rionegro
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              Canal Oficial Inteligente
            </h1>
            <p className="mt-2 text-sm text-white/70">
              Panel listo para comunicados, metricas y bot de WhatsApp.
            </p>
          </div>
          <button
            className="rounded-full bg-white/10 p-2 text-white lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-3xl border border-white/12 bg-white/8 px-4 py-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold">
            AR
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{adminEmail}</p>
            <p className="text-xs text-white/60">Administrador principal</p>
          </div>
        </div>

        <nav className="mt-8 space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                  active
                    ? "bg-white text-[#102947]"
                    : "text-white/74 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon className="size-4" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/dashboard/denuncias" && pendingReportsCount > 0 ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      active ? "bg-[#102947] text-white" : "bg-white/14 text-white",
                    )}
                  >
                    {pendingReportsCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-[28px] border border-white/12 bg-white/7 p-4">
          <Badge tone={channelStatus.badgeTone}>{channelStatus.label}</Badge>
          <p className="mt-3 text-sm text-white/78">
            {channelStatus.description}
          </p>
          <div className="mt-3 space-y-1 text-xs text-white/60">
            <p>UltraMsg: {channelStatus.ultraMsgConfigured ? "configurado" : "incompleto"}</p>
            <p>Scheduler: {channelStatus.schedulerEnabled ? "habilitado" : "apagado"}</p>
            <p>
              Destinatarios:{" "}
              {channelStatus.hasRecipientSource
                ? "segmentos o default configurados"
                : "faltan numeros"}
            </p>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <header className="panel-card sticky top-4 z-20 mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              className="flex size-11 items-center justify-center rounded-2xl border border-border bg-white lg:hidden"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="size-5" />
            </button>
            <div>
              <p className="text-sm font-semibold text-muted">WhatsApp Rionegro</p>
              <p className="text-sm text-muted">
                {new Intl.DateTimeFormat("es-CO", {
                  dateStyle: "full",
                }).format(new Date())}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              className="gap-2"
              onClick={handleLogout}
              disabled={isPending}
            >
              <LogOut className="size-4" />
              Salir
            </Button>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
