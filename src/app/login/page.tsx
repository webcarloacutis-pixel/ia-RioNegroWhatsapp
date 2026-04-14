import { redirect } from "next/navigation";
import { Building2, MessageCircleMore, ShieldCheck, Sparkles } from "lucide-react";

import { LoginForm } from "@/components/modules/login-form";
import { Badge } from "@/components/ui/badge";
import { PanelCard } from "@/components/ui/panel-card";
import { getAdminProfile } from "@/lib/auth";

export default async function LoginPage() {
  const profile = await getAdminProfile();

  if (profile) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[1.2fr_520px]">
        <section className="panel-card relative overflow-hidden rounded-[36px] p-8 sm:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(23,63,115,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(13,123,130,0.18),transparent_30%)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <Badge tone="info">Demo institucional lista para alcaldia</Badge>
              <h1 className="mt-6 max-w-3xl text-5xl leading-tight text-foreground">
                WhatsApp Rionegro. El tablero oficial para informar, segmentar y demostrar
                impacto en minutos.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">
                Construido para que la Alcaldia pueda presentar comunicados, programar envios,
                organizar conocimiento y simular alcance ciudadano antes de integrar el bot real.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <PanelCard className="rounded-[30px] bg-white/82">
                <MessageCircleMore className="size-8 text-primary" />
                <p className="mt-4 text-lg font-semibold">Envios demo creibles</p>
                <p className="mt-2 text-sm text-muted">
                  Simulaciones con feedback visual y logs listos para presentacion.
                </p>
              </PanelCard>
              <PanelCard className="rounded-[30px] bg-white/82">
                <Building2 className="size-8 text-accent" />
                <p className="mt-4 text-lg font-semibold">Enfoque institucional</p>
                <p className="mt-2 text-sm text-muted">
                  Un look serio, moderno y facil de entender para equipos de gobierno.
                </p>
              </PanelCard>
              <PanelCard className="rounded-[30px] bg-white/82">
                <ShieldCheck className="size-8 text-success" />
                <p className="mt-4 text-lg font-semibold">Acceso admin simple</p>
                <p className="mt-2 text-sm text-muted">
                  Login basico con sesion segura por cookie para la demo actual.
                </p>
              </PanelCard>
            </div>
          </div>
        </section>

        <section className="panel-card flex items-center rounded-[36px] p-8 sm:p-10">
          <div className="w-full">
            <div className="flex items-center gap-3 text-primary">
              <Sparkles className="size-5" />
              <span className="text-sm font-semibold uppercase tracking-[0.26em]">
                Acceso administrativo
              </span>
            </div>
            <h2 className="mt-4 text-4xl text-foreground">Ingresa al panel de control</h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              Esta version funciona como sistema completo de demo y ya deja preparado
              `messageService` para conectar tu bot de WhatsApp mas adelante.
            </p>

            <div className="mt-8">
              <LoginForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
