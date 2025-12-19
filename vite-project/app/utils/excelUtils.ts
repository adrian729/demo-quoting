import * as XLSX from "xlsx";

export function cleanupData(data: (unknown[] | undefined | null)[]) {
  return data
    .filter((row) => row != null)
    .filter(
      (row) =>
        Array.isArray(row) && row.length > 0 && row.some((cell) => !!cell),
    );
}

export async function parseFile(file: File): Promise<unknown[][]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);

  const worksheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[worksheetName];

  const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
  });

  return cleanupData(jsonData);
}

export type ExportFileType = "xlsx" | "csv";

export const saveToExcel = <T extends object>(
  data: T[],
  fileName: string,
  format: ExportFileType,
): void => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  const nameWithoutExtension = fileName.replace(/\.(xlsx|csv)$/, "");
  const finalFileName = `${nameWithoutExtension}.${format}`;
  XLSX.writeFile(workbook, finalFileName);
};
