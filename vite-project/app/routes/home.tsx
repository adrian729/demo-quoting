import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import ExportActions from "~/components/ExportActions";
import GeminiChat from "~/components/GeminiChat";
import {
  PaperClipIcon,
  RedoIcon,
  ResetIcon,
  SparklesIcon,
  UndoIcon,
  XIcon,
} from "~/components/icons";
import { cn } from "~/utils/cn";
import {
  isOfTypeSupportedExportType,
  parseFile,
  saveToExcel,
  SUPPORTED_EXPORT_TYPES,
  type SupportedExportType,
} from "~/utils/excelUtils";
import type { Route } from "./+types/home";

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
const ACCEPTED_FILE_TYPES = SUPPORTED_EXPORT_TYPES.map((t) => `.${t}`).join(
  ",",
);

// Palette for reference files
const FILE_COLOR_VARIANTS = [
  "border-amber-700/50 bg-amber-900/40 text-amber-100 hover:bg-amber-900/60",
  "border-emerald-700/50 bg-emerald-900/40 text-emerald-100 hover:bg-emerald-900/60",
  "border-rose-700/50 bg-rose-900/40 text-rose-100 hover:bg-rose-900/60",
  "border-sky-700/50 bg-sky-900/40 text-sky-100 hover:bg-sky-900/60",
  "border-violet-700/50 bg-violet-900/40 text-violet-100 hover:bg-violet-900/60",
  "border-fuchsia-700/50 bg-fuchsia-900/40 text-fuchsia-100 hover:bg-fuchsia-900/60",
];

export default function Home() {
  // --- Main Data State ---
  const [fileData, setFileData] = useState<unknown[][]>();
  const [fileName, setFileName] = useState<string>("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [detectedFormat, setDetectedFormat] =
    useState<SupportedExportType>("xlsx");

  // --- Extra Files State ---
  const [extraFiles, setExtraFiles] = useState<File[]>([]);

  // --- Chat & UI State ---
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [editMetadata, setEditMetadata] = useState<Record<string, EditSource>>(
    {},
  );
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [tempValue, setTempValue] = useState<string>("");
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  // --- History State ---
  type HistoryState = {
    data: unknown[][];
    metadata: Record<string, EditSource>;
  };
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  const [originalFileData, setOriginalFileData] = useState<unknown[][] | null>(
    null,
  );

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (fileData && fileData.length > 0) {
          saveToExcel(fileData, fileName || "data", detectedFormat);
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [fileData, fileName, detectedFormat]);

  // --- Undo / Redo Logic ---
  const commitToHistory = useCallback(() => {
    if (!fileData) return;
    setHistory((prev) => {
      const newHistory = [...prev, { data: fileData, metadata: editMetadata }];
      if (newHistory.length > MAX_HISTORY) {
        return newHistory.slice(newHistory.length - MAX_HISTORY);
      }
      return newHistory;
    });
    setFuture([]);
  }, [fileData, editMetadata]);

  const handleUndo = useCallback(() => {
    if (history.length === 0 || !fileData) return;
    const previousState = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    setFuture((prev) => [{ data: fileData, metadata: editMetadata }, ...prev]);
    setFileData(previousState.data);
    setEditMetadata(previousState.metadata);
    setHistory(newHistory);
  }, [history, fileData, editMetadata]);

  const handleRedo = useCallback(() => {
    if (future.length === 0 || !fileData) return;
    const nextState = future[0];
    const newFuture = future.slice(1);
    setHistory((prev) => [...prev, { data: fileData, metadata: editMetadata }]);
    setFileData(nextState.data);
    setEditMetadata(nextState.metadata);
    setFuture(newFuture);
  }, [future, fileData, editMetadata]);

  // --- Main File Handling ---
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const inputFile = e.target.files[0];

    setError(undefined);
    setEditingCell(null);
    setEditMetadata({});
    setHistory([]);
    setFuture([]);
    setExtraFiles([]); // Clear references on new main file load

    try {
      const rawData = await parseFile(inputFile);
      if (rawData.length === 0) {
        setError("The file is empty or has no valid data");
        return;
      }

      const lastDotIndex = inputFile.name.lastIndexOf(".");
      const nameWithoutExt =
        lastDotIndex !== -1
          ? inputFile.name.substring(0, lastDotIndex)
          : inputFile.name;
      const ext =
        lastDotIndex !== -1
          ? inputFile.name.substring(lastDotIndex + 1).toLowerCase()
          : "";

      setFileData(rawData);
      setOriginalFileData(rawData);
      setUploadedFileName(inputFile.name);
      setFileName(nameWithoutExt);

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

  // --- Extra Files Handling ---
  const handleAddExtraFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const newFiles = Array.from(e.target.files);
    setExtraFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeExtraFile = (indexToRemove: number) => {
    setExtraFiles((prev) => prev.filter((_, i) => i !== indexToRemove));
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
      <div className="flex shrink-0 flex-col gap-4 border-b border-slate-700 pb-4">
        {/* Top Row: Main Actions */}
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-300">File</span>
          <label
            className={cn(
              "flex min-w-35 items-center justify-center px-4 py-2",
              "border border-slate-600 bg-slate-700 hover:bg-slate-600",
              "cursor-pointer rounded-lg transition-colors",
              "text-sm font-semibold text-white",
            )}
          >
            {uploadedFileName || "Open Spreadsheet..."}
            <input
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {/* "Add Reference" Button - Only visible if a file is loaded */}
          {fileData && (
            <label
              className={cn(
                "flex items-center gap-2 px-3 py-2",
                "border border-slate-700 bg-slate-800 hover:bg-slate-700",
                "cursor-pointer rounded-lg transition-colors",
                "text-sm font-medium text-slate-300 hover:text-white",
              )}
              title="Upload other files for reference (PDF, Images, etc)"
            >
              <PaperClipIcon className="h-4 w-4" />
              Add Reference
              <input
                type="file"
                multiple
                onChange={handleAddExtraFile}
                className="hidden"
              />
            </label>
          )}

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
              data={fileData}
              fileName={fileName || "edited_data"}
              onFileNameChange={(name) => setFileName(name)}
              initialFormat={detectedFormat}
            />
          )}
        </div>

        {/* Bottom Row: Reference Files List (Dynamic Colors) */}
        {extraFiles.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-800/50 px-3 py-2">
            <span className="mr-2 text-xs font-semibold text-slate-500 uppercase">
              References:
            </span>
            {extraFiles.map((file, idx) => {
              // Cycle through the color palette based on index
              const colorClass =
                FILE_COLOR_VARIANTS[idx % FILE_COLOR_VARIANTS.length];

              return (
                <div
                  key={idx}
                  className={cn(
                    "flex items-center gap-2 rounded border px-2 py-1 text-xs shadow-sm transition-colors",
                    colorClass,
                  )}
                >
                  <span className="max-w-[150px] truncate" title={file.name}>
                    {file.name}
                  </span>
                  <button
                    onClick={() => removeExtraFile(idx)}
                    className="cursor-pointer rounded-full p-0.5 opacity-60 hover:bg-black/20 hover:text-white hover:opacity-100"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
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

      {/* Floating Chat Button */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed right-8 bottom-8 z-50 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-200 shadow-xl transition-all hover:-translate-y-1 hover:bg-slate-700 hover:text-white hover:shadow-2xl"
        >
          <SparklesIcon className="h-6 w-6 text-purple-400" />
        </button>
      )}

      {/* Reset Dialog */}
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
