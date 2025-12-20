import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import GeminiChat, { SparklesIcon } from "~/components/GeminiChat";
import { cn } from "~/utils/cn";
import {
  isOfTypeSupportedExportType,
  parseFile,
  saveToExcel,
  SUPPORTED_EXPORT_TYPES,
  type SupportedExportType,
} from "~/utils/excelUtils";
import type { Route } from "./+types/home";

// --- Icons ---
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

const ResetIcon = ({ className }: { className?: string }) => (
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
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const UndoIcon = ({ className }: { className?: string }) => (
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
      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
    />
  </svg>
);

const RedoIcon = ({ className }: { className?: string }) => (
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
      d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
    />
  </svg>
);

// --- Export Actions Component ---
interface ExportActionsProps<T extends object> {
  data: T[];
  fileName?: string;
  initialFormat?: SupportedExportType;
}

const ExportActions = <T extends object>({
  data,
  fileName = "export",
  initialFormat = "xlsx",
}: ExportActionsProps<T>) => {
  const [format, setFormat] = useState<SupportedExportType>(initialFormat);

  useEffect(() => {
    setFormat(initialFormat);
  }, [initialFormat]);

  if (!data || data.length === 0) return null;

  return (
    <div className="ml-auto flex items-center gap-2">
      <div className="relative">
        <select
          value={format}
          onChange={(e) => {
            const val = e.target.value;
            if (isOfTypeSupportedExportType(val)) setFormat(val);
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
        className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 active:scale-95"
      >
        <DownloadIcon className="h-4 w-4" />
        Download
      </button>
    </div>
  );
};

// --- Main Page ---

type EditingCell = { rowIndex: number; colIndex: number };
type EditSource = "user" | "ai";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Excel Editor" },
    { name: "description", content: "Edit Excel files in React Router" },
  ];
}

const MAX_HISTORY = 10;

export default function Home() {
  const [fileData, setFileData] = useState<unknown[][]>();
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string>();
  const [detectedFormat, setDetectedFormat] =
    useState<SupportedExportType>("xlsx");

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Metadata for highlighting changes
  const [editMetadata, setEditMetadata] = useState<Record<string, EditSource>>(
    {},
  );

  // History State
  type HistoryState = {
    data: unknown[][];
    metadata: Record<string, EditSource>;
  };

  const [history, setHistory] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  // Original pristine copy for "Reset"
  const [originalFileData, setOriginalFileData] = useState<unknown[][] | null>(
    null,
  );

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [tempValue, setTempValue] = useState<string>("");
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  // --- Undo / Redo Logic ---

  const commitToHistory = useCallback(() => {
    if (!fileData) return;

    setHistory((prev) => {
      const newHistory = [...prev, { data: fileData, metadata: editMetadata }];
      // Limit to MAX_HISTORY
      if (newHistory.length > MAX_HISTORY) {
        return newHistory.slice(newHistory.length - MAX_HISTORY);
      }
      return newHistory;
    });
    // Clear future when a new action is taken
    setFuture([]);
  }, [fileData, editMetadata]);

  const handleUndo = useCallback(() => {
    if (history.length === 0 || !fileData) return;

    const previousState = history[history.length - 1];
    const newHistory = history.slice(0, -1);

    // Save current state to future
    setFuture((prev) => [{ data: fileData, metadata: editMetadata }, ...prev]);

    // Restore past state
    setFileData(previousState.data);
    setEditMetadata(previousState.metadata);
    setHistory(newHistory);
  }, [history, fileData, editMetadata]);

  const handleRedo = useCallback(() => {
    if (future.length === 0 || !fileData) return;

    const nextState = future[0];
    const newFuture = future.slice(1);

    // Save current state to history
    setHistory((prev) => [...prev, { data: fileData, metadata: editMetadata }]);

    // Restore future state
    setFileData(nextState.data);
    setEditMetadata(nextState.metadata);
    setFuture(newFuture);
  }, [future, fileData, editMetadata]);

  // --- File Handling ---

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const inputFile = e.target.files[0];
    setError(undefined);
    setEditingCell(null);
    setEditMetadata({});
    setHistory([]);
    setFuture([]);

    try {
      const rawData = await parseFile(inputFile);
      if (rawData.length === 0) {
        setError("The file is empty or has no valid data");
        return;
      }
      setFileData(rawData);
      setOriginalFileData(rawData);
      setFileName(inputFile.name);

      const ext = inputFile.name.split(".").pop()?.toLowerCase();
      if (isOfTypeSupportedExportType(ext)) {
        setDetectedFormat(ext);
      } else {
        setDetectedFormat("xlsx");
      }
    } catch (err) {
      console.error("Error processing file:", err);
      setError(
        "Failed to parse the file. Please ensure it is a valid CSV or Excel file.",
      );
    }
    e.target.value = "";
  };

  const handleResetData = () => {
    if (originalFileData) {
      commitToHistory();
      setFileData(JSON.parse(JSON.stringify(originalFileData)));
      setEditMetadata({});
      setIsResetDialogOpen(false);
    }
  };

  // --- Edit Handling ---

  const updateDataWithMetadata = (
    newData: unknown[][],
    newMetadata: Record<string, EditSource>,
  ) => {
    commitToHistory();
    setFileData(newData);
    setEditMetadata(newMetadata);
  };

  const handleGeminiUpdate = (newData: unknown[][]) => {
    const newMetadata = { ...editMetadata };

    // Diff logic to mark AI edits
    newData.forEach((row, rIndex) => {
      const isNewRow = !fileData || rIndex >= fileData.length;

      row.forEach((cell, cIndex) => {
        if (isNewRow) {
          newMetadata[`${rIndex}-${cIndex}`] = "ai";
          return;
        }
        const oldVal = fileData?.[rIndex]?.[cIndex];
        if (String(cell) !== String(oldVal)) {
          newMetadata[`${rIndex}-${cIndex}`] = "ai";
        }
      });
    });

    updateDataWithMetadata(newData, newMetadata);
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
    if (!editingCell || !fileData) return;
    const { rowIndex, colIndex } = editingCell;
    const newData = [...fileData];
    const newRow = [...(newData[rowIndex] as unknown[])];

    if (String(newRow[colIndex]) !== tempValue) {
      commitToHistory();

      newRow[colIndex] = tempValue;
      newData[rowIndex] = newRow;

      setFileData(newData);
      setEditMetadata((prev) => ({
        ...prev,
        [`${rowIndex}-${colIndex}`]: "user",
      }));
    }
    setEditingCell(null);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setTempValue("");
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") saveEdit();
    else if (e.key === "Escape") cancelEdit();
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

  const getCellHighlightClass = (rowIndex: number, colIndex: number) => {
    const source = editMetadata[`${rowIndex}-${colIndex}`];
    if (source === "user")
      return "bg-blue-900/40 text-blue-100 ring-1 ring-inset ring-blue-500/50";
    if (source === "ai")
      return "bg-purple-900/40 text-purple-100 ring-1 ring-inset ring-purple-500/50";
    return "";
  };

  const hasEdits = Object.keys(editMetadata).length > 0;
  const canUndo = history.length > 0;
  const canRedo = future.length > 0;

  return (
    <div className="flex h-screen w-full flex-col gap-4 bg-slate-900 p-6 text-slate-200">
      {/* 1. Header Section */}
      <div className="flex shrink-0 items-center gap-4 border-b border-slate-700 pb-4">
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

        {/* Undo / Redo Buttons */}
        {fileData && (
          <div className="mx-2 flex items-center gap-1 border-r border-l border-slate-700 px-4">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className={cn(
                "rounded p-2 transition-colors hover:bg-slate-800",
                !canUndo
                  ? "cursor-not-allowed opacity-30"
                  : "cursor-pointer text-slate-300 hover:text-white",
              )}
              title="Undo"
            >
              <UndoIcon className="h-4 w-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className={cn(
                "rounded p-2 transition-colors hover:bg-slate-800",
                !canRedo
                  ? "cursor-not-allowed opacity-30"
                  : "cursor-pointer text-slate-300 hover:text-white",
              )}
              title="Redo"
            >
              <RedoIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Reset Button */}
        {fileData && (
          <button
            onClick={() => setIsResetDialogOpen(true)}
            disabled={!hasEdits}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              hasEdits
                ? "cursor-pointer border-red-900/50 bg-red-900/20 text-red-400 hover:bg-red-900/40 hover:text-red-300"
                : "cursor-not-allowed border-slate-700 bg-slate-800 text-slate-500 opacity-50",
            )}
            title="Reset to original file data"
          >
            <ResetIcon className="h-4 w-4" />
            Reset
          </button>
        )}

        {/* Legend */}
        {hasEdits && (
          <div className="ml-2 flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded-sm bg-blue-900/60 ring-1 ring-blue-500"></div>
              <span className="text-blue-200">You</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded-sm bg-purple-900/60 ring-1 ring-purple-500"></div>
              <span className="text-purple-200">Gemini</span>
            </div>
          </div>
        )}

        {!!error && (
          <div className="ml-2 font-medium whitespace-nowrap text-red-400">
            {error}
          </div>
        )}
        {fileData && (
          <ExportActions
            data={exportData}
            fileName={fileName || "edited_data"}
            initialFormat={detectedFormat}
          />
        )}
      </div>

      {/* 2. Main Content */}
      <div className="relative flex flex-1 gap-6 overflow-hidden">
        {/* Left Side: Data Table */}
        <div className="flex min-w-0 flex-1 flex-col transition-all duration-300">
          {fileData ? (
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
                        const highlight = getCellHighlightClass(
                          rowIndex,
                          colIndex,
                        );

                        return (
                          <th
                            key={colIndex}
                            onDoubleClick={() =>
                              startEditing(rowIndex, colIndex, header)
                            }
                            className={cn(
                              "cursor-pointer border-b border-slate-700 px-6 py-3 tracking-wider whitespace-nowrap hover:bg-slate-800",
                              !highlight &&
                                (colIndex % 2 === 0
                                  ? "bg-slate-900"
                                  : "bg-slate-800"),
                              highlight,
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
                                onKeyDown={handleInputKeyDown}
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
                        <tr key={rowIndex}>
                          {[...row].map((cell, colIndex) => {
                            const isEditing =
                              editingCell?.rowIndex === rowIndex &&
                              editingCell?.colIndex === colIndex;
                            const cellContent = String(cell ?? "");
                            const isEmpty = cellContent.trim() === "";
                            const highlight = getCellHighlightClass(
                              rowIndex,
                              colIndex,
                            );

                            return (
                              <td
                                key={colIndex}
                                onDoubleClick={() =>
                                  startEditing(rowIndex, colIndex, cell)
                                }
                                className={cn(
                                  "relative min-w-25 cursor-pointer px-6 py-4 font-medium whitespace-nowrap text-slate-300",
                                  !highlight &&
                                    (colIndex % 2 !== 0
                                      ? "bg-slate-700/20"
                                      : ""),
                                  highlight,
                                  "transition-colors",
                                  isEditing && "p-0",
                                )}
                              >
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    type="text"
                                    value={tempValue}
                                    onChange={(e) =>
                                      setTempValue(e.target.value)
                                    }
                                    onBlur={saveEdit}
                                    onKeyDown={handleInputKeyDown}
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
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-800/50">
              <span className="text-slate-500">Upload a file to view data</span>
            </div>
          )}
        </div>

        {/* Right Side: Gemini Chat */}
        {/* We keep the component mounted but hidden when closed to preserve state */}
        <div
          className={cn(
            "w-[20%] min-w-[320px] transition-all duration-300",
            isChatOpen ? "opacity-100" : "hidden opacity-0",
          )}
        >
          <GeminiChat
            data={fileData}
            onDataUpdate={handleGeminiUpdate}
            onClose={() => setIsChatOpen(false)}
          />
        </div>
      </div>

      {/* Floating Chat Button (When closed) */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed right-8 bottom-8 z-50 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-200 shadow-xl transition-all hover:-translate-y-1 hover:bg-slate-700 hover:text-white hover:shadow-2xl"
        >
          <SparklesIcon className="h-6 w-6 text-purple-400" />
        </button>
      )}

      {/* --- Reset Confirmation Dialog --- */}
      {isResetDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100">Reset Data?</h3>
            <p className="mt-2 text-sm text-slate-400">
              Are you sure you want to revert to the original file? <br />
              <span className="text-red-400">
                All changes made by you and Gemini will be lost.
              </span>
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsResetDialogOpen(false)}
                className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleResetData}
                className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
