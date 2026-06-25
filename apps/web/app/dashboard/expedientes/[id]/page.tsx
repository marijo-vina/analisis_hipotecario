import type { ReactNode } from "react";
import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import ErrorMessage from "@/app/ui/error-message";
import PageHeader from "@/app/ui/common/page-header";
import Button from "@/app/ui/common/button";
import Card from "@/app/ui/common/card";
import StatusBadge from "@/app/ui/status-badge";
import CaseStatusDropdown from "@/app/ui/case-status-dropdown";
import { DocumentsClientSection } from "@/app/ui/documents/documents-client-section";
import CopyButton from "@/app/ui/common/copy-button";
import type {
  MortgageCase,
  Client,
  DocumentType,
  Document,
} from "@/app/lib/definitions";

// ── Person type → human-readable Spanish label ─────────────────────────
const PERSON_TYPE_LABELS: Record<string, string> = {
  SALARIED: "Asalariado",
};

function personTypeLabel(code: string): string {
  return PERSON_TYPE_LABELS[code] ?? code;
}

interface CaseDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Mortgage case detail page — server component.
 *
 * Layout (top → bottom):
 *   1. Page header with breadcrumbs + actions
 *   2. Two-column grid: case summary / client (left 2/3), observations (right 1/3)
 *   3. Full-width: documents section (upload + list)
 *   4. Full-width: extraction results grouped by document type
 */
