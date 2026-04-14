"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BarChart3,
  BookOpenText,
  Bot,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareShare,
  Radar,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/comunicados", label: "Comunicados", icon: MessageSquareShare },
  { href: "/dashboard/programador", label: "Programador", icon: Send },
  { href: "/dashboard/asistente", label: "Asistente IA", icon: Bot },
  { href: "/dashboard/base-conocimiento", label: "Base de conocimiento", icon: BookOpenText },
  { href: "/dashboard/segmentacion", label: "Segmentacion", icon: Radar },
  { href: "/dashboard/metricas", label: "Metricas", icon: BarChart3 },
];

type AppShellProps = {
  adminEmail: string;
  children: React.ReactNode;
};

export function AppShell({ adminEmail, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

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
              Panel listo para comunicados, demo y futura integracion con bot.
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
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-[28px] border border-white/12 bg-white/7 p-4">
          <Badge className="bg-[#d6f4f1] text-[#0f665f]">Modo demo activo</Badge>
          <p className="mt-3 text-sm text-white/78">
            Los envios se simulan con logs y feedback visual. `messageService` ya queda listo
            para conectar tu bot despues.
          </p>
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
            <Badge tone="info">Preparado para Supabase + Prisma</Badge>
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
