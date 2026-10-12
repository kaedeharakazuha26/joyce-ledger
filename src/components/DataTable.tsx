import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

interface DataTableProps<T extends { id: number }> {
  idPrefix: string;
  columns: Column<T>[];
  rows: T[];
  editingId?: number | null;
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  footer?: ReactNode;
}

const alignClass = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

export function DataTable<T extends { id: number }>({ idPrefix, columns, rows, editingId, onEdit, onDelete, footer }: DataTableProps<T>) {
  return (
    <div className="overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-base">
        <thead className="sticky top-0 z-10">
          <tr>
            {columns.map((c) => (
              <th
                key={c.header}
                className={`border-b border-slate-200 bg-slate-50/95 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 ${alignClass(c.align)}`}
              >
                {c.header}
              </th>
            ))}
            <th className="w-44 border-b border-slate-200 bg-slate-50/95 px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/95">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const editing = row.id === editingId;
            return (
              <tr
                key={row.id}
                className={`group transition-colors ${editing ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}`}
              >
                {columns.map((c) => (
                  <td key={c.header} className={`border-b border-slate-100 px-5 py-3.5 dark:border-slate-800/70 ${alignClass(c.align)} ${c.className ?? ""}`}>
                    {c.render(row)}
                  </td>
                ))}
                <td className="border-b border-slate-100 px-5 py-2 text-right dark:border-slate-800/70">
                  <div className="inline-flex gap-2">
                    <button id={`${idPrefix}-edit-${row.id}`} type="button" className="btn-secondary btn-sm" onClick={() => onEdit(row)}>
                      Edit
                    </button>
                    <button
                      id={`${idPrefix}-delete-${row.id}`}
                      type="button"
                      className="btn btn-sm border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-900 dark:hover:bg-rose-950"
                      onClick={() => onDelete(row)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}
