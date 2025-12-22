import type { BookType } from "xlsx";
import * as XLSX from "xlsx";

function isRowEmpty(row: unknown[]): boolean {
  return row.every((cell) => cell == null || cell === "");
}

function isColumnEmpty(data: unknown[][], colIndex: number): boolean {
  return data.every((row) => row[colIndex] == null || row[colIndex] === "");
}

function removeColumn(data: unknown[][], colIndex: number): unknown[][] {
  return data.map((row) => {
    const newRow = [...row];
    newRow.splice(colIndex, 1);
    return newRow;
  });
}

export function cleanupData(data: (unknown[] | undefined | null)[]) {
  // 1. Remove empty rows first
  let cleanData = data
    .filter((row) => row != null)
    .filter((row) => !isRowEmpty(row));

  if (cleanData.length === 0) return [];

  // 2. Remove empty columns (Iterating BACKWARDS)
  const rowLength = cleanData[0]?.length || 0;
  for (let i = rowLength - 1; i >= 0; i--) {
    if (isColumnEmpty(cleanData, i)) {
      cleanData = removeColumn(cleanData, i);
    }
  }

  return cleanData;
}

export async function parseFile(file: File): Promise<unknown[][]> {
  const arrayBuffer = await file.arrayBuffer();
  let workbook;

  // FIX: Check for ALL text-based formats that might have encoding issues
  const isTextFormat = file.name.match(/\.(csv|txt|html|htm)$/i);

  if (isTextFormat) {
    // Force UTF-8 decoding for text formats
    const textDecoder = new TextDecoder("utf-8");
    const textData = textDecoder.decode(arrayBuffer);
    workbook = XLSX.read(textData, { type: "string" });
  } else {
    // For binary files (xlsx, xls, ods, numbers), read the buffer directly
    workbook = XLSX.read(arrayBuffer);
  }

  const worksheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[worksheetName];

  const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  return cleanupData(jsonData);
}

export const SUPPORTED_EXPORT_TYPES: BookType[] = [
  "xlsx",
  "xls",
  "xlml",
  "ods",
  "csv",
  "txt",
  "html",
  "numbers",
];

export type SupportedExportType = (typeof SUPPORTED_EXPORT_TYPES)[number];

export const isOfTypeSupportedExportType = (
  value: unknown,
): value is SupportedExportType => {
  return (
    typeof value === "string" &&
    SUPPORTED_EXPORT_TYPES.includes(value as BookType)
  );
};

export const saveToExcel = (
  data: unknown[][],
  fileName: string,
  format: SupportedExportType,
): void => {
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  const nameWithoutExtension = fileName.replace(/\.(xlsx|csv|xls)$/, "");
  const finalFileName = `${nameWithoutExtension}.${format}`;
  XLSX.writeFile(workbook, finalFileName);
};
