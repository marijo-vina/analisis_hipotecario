import { getSession } from "@/app/lib/session";
import { redirect } from "next/navigation";
import LoginForm from "@/app/ui/login-form";
import { ShieldCheck } from "lucide-react";
import Image from "next/image";

export default async function LoginPage() {
  const token = await getSession();

  if (token) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Brand header */}
      <div className="mb-8 text-center flex flex-col items-center w-full max-w-[420px]">
        <div className="mb-3 flex items-center justify-center w-full px-2">
          <Image
            src="/logo.png"
            alt="Gestión Financiera"
            width={400}
            height={160}
            priority
            className="w-full max-w-[340px] h-auto object-contain"
          />
        </div>
        <h1 className="mt-1 text-3xl font-bold text-gf-text tracking-tight">
          Operaciones Hipotecarias
        </h1>
      </div>

      {/* Login card */}
      <div className="w-full max-w-[420px] bg-white rounded-[12px] border border-gf-border shadow-[0px_4px_12px_rgba(0,0,0,0.03)] p-8">
        <h2 className="text-xl font-semibold text-gf-text mb-6 text-center">
          Acceso interno
        </h2>
        <LoginForm />
      </div>

      {/* Security Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-gf-text-muted flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-gf-text-muted" strokeWidth={2} />
          Plataforma de uso exclusivo interno
        </p>
      </div>
    </main>
  );
}
