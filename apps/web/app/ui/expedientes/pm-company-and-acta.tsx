import { parseArticlesDocument } from "@/app/lib/articles-view";
import type { Document } from "@/app/lib/definitions";
import {
  companyIdentity,
  pmActaHeadline,
  type IdentityStatus,
} from "@/app/lib/pm-expediente-view";
import Card from "@/app/ui/common/card";

const STATUS_LABEL: Record<IdentityStatus, string> = {
  MATCH: "Coincide",
  MISMATCH: "No coincide",
  INCOMPLETE: "Falta un dato",
};

export default function PmCompanyAndActa({
  documents,
}: {
  documents: Document[];
}) {
  const articles = documents
    .map((doc) => parseArticlesDocument(doc))
    .filter((doc) => doc != null);
  const acta = pmActaHeadline(articles);
  const company = companyIdentity(documents);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-gf-text mb-3">
          Identidad de la empresa
        </h3>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-white/60">
                  {["Campo", "Constancia", "Buró", "Acta", "Estados", "Resultado"].map((label) => (
                    <th
                      key={label}
                      className="text-left px-3 py-2 text-xs font-semibold text-gf-text uppercase border-b border-gf-border/60"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <IdentityRow
                  field="Razón social"
                  cells={[
                    company.legalName.csf,
                    company.legalName.bureau,
                    company.legalName.acta,
                    company.legalName.statements,
                  ]}
                  status={company.nameStatus}
                />
                <IdentityRow
                  field="RFC"
                  cells={[
                    company.rfc.csf,
                    company.rfc.bureau,
                    company.rfc.acta,
                    company.rfc.statements,
                  ]}
                  status={company.rfcStatus}
                />
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gf-text mb-3">Acta</h3>
        <Card>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Fact label="Acciones del solicitante" value={acta.shareLabel} />
            <Fact label="Constitución" value={acta.incorporationLabel} />
            <Fact label="Ingreso del socio" value={acta.entryLabel} />
            <Fact label="Escritura" value={acta.deedLabel} />
          </dl>
          <p className="mt-3 text-[11px] text-gf-text-muted">{acta.note}</p>
        </Card>
      </section>
    </div>
  );
}

function IdentityRow({
  field,
  cells,
  status,
}: {
  field: string;
  cells: Array<string | null>;
  status: IdentityStatus;
}) {
  return (
    <tr className="border-b border-gf-border/40">
      <td className="px-3 py-2 text-xs font-semibold text-gf-text">{field}</td>
      {cells.map((cell, index) => (
        <td key={`${field}-${index}`} className="px-3 py-2 text-xs text-gf-text">
          {cell ?? "—"}
        </td>
      ))}
      <td className="px-3 py-2 text-xs text-gf-text">{STATUS_LABEL[status]}</td>
    </tr>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-gf-text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-gf-text">{value}</dd>
    </div>
  );
}
