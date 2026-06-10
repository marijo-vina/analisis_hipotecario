import { getSession } from "@/app/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const token = await getSession();

  if (token) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100">
      <section className="bg-white p-8 rounded-xl shadow-md max-w-xl text-center">
        <h1 className="text-3xl font-bold text-slate-900">
          Gestión Financiera
        </h1>

        <p className="mt-4 text-slate-600">
          Plataforma interna de asistencia para análisis y precalificación
          hipotecaria.
        </p>

        <p className="mt-2 text-sm text-slate-500">
          Sprint 1 — Base del sistema y gestión de expedientes
        </p>

        <Link
          href="/login"
          className="mt-6 inline-block rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
        >
          Iniciar sesión
        </Link>
      </section>
    </main>
  );
}
