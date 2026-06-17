import { getSession } from "@/app/lib/session";
import { redirect } from "next/navigation";
import Card from "@/app/ui/common/card";
import Button from "@/app/ui/common/button";

export default async function Home() {
  const token = await getSession();

  if (token) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gf-bg">
      <Card className="max-w-xl text-center">
        <h1 className="text-3xl font-bold text-gf-text">
          Gestión Financiera
        </h1>

        <p className="mt-4 text-gf-text-muted">
          Plataforma interna de asistencia para análisis y precalificación
          hipotecaria.
        </p>

        <p className="mt-2 text-sm text-gf-text-soft">
          Uso exclusivo interno
        </p>

        <div className="mt-6 flex justify-center">
          <Button variant="primary" href="/login">
            Iniciar sesión
          </Button>
        </div>
      </Card>
    </main>
  );
}
