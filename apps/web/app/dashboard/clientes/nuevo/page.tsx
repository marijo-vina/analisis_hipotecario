import ClientForm from "@/app/ui/client-form";

/**
 * New client page — thin server-component wrapper around the ClientForm.
 *
 * The form itself is a client component because it uses `useActionState`.
 */
export default function NuevoClientePage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">
        Nuevo cliente
      </h2>
      <ClientForm />
    </div>
  );
}
