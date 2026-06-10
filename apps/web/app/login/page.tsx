import { getSession } from "@/app/lib/session";
import { redirect } from "next/navigation";
import LoginForm from "@/app/ui/login-form";

export default async function LoginPage() {
  const token = await getSession();

  if (token) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 mb-6 text-center">
          Iniciar sesión
        </h1>
        <LoginForm />
      </div>
    </main>
  );
}
