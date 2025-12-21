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
  WarningIcon,
  XIcon,
} from "~/components/icons";
import ModelSelector from "~/components/ModelSelector";
import { useGemini } from "~/hooks/useGemini";
import { extractDataFromReference } from "~/utils/aiExtractionUtils";
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
type EditSource = "user" | "ai" | string;

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

const FILE_CHIP_VARIANTS = [
  "border-amber-700/50 bg-amber-900/40 text-amber-100",
  "border-emerald-700/50 bg-emerald-900/40 text-emerald-100",
  "border-rose-700/50 bg-rose-900/40 text-rose-100",
  "border-sky-700/50 bg-sky-900/40 text-sky-100",
  "border-violet-700/50 bg-violet-900/40 text-violet-100",
  "border-fuchsia-700/50 bg-fuchsia-900/40 text-fuchsia-100",
];

const FILE_CELL_VARIANTS = [
  "bg-amber-900/40 text-amber-100 ring-1 ring-inset ring-amber-500/50",
  "bg-emerald-900/40 text-emerald-100 ring-1 ring-inset ring-emerald-500/50",
  "bg-rose-900/40 text-rose-100 ring-1 ring-inset ring-rose-500/50",
  "bg-sky-900/40 text-sky-100 ring-1 ring-inset ring-sky-500/50",
  "bg-violet-900/40 text-violet-100 ring-1 ring-inset ring-violet-500/50",
  "bg-fuchsia-900/40 text-fuchsia-100 ring-1 ring-inset ring-fuchsia-500/50",
];

