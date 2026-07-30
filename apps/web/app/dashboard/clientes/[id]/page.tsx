import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Phone,
  CreditCard,
  Calendar,
  Pencil,
  Plus,
  Eye,
  FolderOpen,
  User,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import ErrorMessage from "@/app/ui/error-message";
import StatusBadge from "@/app/ui/status-badge";
import CopyButton from "@/app/ui/common/copy-button";
import type { Client, MortgageCase, PaginatedResponse } from "@/app/lib/definitions";

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

function getInitials(name: string): string {
  if (!name) return "CL";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Helper to generate Gmail compose URL */
function getGmailComposeUrl(email: string): string {
  if (!email) return "#";
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;
}

/** Helper to generate WhatsApp wa.me URL supporting Mexican 10-digit and international + codes */
function getWhatsAppUrl(phone: string): string {
  if (!phone) return "#";
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return "#";

  if (hasPlus || digits.length > 10) {
    return `https://wa.me/${digits}`;
  }
  return `https://wa.me/52${digits}`;
}

/**
 * Redesigned Client detail page — server component.
 *
 * Implements the Stitch "Workspace de Cliente" layout:
 * - Top Navigation Breadcrumb & Header with Avatar and action CTAs (Editar cliente)
 * - Bento-style Personal Information Card with interactive Gmail & WhatsApp triggers
 * - Linked Mortgage Cases Card with currency formatting, StatusBadge, and direct Eye/Pencil links
 */
export default async function ClientDetailPage({
  params,
}: ClientDetailPageProps) {
  const { id } = await params;

  // Fetch client and cases in parallel
  const [clientResult, casesResult] = await Promise.all([
    apiFetch<Client>(`/clients/${id}`),
    apiFetch<PaginatedResponse<MortgageCase>>("/mortgage-cases?page=1&limit=100"),
  ]);

  // ---- Not found ----------------------------------------------------------
  if (!clientResult.ok && clientResult.notFound) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/clientes"
          className="inline-flex items-center gap-2 text-sm font-semibold text-gf-text-muted hover:text-gf-red transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a clientes</span>
        </Link>
        <div className="bg-white border border-gf-border rounded-xl p-8 text-center max-w-lg mx-auto shadow-xs">
          <User className="w-12 h-12 text-gf-text-muted mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gf-text mb-2">Cliente no encontrado</h2>
          <p className="text-sm text-gf-text-muted mb-6">
            No se encontró un cliente con el ID especificado o fue eliminado.
          </p>
          <Link
            href="/dashboard/clientes"
            className="inline-flex items-center justify-center bg-gf-red hover:bg-gf-red-dark text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-xs"
          >
            Ir al listado de clientes
          </Link>
        </div>
      </div>
    );
  }

  // ---- Generic error ------------------------------------------------------
  if (!clientResult.ok) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/clientes"
          className="inline-flex items-center gap-2 text-sm font-semibold text-gf-text-muted hover:text-gf-red transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a clientes</span>
        </Link>
        <ErrorMessage message="Error al cargar la información del cliente." />
      </div>
    );
  }

  // ---- Success ------------------------------------------------------------
  const client = clientResult.data;
  const initials = getInitials(client.fullName);
  const gmailUrl = getGmailComposeUrl(client.email);
  const whatsappUrl = getWhatsAppUrl(client.phone);

  // Derive associated cases for this client
  const allCases: MortgageCase[] = casesResult.ok ? casesResult.data.data : [];
  const associatedCases = allCases.filter((c) => c.clientId === id);

  return (
    <div className="space-y-8">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          href="/dashboard/clientes"
          className="inline-flex items-center gap-2 text-sm font-semibold text-gf-text-muted hover:text-gf-red transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al listado de clientes</span>
        </Link>

        {/* Header Profile Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gf-red-soft text-gf-red flex items-center justify-center font-bold text-xl shrink-0 shadow-2xs">
              {initials}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gf-text">
                {client.fullName}
              </h1>
              <p className="text-sm text-gf-text-muted mt-0.5">
                Cliente Hipotecario &bull; Registrado el{" "}
                {new Date(client.createdAt).toLocaleDateString("es-MX", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/clientes/${id}/editar`}
              className="inline-flex items-center justify-center gap-2 bg-white border border-gf-border hover:bg-gf-surface-dim text-gf-text px-5 h-11 rounded-xl text-sm font-semibold transition-all shadow-2xs shrink-0 active:scale-[0.98]"
            >
              <Pencil className="w-4 h-4 text-gf-text-muted" />
              <span>Editar cliente</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Datos Personales Bento Card ────────────────────────────────────── */}
      <div className="bg-white border border-gf-border rounded-xl p-6 sm:p-8 shadow-xs">
        <h2 className="text-lg font-bold text-gf-text mb-6 border-b border-gf-border pb-3 flex items-center gap-2">
          <User className="w-5 h-5 text-gf-red" />
          <span>Información General y de Contacto</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Nombre */}
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-gf-surface-dim text-gf-text-muted shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                Nombre completo
              </p>
              <p className="text-sm font-semibold text-gf-text mt-1">
                {client.fullName}
              </p>
            </div>
          </div>

          {/* Correo Electrónico (Gmail Direct Trigger) */}
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-gf-surface-dim text-gf-red shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                  Correo electrónico
                </p>
                <CopyButton value={client.email} label="Copiar" />
              </div>
              <a
                href={gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-gf-red hover:underline mt-1 block truncate"
                title="Abrir ventana de redactar correo en Gmail"
              >
                {client.email}
              </a>
              <a
                href={gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-gf-red hover:underline mt-1"
              >
                <span>Redactar en Gmail</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Teléfono (WhatsApp Direct Trigger) */}
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
              <Phone className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                  Teléfono
                </p>
                <CopyButton value={client.phone} label="Copiar" />
              </div>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-gf-text hover:text-emerald-700 transition-colors mt-1 block truncate"
                title="Abrir chat directo en WhatsApp"
              >
                {client.phone}
              </a>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md hover:bg-emerald-100 transition-colors mt-1"
              >
                <MessageCircle className="w-3 h-3" />
                <span>Enviar WhatsApp</span>
              </a>
            </div>
          </div>

          {/* RFC */}
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-gf-surface-dim text-gf-text-muted shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                  RFC
                </p>
                {client.rfc && <CopyButton value={client.rfc} label="Copiar" />}
              </div>
              <p className="text-sm font-mono font-medium text-gf-text mt-1">
                {client.rfc || "—"}
              </p>
            </div>
          </div>

          {/* CURP */}
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-gf-surface-dim text-gf-text-muted shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                  CURP
                </p>
                {client.curp && <CopyButton value={client.curp} label="Copiar" />}
              </div>
              <p className="text-sm font-mono font-medium text-gf-text mt-1">
                {client.curp || "—"}
              </p>
            </div>
          </div>

          {/* Registro */}
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-gf-surface-dim text-gf-text-muted shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                Fecha de alta
              </p>
              <p className="text-sm font-medium text-gf-text mt-1">
                {new Date(client.createdAt).toLocaleDateString("es-MX")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Expedientes Vinculados Section ─────────────────────────────────── */}
      <div className="bg-white border border-gf-border rounded-xl shadow-xs overflow-hidden">
        <div className="p-6 border-b border-gf-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gf-surface-dim/30">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gf-text">
              Expedientes vinculados
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gf-red-soft text-gf-red">
              {associatedCases.length}
            </span>
          </div>

          <Link
            href={`/dashboard/expedientes/nuevo?clientId=${id}`}
            className="inline-flex items-center justify-center gap-2 bg-gf-red hover:bg-gf-red-dark text-white px-4 h-9 rounded-lg text-xs font-semibold transition-all shadow-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Crear expediente</span>
          </Link>
        </div>

        {!casesResult.ok ? (
          <div className="p-6">
            <ErrorMessage message="Error al cargar los expedientes asociados." />
          </div>
        ) : associatedCases.length === 0 ? (
          <div className="p-8 text-center">
            <FolderOpen className="w-10 h-10 text-gf-text-muted mx-auto mb-2 stroke-[1.5]" />
            <p className="text-sm font-medium text-gf-text-muted">
              Este cliente aún no tiene expedientes hipotecarios asignados.
            </p>
            <Link
              href={`/dashboard/expedientes/nuevo?clientId=${id}`}
              className="inline-flex items-center gap-2 text-xs font-semibold text-gf-red hover:underline mt-3"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear el primer expediente para este cliente</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-gf-border bg-gf-surface-dim/60">
                  <th scope="col" className="py-3.5 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    Expediente
                  </th>
                  <th scope="col" className="py-3.5 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    Tipo de crédito
                  </th>
                  <th scope="col" className="py-3.5 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    Monto solicitado
                  </th>
                  <th scope="col" className="py-3.5 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    Estatus
                  </th>
                  <th scope="col" className="py-3.5 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gf-border">
                {associatedCases.map((c) => {
                  const caseCode = `EXP-${c.id.slice(0, 8).toUpperCase()}`;
                  const amountFormatted =
                    c.requestedAmount != null
                      ? `$${Number(c.requestedAmount).toLocaleString("es-MX", {
                          minimumFractionDigits: 2,
                        })} MXN`
                      : "—";

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-gf-surface-dim/40 transition-colors h-[52px]"
                    >
                      <td className="py-3 px-6 text-sm font-semibold font-mono text-gf-red">
                        {caseCode}
                      </td>
                      <td className="py-3 px-6 text-sm text-gf-text font-medium">
                        {c.creditType?.name || "—"}
                      </td>
                      <td className="py-3 px-6 text-sm font-medium text-gf-text">
                        {amountFormatted}
                      </td>
                      <td className="py-3 px-6 text-sm">
                        <StatusBadge
                          code={c.status?.code ?? "PENDING"}
                          name={c.status?.name ?? "En Proceso"}
                        />
                      </td>
                      <td className="py-3 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/dashboard/expedientes/${c.id}`}
                            className="p-2 text-gf-text-muted hover:text-gf-red hover:bg-gf-red-soft/40 transition-colors rounded-lg"
                            title="Ver expediente"
                            aria-label={`Ver expediente ${caseCode}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <Link
                            href={`/dashboard/expedientes/${c.id}/editar`}
                            className="p-2 text-gf-text-muted hover:text-gf-red hover:bg-gf-red-soft/40 transition-colors rounded-lg"
                            title="Editar expediente"
                            aria-label={`Editar expediente ${caseCode}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