export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { id } = await params;

  const result = await apiFetch<MortgageCase>(`/mortgage-cases/${id}`);

  if (!result.ok && result.notFound) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Expedientes", href: "/dashboard/expedientes" },
            { label: "No encontrado" },
          ]}
          title="Expediente no encontrado"
        />
        <Card>
          <p className="text-gf-text-muted mb-4">
            No se encontró un expediente con el ID especificado.
          </p>
          <Link
            href="/dashboard/expedientes"
            className="text-gf-text font-medium hover:underline"
          >
            &larr; Volver al listado
          </Link>
        </Card>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Expedientes", href: "/dashboard/expedientes" },
            { label: "Error" },
          ]}
          title="Expediente"
        />
        <ErrorMessage message="Error al cargar el expediente" />
        <div className="mt-4">
          <Link
            href="/dashboard/expedientes"
            className="text-gf-text font-medium hover:underline"
          >
            &larr; Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  const c = result.data;

  const [statusesResult, clientResult, docTypesResult, docsResult] =
    await Promise.all([
      apiFetch<{
        data: { code: string; name: string; order: number }[];
      }>("/case-statuses"),
      apiFetch<Client>(`/clients/${c.clientId}`),
      apiFetch<{ data: DocumentType[] }>("/document-types"),
      apiFetch<{ data: Document[] }>(`/mortgage-cases/${id}/documents`),
    ]);

  const statuses = statusesResult.ok ? statusesResult.data.data : [];
  const client = clientResult.ok ? clientResult.data : null;
  const documentTypes: DocumentType[] = docTypesResult.ok
    ? docTypesResult.data.data
    : [];
  const documents: Document[] = docsResult.ok ? docsResult.data.data : [];

  const extraction = getExtraction(documents);
  const expShort = id.slice(0, 8);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Expedientes", href: "/dashboard/expedientes" },
          { label: `Expediente ${expShort.toUpperCase()}` },
        ]}
        title={`Expediente ${expShort.toUpperCase()}`}
        statusBadge={
          <StatusBadge code={c.status.code} name={c.status.name} />
        }
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              href={`/dashboard/expedientes/${id}/editar`}
            >
              Editar expediente
            </Button>
            <Button variant="secondary" href="#documentos">
              Subir documento
            </Button>
          </div>
        }
      />

      {/* ── Top: 2-column grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="text-base font-semibold text-gf-text mb-4">
              Resumen del expediente
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Monto solicitado"
                value={
                  c.requestedAmount != null
                    ? `$${Number(c.requestedAmount).toLocaleString("es-MX")}`
                    : undefined
                }
              />
              <Field label="Ubicación" value={c.propertyLocation} />
              <Field
                label="Valor propiedad"
                value={
                  c.propertyValue != null
                    ? `$${Number(c.propertyValue).toLocaleString("es-MX")}`
                    : undefined
                }
              />
              <Field
                label="Plazo estimado"
                value={
                  c.estimatedTermMonths != null
                    ? `${c.estimatedTermMonths} meses`
                    : undefined
                }
              />
              <Field label="Tipo crédito" value={c.creditType.name} />
              <Field
                label="Tipo persona"
                value={personTypeLabel(c.personType)}
              />
            </dl>
          </Card>

          <Card>
            <h3 className="text-base font-semibold text-gf-text mb-4">
              Cliente asociado
            </h3>
            {client ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nombre" value={client.fullName} />
                <Field label="RFC" value={client.rfc} />
                <Field
                  label="Tipo persona"
                  value={personTypeLabel(c.personType)}
                />
                <Field label="Correo" value={client.email} />
                <Field label="Teléfono" value={client.phone} />
              </dl>
            ) : (
              <p className="text-sm text-gf-text-muted">
                No se pudo cargar la información del cliente.
              </p>
            )}
          </Card>

          <CaseStatusDropdown
            caseId={c.id}
            currentCode={c.status.code}
            statuses={statuses}
          />
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="text-base font-semibold text-gf-text mb-2">
              Observaciones
            </h3>
            {c.notes ? (
              <p className="text-sm text-gf-text whitespace-pre-wrap">
                {c.notes}
              </p>
            ) : (
              <p className="text-sm text-gf-text-muted">Sin observaciones</p>
            )}
          </Card>

          <Card>
            <h3 className="text-base font-semibold text-gf-text mb-2">
              Análisis financiero
            </h3>
            <p className="text-sm text-gf-text-muted">
              El análisis financiero estará disponible cuando se procesen todos
              los documentos requeridos.
            </p>
          </Card>
        </div>
      </div>

      {/* ── Full-width: Documentos ─────────────────────────────────────── */}
      <div className="mt-6" id="documentos">
        <DocumentsClientSection
          caseId={c.id}
          documentTypes={documentTypes}
          initialDocuments={documents}
        />
      </div>

      {/* ── Full-width: Datos extraídos ────────────────────────────────── */}
      {extraction && (
        <div className="mt-6">
          <ExtractionResults extraction={extraction} />
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Converts ISO YYYY-MM-DD to Mexican DD-MM-YYYY for display. */
function formatDateDisplay(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso; // not a clean ISO date, pass through
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gf-text">
        {value && typeof value === "string" && value.length > 0
          ? value
          : (value ?? "\u2014")}
      </dd>
    </div>
  );
}

// ── Extraction data model ──────────────────────────────────────────────────

interface IneValidation {
  cic: string | undefined;
  citizenIdentifier: string | undefined;
}

interface ExtractionData {
  idType: string | undefined;
  fullName: string | undefined;
  birthDate: string | undefined;
  curp: string | undefined;
  voterKey: string | undefined;
  idNumber: string | undefined;
  expirationDate: string | undefined;
  expirationLabel: string;
  isExpired: boolean;
  ineValidation: IneValidation | null;
  alerts: Array<Record<string, unknown>>;
}

function getExtraction(documents: Document[]): ExtractionData | null {
  const ineDoc = documents.find(
    (d) =>
      d.documentType.code === "INE" &&
      d.documentStatus.code === "PROCESSED" &&
      d.extractedData != null,
  );

  if (!ineDoc?.extractedData || typeof ineDoc.extractedData !== "object") {
    return null;
  }

  const ed = ineDoc.extractedData as Record<string, unknown>;
  const identity = (ed.identity as Record<string, unknown>) ?? {};
  const ivRaw = ed.ineValidation as Record<string, unknown> | undefined;

  // ── Alerts: dedup by code, filter empty messages ─────────────────────
  const rawAlerts: Array<Record<string, unknown>> = Array.isArray(ed.alerts)
    ? (ed.alerts as Array<Record<string, unknown>>)
    : [];
  const seen = new Set<string>();
  const alerts = rawAlerts.filter((a) => {
    const msg = a.message;
    if (!msg || String(msg).trim() === "") return false;

    // Only show WARNING and CRITICAL — hide INFO and duplicates
    const severity = String(a.severity ?? "").toUpperCase();
    if (severity !== "WARNING" && severity !== "CRITICAL") return false;

    const code = String(a.code ?? "");
    // Dedup by code
    if (code && seen.has(code)) return false;
    if (code) seen.add(code);

    // Exclude INE_MANUAL_VALIDATION_REQUIRED from alert list
    // (it's already shown in the manual validation card badge)
    if (code === "INE_MANUAL_VALIDATION_REQUIRED") return false;

    return true;
  });

  // ── Expiration: multi-field fallback ──────────────────────────────────
  const expirationCandidates = [
    identity.visibleExpirationDate,
    identity.expirationDate,
    identity.validUntil,
    identity.vigencia,
    identity.vigenciaVisible,
    identity.printedValidity,
    identity.documentValidity,
  ];
  let expirationDate: string | undefined;
  let expirationLabel = "Vigencia";

  for (const cand of expirationCandidates) {
    if (cand && typeof cand === "string" && cand.trim() !== "") {
      expirationDate = cand.trim();
      break;
    }
  }

  // Fallback: check if there's a year-only value in ineValidation
  if (!expirationDate && ivRaw) {
    const issueYear = ivRaw.issueYear as string | undefined;
    if (issueYear && issueYear.trim() !== "") {
      expirationDate = issueYear.trim();
      expirationLabel = "Vigencia visible";
    }
  }

  // ── INE validation: only CIC and citizenIdentifier ────────────────────
  const ineValidation: IneValidation | null = ivRaw
    ? {
        cic: (ivRaw.cic as string) ?? undefined,
        citizenIdentifier:
          (ivRaw.citizenIdentifier as string) ?? undefined,
      }
    : null;

  return {
    idType: (identity.idType as string) ?? undefined,
    fullName: (identity.fullName as string) ?? undefined,
    birthDate: formatDateDisplay((identity.birthDate as string) ?? undefined),
    curp: (identity.curp as string) ?? undefined,
    voterKey: (identity.voterKey as string) ?? undefined,
    idNumber: (identity.idNumber as string) ?? undefined,
    expirationDate: formatDateDisplay(expirationDate),
    expirationLabel,
    isExpired: identity.isExpiredByVisibleDate === true,
    ineValidation,
    alerts,
  };
}

// ── Extraction results section ─────────────────────────────────────────────

function ExtractionResults({
  extraction,
}: {
  extraction: ExtractionData;
}) {
  const hasManualValidation =
    extraction.idType === "INE" && extraction.ineValidation != null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gf-text mb-4">
        Datos extraídos
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card: Identidad del cliente */}
        <Card>
          <h3 className="text-base font-semibold text-gf-text mb-3">
            Identidad del cliente
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Tipo de documento" value={extraction.idType} />
            <Field label="Nombre completo" value={extraction.fullName} />
            <Field label="Fecha de nacimiento" value={extraction.birthDate} />
            <Field label="CURP" value={extraction.curp} />
            {extraction.idType === "INE" && (
              <Field label="Clave de elector" value={extraction.voterKey} />
            )}
            {(extraction.idType === "PASSPORT" || extraction.idNumber) && (
              <Field
                label="Número de documento"
                value={extraction.idNumber}
              />
            )}
            <Field
              label={extraction.expirationLabel}
              value={extraction.expirationDate}
            />
          </dl>

          {extraction.isExpired && (
            <div className="mt-2">
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                Documento vencido
              </span>
            </div>
          )}

          {/* Alertas de extracción — solo si hay alertas con mensaje */}
          {extraction.alerts.length > 0 && (
            <div className="mt-4 border-t border-gf-border pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-2">
                Alertas
              </h4>
              <ul className="space-y-1.5">
                {extraction.alerts.map((alert, idx) => (
                  <li
                    key={idx}
                    className={`text-xs rounded px-2 py-1 ${
                      alert.severity === "CRITICAL"
                        ? "bg-red-50 text-red-700"
                        : alert.severity === "WARNING"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    <span className="font-semibold">
                      {alert.severity as string}
                    </span>
                    : {alert.message as string}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* Card: Datos para validación manual INE */}
        {hasManualValidation && (
          <IneManualValidationCard
            ineValidation={extraction.ineValidation!}
          />
        )}
      </div>
    </div>
  );
}

function IneManualValidationCard({
  ineValidation,
}: {
  ineValidation: IneValidation;
}) {
  const hasCic =
    ineValidation.cic && ineValidation.cic.trim() !== "";
  const hasCitizenId =
    ineValidation.citizenIdentifier &&
    ineValidation.citizenIdentifier.trim() !== "";

  return (
    <Card>
      <h3 className="text-base font-semibold text-gf-text mb-3">
        Datos para validación manual INE
      </h3>
      <p className="text-xs text-gf-text-muted mb-3">
        Copiá estos datos para validarlos manualmente en Lista Nominal del INE.
      </p>

      <dl className="grid grid-cols-1 gap-3">
        <CopyField
          label="CIC"
          value={ineValidation.cic}
          notDetected={!hasCic}
        />
        <CopyField
          label="Identificador del ciudadano"
          value={ineValidation.citizenIdentifier}
          notDetected={!hasCitizenId}
        />
      </dl>

      {/* Alerta si faltan campos */}
      {(!hasCic || !hasCitizenId) && (
        <div className="mt-3 border-t border-gf-border pt-3">
          <p className="text-xs text-red-600">
            {!hasCic && !hasCitizenId
              ? "No se detectaron CIC ni Identificador del ciudadano. Revisión manual requerida."
              : !hasCic
                ? "CIC no detectado. La asesora debe localizarlo manualmente en la credencial."
                : "Identificador del ciudadano no detectado. La asesora debe localizarlo manualmente en la credencial."}
          </p>
        </div>
      )}

      <div className="mt-3">
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          Requiere validación manual en Lista Nominal
        </span>
      </div>
    </Card>
  );
}

function CopyField({
  label,
  value,
  notDetected,
}: {
  label: string;
  value: string | undefined;
  notDetected?: boolean;
}) {
  if (!value || notDetected) {
    return (
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted">
          {label}
        </dt>
        <dd className="mt-1 flex items-center gap-2">
          <span className="text-sm text-gf-text-muted italic">
            No detectado
          </span>
          <CopyButton value="" label="Copiar" disabled />
        </dd>
      </div>
    );
  }

  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted">
        {label}
      </dt>
      <dd className="mt-1 flex items-center gap-2">
        <span className="text-sm text-gf-text font-mono select-all break-all">
          {value}
        </span>
        <CopyButton value={value} />
      </dd>
    </div>
  );
}