export default function Home() {
  const [fileData, setFileData] = useState<unknown[][]>();
  const [fileName, setFileName] = useState<string>("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [detectedFormat, setDetectedFormat] =
    useState<SupportedExportType>("xlsx");

  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  // Used to show loading spinner on specific chips
  const [extractingFileIndices, setExtractingFileIndices] = useState<number[]>(
    [],
  );

  const { availableModels, currentModel, setCurrentModel } = useGemini();
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [editMetadata, setEditMetadata] = useState<Record<string, EditSource>>(
    {},
  );
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [tempValue, setTempValue] = useState<string>("");
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  type HistoryState = {
    data: unknown[][];
    metadata: Record<string, EditSource>;
  };
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  const [originalFileData, setOriginalFileData] = useState<unknown[][] | null>(
    null,
  );

  // --- Effects & Logic ---

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

  const commitToHistory = useCallback(() => {
    if (!fileData) return;
    setHistory((prev) => {
      const newHistory = [...prev, { data: fileData, metadata: editMetadata }];
      if (newHistory.length > MAX_HISTORY)
        return newHistory.slice(newHistory.length - MAX_HISTORY);
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

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const inputFile = e.target.files[0];
    setError(undefined);
    setEditingCell(null);
    setEditMetadata({});
    setHistory([]);
    setFuture([]);
    setExtraFiles([]);
    setFallbackWarning(null);
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
      if (isOfTypeSupportedExportType(ext)) setDetectedFormat(ext);
      else setDetectedFormat("xlsx");
    } catch (err) {
      console.error("Error processing file:", err);
      setError("Failed to parse the file.");
    }
    e.target.value = "";
  };

  const handleResetData = () => {
    if (originalFileData) {
      commitToHistory();
      setFileData(JSON.parse(JSON.stringify(originalFileData)));
      setEditMetadata({});
      setIsResetDialogOpen(false);
      setFallbackWarning(null);
    }
  };

  // --- CORE EXTRACTION FUNCTION ---
  // Factored out so it can be called by both 'Add' and 'Retry'
  const runExtraction = async (
    file: File,
    fileIndex: number,
    currentData: unknown[][],
    currentMeta: Record<string, EditSource>,
  ) => {
    if (!currentData || currentData.length === 0) return null;

    setExtractingFileIndices((prev) => [...prev, fileIndex]);
    setError(undefined);

    const headers = currentData[0];
    const attemptedModel = currentModel;

    const result = await extractDataFromReference(
      file,
      headers,
      attemptedModel,
      availableModels,
    );

    setExtractingFileIndices((prev) => prev.filter((i) => i !== fileIndex));

    if (result && result.data.length > 0) {
      if (result.finalModel !== attemptedModel) {
        setCurrentModel(result.finalModel);
        setFallbackWarning(
          `⚠️ Model ${attemptedModel} failed. Switched to ${result.finalModel}.`,
        );
      }

      const startRowIndex = currentData.length;
      const updatedData = [...currentData, ...result.data];
      const newMetadata = { ...currentMeta };

      result.data.forEach((row, rIdx) => {
        row.forEach((_, cIdx) => {
          newMetadata[`${startRowIndex + rIdx}-${cIdx}`] =
            `extraction-${fileIndex}`;
        });
      });

      return { updatedData, newMetadata };
    } else {
      setError(`Could not extract valid data from ${file.name}`);
      return null;
    }
  };

  // --- ADD FILE + AUTO EXTRACT ---
  const handleAddExtraFile = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!fileData) return;

    const newFiles = Array.from(e.target.files);
    const startIdx = extraFiles.length;

    // 1. Add to file list immediately
    setExtraFiles((prev) => [...prev, ...newFiles]);

    // 2. Commit current state before modifying
    commitToHistory();

    let workingData = [...fileData];
    let workingMeta = { ...editMetadata };

    // 3. Process each new file sequentially
    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i];
      const actualIndex = startIdx + i;

      const result = await runExtraction(
        file,
        actualIndex,
        workingData,
        workingMeta,
      );

      if (result) {
        workingData = result.updatedData;
        workingMeta = result.newMetadata;
        // Update state progressively so user sees rows appearing
        setFileData(workingData);
        setEditMetadata(workingMeta);
      }
    }

    e.target.value = "";
  };

  // --- REMOVE FILE + DELETE ROWS ---
  const removeExtraFile = (indexToRemove: number) => {
    if (!fileData) return;
    commitToHistory();

    // 1. Remove file from UI list
    setExtraFiles((prev) => prev.filter((_, i) => i !== indexToRemove));

    // 2. Filter out rows belonging to this file
    // We identify rows by checking if ANY cell in that row has the metadata key
    const rowsKeepIndices: number[] = [];
    // Always keep header (row 0)
    rowsKeepIndices.push(0);

    for (let r = 1; r < fileData.length; r++) {
      // Check first cell metadata (or any cell in the row)
      // Optimization: usually checking col 0 or 1 is enough, but let's be safe
      const rowKey = `${r}-0`; // Using first column as proxy
      // Better approach: Check if row was generated by this index.
      // Since our metadata key format is `row-col`, we need to scan the row's metadata.
      let isFromRemovedFile = false;

      // Check a few columns to see if they are tagged with 'extraction-INDEX'
      // We iterate columns of the row
      const row = fileData[r] as unknown[];
      for (let c = 0; c < row.length; c++) {
        const meta = editMetadata[`${r}-${c}`];
        if (meta === `extraction-${indexToRemove}`) {
          isFromRemovedFile = true;
          break;
        }
      }

      if (!isFromRemovedFile) {
        rowsKeepIndices.push(r);
      }
    }

    // Construct new Data
    const newData = rowsKeepIndices.map((idx) => fileData[idx]);

    // 3. Rebuild Metadata
    // We need to shift row indices AND shift extraction-IDs for files coming AFTER the removed one.
    const newMetadata: Record<string, EditSource> = {};

    rowsKeepIndices.forEach((oldRowIdx, newRowIdx) => {
      const row = fileData[oldRowIdx] as unknown[];
      row.forEach((_, colIdx) => {
        const oldMeta = editMetadata[`${oldRowIdx}-${colIdx}`];
        if (oldMeta) {
          let newMetaValue = oldMeta;

          // If it's an extraction source, check if we need to decrement the ID
          if (
            typeof oldMeta === "string" &&
            oldMeta.startsWith("extraction-")
          ) {
            const fileId = parseInt(oldMeta.split("-")[1], 10);
            if (fileId > indexToRemove) {
              // Shift ID down (e.g. extraction-2 becomes extraction-1)
              newMetaValue = `extraction-${fileId - 1}`;
            }
          }

          newMetadata[`${newRowIdx}-${colIdx}`] = newMetaValue;
        }
      });
    });

    setFileData(newData);
    setEditMetadata(newMetadata);
  };

  // --- Editing ---
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

  // --- Highlight Logic ---
  const getCellHighlightClass = (rowIndex: number, colIndex: number) => {
    const source = editMetadata[`${rowIndex}-${colIndex}`];

    if (source === "user")
      return "bg-blue-900/40 text-blue-100 ring-1 ring-inset ring-blue-500/50";
    if (source === "ai")
      return "bg-purple-900/40 text-purple-100 ring-1 ring-inset ring-purple-500/50";

    if (typeof source === "string" && source.startsWith("extraction-")) {
      const fileIndex = parseInt(source.split("-")[1], 10);
      if (!isNaN(fileIndex)) {
        return FILE_CELL_VARIANTS[fileIndex % FILE_CELL_VARIANTS.length];
      }
    }
    return "";
  };

  const headers = fileData?.[0] || [];
  const bodyRows = fileData?.slice(1) || [];
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

          {fileData && (
            <label
              className={cn(
                "flex items-center gap-2 px-3 py-2",
                "border border-slate-700 bg-slate-800 hover:bg-slate-700",
                "cursor-pointer rounded-lg transition-colors",
                "text-sm font-medium text-slate-300 hover:text-white",
              )}
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
              >
                <RedoIcon className="h-4 w-4" />
              </button>
            </div>
          )}

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
            >
              <ResetIcon className="h-4 w-4" /> Reset
            </button>
          )}

          {/* UPDATED LEGEND: Removed "Extraction" */}
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

        {/* Bottom Row: Reference Files List & Model Selector */}
        {extraFiles.length > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-xs font-semibold text-slate-500 uppercase">
                References:
              </span>
              {extraFiles.map((file, idx) => {
                const colorClass =
                  FILE_CHIP_VARIANTS[idx % FILE_CHIP_VARIANTS.length];
                // Check if this specific index is processing
                const isExtracting = extractingFileIndices.includes(idx);

                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-center gap-2 rounded border px-2 py-1 text-xs shadow-sm transition-all",
                      colorClass,
                    )}
                  >
                    <span className="max-w-[150px] truncate" title={file.name}>
                      {file.name}
                    </span>

                    {/* Loading Indicator */}
                    {isExtracting ? (
                      <span className="ml-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-white"></span>
                    ) : (
                      <div className="w-3.5"></div> // Spacer
                    )}

                    <button
                      onClick={() => removeExtraFile(idx)}
                      disabled={isExtracting}
                      className="cursor-pointer rounded-full p-0.5 opacity-60 hover:bg-black/20 hover:text-white hover:opacity-100"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 border-l border-slate-700 pl-4">
              <span className="text-xs text-slate-500">Extraction Model:</span>

              {fallbackWarning && (
                <div className="group relative flex items-center justify-center">
                  <div className="animate-pulse cursor-help text-orange-400">
                    <WarningIcon className="h-4 w-4" />
                  </div>
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-max max-w-[250px] -translate-x-1/2 rounded bg-black/90 px-3 py-2 text-xs text-white shadow-xl ring-1 ring-white/10 group-hover:block">
                    {fallbackWarning}
                    <div className="ring-r-1 ring-b-1 absolute top-full left-1/2 -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-black/90 ring-white/10"></div>
                  </div>
                </div>
              )}

              <ModelSelector
                models={availableModels}
                selectedModel={currentModel}
                onSelect={setCurrentModel}
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
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
                                    {String(cell ?? "") === "" ? (
                                      <span className="absolute top-1 left-1 text-[10px] leading-none text-slate-400 italic opacity-60 select-none">
                                        Empty
                                      </span>
                                    ) : (
                                      String(cell)
                                    )}
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

      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed right-8 bottom-8 z-50 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-200 shadow-xl transition-all hover:-translate-y-1 hover:bg-slate-700 hover:text-white hover:shadow-2xl"
        >
          <SparklesIcon className="h-6 w-6 text-purple-400" />
        </button>
      )}
      {isResetDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100">Reset Data?</h3>
            <p className="mt-2 text-sm text-slate-400">Are you sure?</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsResetDialogOpen(false)}
                className="px-4 py-2 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleResetData}
                className="rounded bg-red-600 px-4 py-2 text-white"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
