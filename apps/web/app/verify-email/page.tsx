"use client";

import { useEffect, useState, use } from "react";
import { verifyEmailAction } from "@/app/actions/auth";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";

export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = use(searchParams);
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setSuccess(false);
      setMessage("No se ha proporcionado un token de verificación.");
      return;
    }

    verifyEmailAction(token).then((res) => {
      setLoading(false);
      setSuccess(res.success);
      setMessage(res.message);
    });
  }, [token]);

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

      {/* Verification card */}
      <div className="w-full max-w-[420px] bg-white rounded-[12px] border border-gf-border shadow-[0px_4px_12px_rgba(0,0,0,0.03)] p-8 text-center">
        {loading ? (
          <div className="py-8 space-y-4">
            <Loader2 className="h-10 w-10 text-gf-red animate-spin mx-auto" />
            <p className="text-sm font-medium text-gf-text">
              Verificando tu cuenta de correo...
            </p>
          </div>
        ) : success ? (
          <div className="space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CheckCircle2 className="h-8 w-8" strokeWidth={2} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-gf-text">
                ¡Cuenta Verificada!
              </h2>
              <p className="text-sm text-gf-text-muted leading-relaxed">
                {message}
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center h-[44px] px-4 rounded-[10px] bg-gf-red text-white text-sm font-semibold hover:bg-gf-red/90 transition-colors"
              >
                Iniciar sesión ahora
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
              <XCircle className="h-8 w-8" strokeWidth={2} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-gf-text">
                Error de Verificación
              </h2>
              <p className="text-sm text-gf-text-muted leading-relaxed">
                {message}
              </p>
            </div>
            <div className="pt-2 space-y-3">
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center h-[44px] px-4 rounded-[10px] bg-gf-red text-white text-sm font-semibold hover:bg-gf-red/90 transition-colors"
              >
                Ir a Iniciar Sesión
              </Link>
              <Link
                href="/register"
                className="inline-flex w-full items-center justify-center text-xs text-gf-text-muted hover:text-gf-text"
              >
                ¿No tienes cuenta? Regístrate de nuevo
              </Link>
            </div>
          </div>
        )}
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
