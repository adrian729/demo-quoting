import {
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "~/utils/cn";
import { parseFile, saveToExcel } from "~/utils/excelUtils";
import type { Route } from "./+types/home";

const CsvIcon = ({ className }: { className?: string }) => {
  return (
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
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
};

const XlsxIcon = ({ className }: { className?: string }) => {
  return (
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
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
      />
    </svg>
  );
};

interface ExportButtonProps {
  onClick: () => void;
  label: string;
  icon: ReactNode;
  colorClass: string;
}

const ExportButton = ({
  onClick,
  label,
  icon,
  colorClass,
}: ExportButtonProps) => {
  return (
    <button
      onClick={onClick}
      title={`Download as ${label}`}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-xs font-bold text-white shadow-sm transition-all active:scale-95",
        colorClass,
      )}
    >
      {icon}
      {label}
    </button>
  );
};

interface ExportActionsProps<T extends object> {
  data: T[];
  fileName?: string;
}

type ExportTypeInfo = {
  type: "csv" | "xlsx";
  label: string;
  icon: ReactNode;
  colorClass: string;
};

const exportTypeInfos: ExportTypeInfo[] = [
  {
    type: "csv" as const,
    label: "CSV",
    icon: <CsvIcon className="h-4 w-4" />,
    colorClass: "bg-blue-600 hover:bg-blue-500",
  },
  {
    type: "xlsx" as const,
    label: "Excel",
    icon: <XlsxIcon className="h-4 w-4" />,
    colorClass: "bg-emerald-600 hover:bg-emerald-500",
  },
];

const ExportActions = <T extends object>({
  data,
  fileName = "export",
}: ExportActionsProps<T>) => {
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      <span className="mr-1 text-xs font-semibold tracking-wider text-slate-400 uppercase">
        Download:
      </span>
      {exportTypeInfos.map(({ type, label, icon, colorClass }) => (
        <ExportButton
          key={type}
          label={label}
          icon={icon}
          colorClass={colorClass}
          onClick={() => saveToExcel(data, fileName, type)}
        />
      ))}
    </div>
  );
};

// --- 4. Main Home Page ---

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

  // Transform Array-of-Arrays into Array-of-Objects for the export utility
  const exportData = bodyRows.map((row) => {
    const rowObj: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      rowObj[String(header)] = row[index];
    });
    return rowObj;
  });

  return (
    <div className="flex h-screen w-full flex-col gap-6 bg-slate-800 p-8 text-slate-200">
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

        {/* --- Export Components Usage --- */}
        {fileData && (
          <ExportActions
            data={exportData}
            fileName={fileName || "edited_data"}
          />
        )}
      </div>

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
                          "border-b border-slate-700 bg-slate-900",
                          "cursor-pointer hover:bg-slate-800",
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

                        return (
                          <td
                            key={colIndex}
                            onDoubleClick={() =>
                              startEditing(rowIndex, colIndex, cell)
                            }
                            className={cn(
                              "min-w-25 cursor-pointer px-6 py-4 font-medium whitespace-nowrap text-slate-300",
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
                              String(cell ?? "")
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
