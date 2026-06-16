import { getSession } from "@/app/lib/session";
import { redirect } from "next/navigation";
import LoginForm from "@/app/ui/login-form";
import Card from "@/app/ui/common/card";

export default async function LoginPage() {
  const token = await getSession();

  if (token) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gf-bg px-4">
      {/* Brand header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gf-text">
          Gestión Financiera
        </h1>
        <p className="mt-1 text-gf-text-muted text-sm">
          Operaciones Hipotecarias
        </p>
      </div>

      {/* Login card */}
      <Card className="w-full max-w-md">
        <h2 className="text-xl font-semibold text-gf-text mb-6 text-center">
          Acceso interno
        </h2>
        <LoginForm />
      </Card>

      {/* Footer */}
      <p className="mt-6 text-gf-text-muted text-xs text-center">
        Plataforma de uso exclusivo interno
      </p>
    </main>
  );
}
