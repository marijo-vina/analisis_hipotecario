import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  emptyMessage: string;
  onRowClick?: (row: T, index: number) => void;
}

/**
 * Presentational DataTable server component.
 *
 * Renders a table with column headers, row hover states, and an
 * empty-state message centered across all columns when `rows` is empty.
 * The table is wrapped in `overflow-x-auto` for internal horizontal
 * scroll — never global page scroll.
 *
 * Column access: uses `key` to read data from each row. Falls back to
 * `String(value)` for the default cell. Pass a `render` function for
 * custom cell rendering (e.g. StatusBadge, links, formatted dates).
 */
export default function DataTable<T>({
  columns,
  rows,
  emptyMessage,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-gf-border">
      <table className="w-full min-w-[600px] text-sm text-gf-text">
        <thead>
          <tr className="border-b border-gf-border bg-gf-bg/50">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="px-4 py-3 text-left font-semibold text-gf-text whitespace-nowrap"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-gf-text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={`border-b border-gf-border last:border-b-0 hover:bg-gf-red-soft/30 transition-colors duration-150${onRowClick ? " cursor-pointer" : ""}`}
                onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 whitespace-nowrap">
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
