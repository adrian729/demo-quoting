import * as XLSX from "xlsx";

export function cleanupData(data: (unknown[] | undefined | null)[]) {
  return data
    .filter((row) => row != null)
    .filter(
      (row) =>
        Array.isArray(row) && row.length > 0 && row.some((cell) => !!cell)
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
