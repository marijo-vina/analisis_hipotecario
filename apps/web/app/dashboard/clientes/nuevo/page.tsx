import PageHeader from "@/app/ui/common/page-header";
import ClientForm from "@/app/ui/client-form";

/**
 * New client page — thin server-component wrapper around the ClientForm.
 *
 * The form itself is a client component because it uses `useActionState`.
 */
export default function NuevoClientePage() {
  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Clientes", href: "/dashboard/clientes" },
          { label: "Nuevo cliente" },
        ]}
        title="Nuevo cliente"
      />
      <ClientForm />
    </div>
  );
}
