"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LockKeyhole, Mail } from "lucide-react";
import { toast } from "sonner";

import { ADMIN_DEMO_EMAIL, ADMIN_DEMO_PASSWORD } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    email: ADMIN_DEMO_EMAIL,
    password: ADMIN_DEMO_PASSWORD,
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo iniciar sesion.");
      }

      toast.success("Acceso concedido.");
      router.push("/dashboard");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo iniciar sesion.");
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-foreground">Correo admin</span>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
            className="pl-11"
          />
        </div>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-foreground">Contrasena</span>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm((current) => ({ ...current, password: event.target.value }))
            }
            className="pl-11"
          />
        </div>
      </label>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Ingresando..." : "Entrar al panel"}
      </Button>

      <div className="rounded-3xl border border-border bg-surface p-4 text-sm text-muted">
        <p className="font-semibold text-foreground">Credenciales demo</p>
        <p className="mt-2">
          {ADMIN_DEMO_EMAIL} / {ADMIN_DEMO_PASSWORD}
        </p>
      </div>
    </form>
  );
}
