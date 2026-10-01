"use client";

import Drawer from "@/app/ui/common/drawer";

interface ClientDrawerClient {
  fullName: string;
  rfc: string;
  curp?: string;
  email: string;
  phone: string;
  personType?: string;
}

interface ClientDrawerProps {
  open: boolean;
  onClose: () => void;
  client: ClientDrawerClient | null;
}

const PERSON_TYPE_LABELS: Record<string, string> = {
  SALARIED: "Asalariado",
  PFAE: "Persona Física con Actividad Empresarial (PFAE)",
};

function personTypeLabel(code?: string): string {
  if (!code) return "—";
  return PERSON_TYPE_LABELS[code] ?? code;
}

/**
 * ClientDrawer — panel lateral con la información del cliente asociado.
 *
 * Envuelve el Drawer reutilizable. Si `client` es null muestra un mensaje de
 * no disponible; en caso contrario despliega secciones manuales con labels
 * pequeños y valores en font-medium, organizados por "Datos personales" y
 * "Contacto".
 */
export default function ClientDrawer({ open, onClose, client }: ClientDrawerProps) {
  const title = client ? `Cliente: ${client.fullName}` : "Cliente";

  if (!client) {
    return (
      <Drawer open={open} onClose={onClose} title={title}>
        <p className="text-sm text-gf-text-muted">
          No se pudo cargar la información del cliente.
        </p>
      </Drawer>
    );
  }

  return (
    <Drawer open={open} onClose={onClose} title={title}>
      <div className="space-y-6">
        {/* ── Datos personales ─────────────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-3">
            Datos personales
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-xs text-gf-text-muted">Nombre</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5">
                {client.fullName}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gf-text-muted">RFC</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5 font-mono">
                {client.rfc || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gf-text-muted">CURP</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5 font-mono">
                {client.curp || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gf-text-muted">Tipo persona</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5">
                {personTypeLabel(client.personType)}
              </dd>
            </div>
          </dl>
        </section>

        {/* ── Contacto ─────────────────────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-3">
            Contacto
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-xs text-gf-text-muted">Correo</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5 break-all">
                {client.email || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gf-text-muted">Teléfono</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5">
                {client.phone || "—"}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </Drawer>
  );
}
