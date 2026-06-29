"use client";

import { useEffect } from "react";

/**
 * ExpedienteDetailLayout — oculta el topbar global y quita el
 * padding del main heredado para una vista de workspace compacta.
 *
 * El AppShell padre envuelve sidebar + topbar + main. Este layout
 * se ejecuta como hijo del main. Para ocultar el topbar usamos
 * manipulación del DOM (el elemento se marca con data-topbar).
 */
export default function ExpedienteDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const topbar = document.querySelector<HTMLElement>("[data-topbar]");
    const main = document.querySelector<HTMLElement>("main");

    if (topbar) {
      topbar.style.display = "none";
      // Compensar la altura del topbar en el main
      if (main) main.style.paddingBlockStart = "0";
    }

    return () => {
      if (topbar) topbar.style.display = "";
      if (main) main.style.paddingBlockStart = "";
    };
  }, []);

  return <>{children}</>;
}
