import { getSession } from "@/app/lib/session";
import { redirect } from "next/navigation";
import Button from "@/app/ui/common/button";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";

export default async function Home() {
  const token = await getSession();

  if (token) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gf-bg">
      {/* Card container */}
      <div className="w-full max-w-[440px] bg-white rounded-[16px] border border-gf-border shadow-[0px_4px_16px_rgba(0,0,0,0.04)] p-8 text-center">
        {/* Logo */}
        <div className="mb-4 flex items-center justify-center w-full">
          <Image
            src="/logo.png"
            alt="Gestión Financiera"
            width={340}
            height={136}
            priority
            className="w-full max-w-[300px] h-auto object-contain"
          />
        </div>

        <h1 className="text-2xl font-bold text-gf-text tracking-tight mb-2">
          Operaciones Hipotecarias
        </h1>

        <p className="text-sm text-gf-text-muted leading-relaxed mb-6">
          Plataforma interna de asistencia para análisis y precalificación
          hipotecaria.
        </p>

        {/* Buttons */}
        <div className="space-y-3">
          <Button variant="primary" href="/login">
            Iniciar sesión
          </Button>
          <Button variant="secondary" href="/register">
            Crear cuenta
          </Button>
        </div>
      </div>

      {/* Security Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-gf-text-muted flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-gf-text-muted" strokeWidth={2} />
          Uso exclusivo interno
        </p>
      </div>
    </main>
  );
}
