"""Phase 0 spike: dump pdfplumber tables from a bureau PDF.

No Nest, no Gemini. Prints each detected table and flags the amounts
the spike must still get right.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pdfplumber

# Amounts that already pass in the current pipeline. The spike fails
# if a table-aware read loses them.
MUST_KEEP = ("8775", "8,775", "1875", "1,875")

# Amounts that pdfjs placed in the neighboring column. Presence in a
# table cell is only a hint; column assignment is checked by eye in
# this first pass.
WATCH = ("GRIBMA", "SOFOM", "NU MEXICO", "NU MÉXICO", "TELCEL", "SANTANDER", "AMEX")


def main() -> int:
    if len(sys.argv) != 2:
        print("Uso: python extract_tables.py samples/<buro>.pdf", file=sys.stderr)
        return 2

    pdf_path = Path(sys.argv[1])
    if not pdf_path.is_file():
        print(f"No existe el PDF: {pdf_path}", file=sys.stderr)
        return 2

    found_keep: set[str] = set()
    found_watch: set[str] = set()
    table_count = 0

    with pdfplumber.open(pdf_path) as pdf:
        print(f"{pdf_path.name}: {len(pdf.pages)} páginas")
        for index, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables() or []
            print(f"\n--- página {index}: {len(tables)} tablas ---")
            for table_index, table in enumerate(tables, start=1):
                table_count += 1
                print(f"\n[tabla {table_index}] {len(table)} filas")
                for row in table:
                    cells = ["" if cell is None else " ".join(cell.split()) for cell in row]
                    line = " | ".join(cells)
                    print(line)
                    upper = line.upper()
                    for token in MUST_KEEP:
                        if token in line or token in upper:
                            found_keep.add(token)
                    for token in WATCH:
                        if token in upper:
                            found_watch.add(token)

    print("\n=== resumen ===")
    print(f"tablas: {table_count}")
    print(f"montos vistos: {sorted(found_keep) or 'ninguno'}")
    print(f"instituciones vistas: {sorted(found_watch) or 'ninguna'}")
    if table_count == 0:
        print("pdfplumber no detectó tablas. El spike no sigue con este PDF.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
