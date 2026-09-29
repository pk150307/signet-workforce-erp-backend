export interface ExportColumnDef {
  key: string;
  label: string;
}

export function parseExportColumnQuery(raw: unknown): string[] | undefined {
  if (raw == null || raw === '') return undefined;
  const values = Array.isArray(raw)
    ? raw.flatMap((value) => String(value).split(','))
    : String(raw).split(',');
  const parsed = values.map((value) => value.trim()).filter(Boolean);
  return parsed.length ? parsed : undefined;
}

export function resolveExportColumns<T extends { key: string }>(
  catalog: readonly T[],
  requested?: string[] | null,
): T[] {
  const allowed = new Set(catalog.map((column) => column.key));
  const selected = (requested ?? [])
    .map((key) => key.trim())
    .filter((key) => allowed.has(key));
  if (!selected.length) return [...catalog];
  const keys = new Set(selected);
  return catalog.filter((column) => keys.has(column.key));
}

export function applyExportColumnSelection<T extends ExportColumnDef>(
  catalog: readonly T[],
  requested: string[] | undefined,
  rows: Array<Array<string | number | null | undefined>>,
  omitLabels: readonly string[] = [],
): {
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
  omitHeaders: string[];
} {
  const selected = resolveExportColumns(catalog, requested);
  const indexByKey = new Map(catalog.map((column, index) => [column.key, index]));
  const headers = selected.map((column) => column.label);
  const omitSet = new Set(omitLabels);
  return {
    headers,
    rows: rows.map((row) => selected.map((column) => row[indexByKey.get(column.key)!])),
    omitHeaders: headers.filter((header) => omitSet.has(header)),
  };
}
