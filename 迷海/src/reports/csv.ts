export type CsvScalar = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvScalar>;

function escapeCsvCell(value: CsvScalar): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function rowsToCsv(rows: readonly CsvRow[], columns?: readonly string[]): string {
  const headers =
    columns ??
    [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

export function flattenObject(
  value: Record<string, unknown>,
  prefix = "",
): CsvRow {
  const row: CsvRow = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const flatKey = prefix.length > 0 ? `${prefix}.${key}` : key;
    if (
      nestedValue !== null &&
      typeof nestedValue === "object" &&
      !Array.isArray(nestedValue)
    ) {
      Object.assign(row, flattenObject(nestedValue as Record<string, unknown>, flatKey));
    } else if (Array.isArray(nestedValue)) {
      row[flatKey] = JSON.stringify(nestedValue);
    } else {
      row[flatKey] = nestedValue as CsvScalar;
    }
  }
  return row;
}
