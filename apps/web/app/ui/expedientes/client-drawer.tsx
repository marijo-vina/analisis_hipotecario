"use client";

import Drawer from "@/app/ui/common/drawer";
import FieldGrid, { type FieldGridField } from "@/app/ui/common/field-grid";

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
};

function personTypeLabel(code?: string): string | undefined {
  if (!code) return undefined;
  return PERSON_TYPE_LABELS[code] ?? code;
}

/**
 * ClientDrawer — panel lateral con la información del cliente asociado.
 *
 * Envuelve el Drawer reutilizable. Si `client` es null muestra un mensaje de
 * carga no disponible; en caso contrario despliega un FieldGrid con todos los
 * campos disponibles. FieldGrid ya renderiza "—" para los valores vacíos.
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

  const fields: FieldGridField[] = [
    { label: "Nombre", value: client.fullName || undefined },
    { label: "RFC", value: client.rfc || undefined },
    { label: "CURP", value: client.curp || undefined },
    { label: "Tipo persona", value: personTypeLabel(client.personType) },
    { label: "Correo", value: client.email || undefined },
    { label: "Teléfono", value: client.phone || undefined },
  ];

  return (
    <Drawer open={open} onClose={onClose} title={title}>
      <FieldGrid fields={fields} />
    </Drawer>
  );
}