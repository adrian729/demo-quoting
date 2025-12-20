import { useState, type ChangeEvent, type KeyboardEvent } from "react";
import GeminiChat from "~/components/GeminiChat"; // <--- Imported here
import { cn } from "~/utils/cn";
import {
  isOfTypeSupportedExportType,
  parseFile,
  saveToExcel,
  SUPPORTED_EXPORT_TYPES,
  type SupportedExportType,
} from "~/utils/excelUtils";
import type { Route } from "./+types/home";

// --- 1. Icon Component ---

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);

// --- 2. Export Actions Component ---

interface ExportActionsProps<T extends object> {
  data: T[];
  fileName?: string;
}

const ExportActions = <T extends object>({
  data,
  fileName = "export",
}: ExportActionsProps<T>) => {
  const [format, setFormat] = useState<SupportedExportType>("xlsx");

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      <div className="relative">
        <select
          value={format}
          onChange={(e) => {
            const val = e.target.value;
            if (isOfTypeSupportedExportType(val)) {
              setFormat(val);
            }
          }}
          className="cursor-pointer appearance-none rounded-lg border border-slate-600 bg-slate-700 py-2 pr-8 pl-3 text-sm font-medium text-slate-200 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          {SUPPORTED_EXPORT_TYPES.map((option) => (
            <option key={option} value={option}>
              {option.toUpperCase()}
            </option>
          ))}
        </select>

        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
          <svg
            className="h-4 w-4 fill-current"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
          >
            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
          </svg>
        </div>
      </div>

      <button
        onClick={() => saveToExcel(data, fileName, format)}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 active:scale-95"
      >
        <DownloadIcon className="h-4 w-4" />
        Download
      </button>
    </div>
  );
};

// --- 3. Main Home Page ---

type EditingCell = {
  rowIndex: number;
  colIndex: number;
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Excel Editor" },
    { name: "description", content: "Edit Excel files in React Router" },
  ];
}

export default function Home() {
  const [fileData, setFileData] = useState<unknown[][]>();
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string>();

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [tempValue, setTempValue] = useState<string>("");

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    const inputFile = e.target.files[0];
    setError(undefined);
    setEditingCell(null);

    try {
      const rawData = await parseFile(inputFile);
      if (rawData.length === 0) {
        setError("The file is empty or has no valid data");
        return;
      }
      setFileData(rawData);
      setFileName(inputFile.name);
    } catch (err) {
      console.error("Error processing file:", err);
      setError(
        "Failed to parse the file. Please ensure it is a valid CSV or Excel file.",
      );
    }

    e.target.value = "";
  };

  const startEditing = (
    rowIndex: number,
    colIndex: number,
    currentValue: unknown,
  ) => {
    setEditingCell({ rowIndex, colIndex });
    setTempValue(String(currentValue ?? ""));
  };

  const saveEdit = () => {
    if (!editingCell || !fileData) {
      return;
    }

    const { rowIndex, colIndex } = editingCell;
    const newData = [...fileData];
    const newRow = [...(newData[rowIndex] as unknown[])];

    newRow[colIndex] = tempValue;
    newData[rowIndex] = newRow;

    setFileData(newData);
    setEditingCell(null);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setTempValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  const headers = fileData?.[0] || [];
  const bodyRows = fileData?.slice(1) || [];

  const exportData = bodyRows.map((row) => {
    const rowObj: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      rowObj[String(header)] = row[index];
    });
    return rowObj;
  });

  return (
    <div className="flex h-screen w-full flex-col gap-6 bg-slate-900 p-8 text-slate-200">
      {/* Upload & Export Section */}
      <div className="flex items-center gap-4">
        <span className="font-semibold text-slate-300">Upload File</span>

        <label
          className={cn(
            "flex min-w-35 items-center justify-center px-4 py-2",
            "border border-slate-600 bg-slate-700 hover:bg-slate-600",
            "cursor-pointer rounded-lg transition-colors",
            "text-sm font-semibold text-white",
          )}
        >
          {fileName || "Choose File..."}
          <input
            type="file"
            accept=".csv,.xls,.xlsx,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        {!!error && (
          <div className="font-medium whitespace-nowrap text-red-400">
            {error}
          </div>
        )}

        {fileData && (
          <ExportActions
            data={exportData}
            fileName={fileName || "edited_data"}
          />
        )}
      </div>

      {/* --- Added GeminiChat Component here --- */}
      <GeminiChat />

      {fileData && (
        <div className="flex-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-lg">
          <div className="h-full overflow-auto">
            <table className="w-full border-collapse text-left text-sm text-slate-400">
              <thead className="sticky top-0 z-10 bg-slate-900 text-xs font-bold text-slate-200 shadow-sm">
                <tr>
                  {[...headers].map((header, colIndex) => {
                    const rowIndex = 0;
                    const isEditing =
                      editingCell?.rowIndex === rowIndex &&
                      editingCell?.colIndex === colIndex;

                    return (
                      <th
                        key={colIndex}
                        onDoubleClick={() =>
                          startEditing(rowIndex, colIndex, header)
                        }
                        className={cn(
                          "px-6 py-3 tracking-wider whitespace-nowrap",
                          "border-b border-slate-700",
                          "cursor-pointer hover:bg-slate-800",
                          colIndex % 2 === 0 ? "bg-slate-900" : "bg-slate-800",
                          isEditing && "p-0",
                        )}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            type="text"
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={handleKeyDown}
                            className="h-full w-full rounded border-2 border-blue-500 bg-slate-700 px-2 py-1 text-xs font-bold text-white outline-none"
                          />
                        ) : (
                          String(header ?? "")
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {bodyRows.map((row, rIndex) => {
                  const rowIndex = rIndex + 1;
                  return (
                    <tr
                      key={rowIndex}
                      className="transition-colors hover:bg-slate-700/50"
                    >
                      {[...row].map((cell, colIndex) => {
                        const isEditing =
                          editingCell?.rowIndex === rowIndex &&
                          editingCell?.colIndex === colIndex;

                        const cellContent = String(cell ?? "");
                        const isEmpty = cellContent.trim() === "";

                        return (
                          <td
                            key={colIndex}
                            onDoubleClick={() =>
                              startEditing(rowIndex, colIndex, cell)
                            }
                            className={cn(
                              "relative min-w-25 cursor-pointer px-6 py-4 font-medium whitespace-nowrap text-slate-300",
                              colIndex % 2 !== 0 && "bg-slate-700/20",
                              isEditing && "p-0",
                            )}
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                type="text"
                                value={tempValue}
                                onChange={(e) => setTempValue(e.target.value)}
                                onBlur={saveEdit}
                                onKeyDown={handleKeyDown}
                                className="h-full w-full rounded border-2 border-blue-500 bg-slate-600 px-2 py-1.5 text-white outline-none"
                              />
                            ) : (
                              <>
                                {isEmpty && (
                                  <span className="absolute top-1 left-1 text-[10px] leading-none text-slate-400 italic opacity-60 select-none">
                                    Empty
                                  </span>
                                )}
                                {cellContent}
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
