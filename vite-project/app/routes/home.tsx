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
  MagicIcon,
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

// Stable Reference File Object
type ReferenceFile = {
  id: string;
  file: File;
  colorIndex: number;
};

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

  // Renamed to clarify this is for the MAIN file load error
  const [mainFileError, setMainFileError] = useState<string>();

  const [detectedFormat, setDetectedFormat] =
    useState<SupportedExportType>("xlsx");

  const [extraFiles, setExtraFiles] = useState<ReferenceFile[]>([]);
  const [extractingFileIds, setExtractingFileIds] = useState<string[]>([]);

  // NEW: Track errors per file ID
  const [extractionErrors, setExtractionErrors] = useState<
    Record<string, string>
  >({});

  const [colorCounter, setColorCounter] = useState(0);

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
    setMainFileError(undefined);
    setEditingCell(null);
    setEditMetadata({});
    setHistory([]);
    setFuture([]);
    setExtraFiles([]);
    setExtractionErrors({});
    setColorCounter(0);
    setFallbackWarning(null);
    try {
      const rawData = await parseFile(inputFile);
      if (rawData.length === 0) {
        setMainFileError("The file is empty or has no valid data");
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
      setMainFileError("Failed to parse the file.");
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
      setExtractionErrors({});
    }
  };

  // --- HELPER: Remove Data for a Specific File ID ---
  // Returns cleaned data and metadata without setting state directly
  // This allows us to "simulate" removal before adding new data
  const removeDataForFileId = (
    idToRemove: string,
    currentData: unknown[][],
    currentMeta: Record<string, EditSource>,
  ) => {
    const rowsKeepIndices: number[] = [0]; // Always keep headers

    for (let r = 1; r < currentData.length; r++) {
      let isFromThisFile = false;
      const row = currentData[r] as unknown[];
      // Check metadata of first few cells (usually scanning one or two cols is enough)
      for (let c = 0; c < row.length; c++) {
        const meta = currentMeta[`${r}-${c}`];
        if (meta === `extraction-${idToRemove}`) {
          isFromThisFile = true;
          break;
        }
      }
      if (!isFromThisFile) {
        rowsKeepIndices.push(r);
      }
    }

    const newData = rowsKeepIndices.map((idx) => currentData[idx]);
    const newMetadata: Record<string, EditSource> = {};

    rowsKeepIndices.forEach((oldRowIdx, newRowIdx) => {
      const row = currentData[oldRowIdx] as unknown[];
      row.forEach((_, colIdx) => {
        const oldMeta = currentMeta[`${oldRowIdx}-${colIdx}`];
        if (oldMeta) {
          // Keep metadata for rows we preserved
          newMetadata[`${newRowIdx}-${colIdx}`] = oldMeta;
        }
      });
    });

    return { newData, newMetadata };
  };

  // --- CORE EXTRACTION FUNCTION ---
  // Now handles cleaning old data first (Refinement Logic)
  const runExtraction = async (
    refFile: ReferenceFile,
    currentData: unknown[][],
    currentMeta: Record<string, EditSource>,
  ) => {
    if (!currentData || currentData.length === 0) return null;

    setExtractingFileIds((prev) => [...prev, refFile.id]);

    // Clear previous error for this file so UI resets
    setExtractionErrors((prev) => {
      const next = { ...prev };
      delete next[refFile.id];
      return next;
    });

    // 1. CLEAN: Remove existing data for this file ID first.
    // This ensures we don't duplicate rows if the user clicks "Retry".
    const { newData: cleanedData, newMetadata: cleanedMeta } =
      removeDataForFileId(refFile.id, currentData, currentMeta);

    const headers = cleanedData[0];
    const attemptedModel = currentModel;

    // 2. EXTRACT
    const result = await extractDataFromReference(
      refFile.file,
      headers,
      attemptedModel,
      availableModels,
    );

    setExtractingFileIds((prev) => prev.filter((id) => id !== refFile.id));

    if (result && result.data.length > 0) {
      if (result.finalModel !== attemptedModel) {
        setCurrentModel(result.finalModel);
        setFallbackWarning(
          `⚠️ Model ${attemptedModel} failed. Switched to ${result.finalModel}.`,
        );
      }

      // 3. MERGE
      const startRowIndex = cleanedData.length;
      const updatedData = [...cleanedData, ...result.data];
      const newMetadata = { ...cleanedMeta };

      result.data.forEach((row, rIdx) => {
        row.forEach((_, cIdx) => {
          newMetadata[`${startRowIndex + rIdx}-${cIdx}`] =
            `extraction-${refFile.id}`;
        });
      });

      return { updatedData, newMetadata };
    } else {
      // 4. FAILURE CASE
      // We set the error state for the chip icon/tooltip.
      // IMPORTANT: We return the CLEANED data. This means if extraction fails
      // on a retry, the old (potentially wrong) data is removed, leaving a clean slate.
      setExtractionErrors((prev) => ({
        ...prev,
        [refFile.id]: `Could not extract valid data from ${refFile.file.name}. The AI might not have found tabular data matching your headers.`,
      }));

      return { updatedData: cleanedData, newMetadata: cleanedMeta };
    }
  };

  // --- ADD FILE + AUTO EXTRACT (BATCH SUPPORT) ---
  const handleAddExtraFile = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!fileData) return;

    const newFilesRaw = Array.from(e.target.files);

    // 1. Create ReferenceFile objects
    const newRefFiles: ReferenceFile[] = newFilesRaw.map((file, i) => ({
      id: crypto.randomUUID(),
      file,
      colorIndex: (colorCounter + i) % FILE_CHIP_VARIANTS.length,
    }));

    setExtraFiles((prev) => [...prev, ...newRefFiles]);
    setColorCounter((prev) => prev + newFilesRaw.length);
    commitToHistory();

    // 2. Accumulate changes sequentially
    // We must use local variables to chain the updates, otherwise
    // the second file will try to update based on stale 'fileData'.
    let workingData = [...fileData];
    let workingMeta = { ...editMetadata };

    for (const refFile of newRefFiles) {
      const result = await runExtraction(refFile, workingData, workingMeta);

      if (result) {
        workingData = result.updatedData;
        workingMeta = result.newMetadata;
        // Update state progressively so user sees rows popping in
        setFileData(workingData);
        setEditMetadata(workingMeta);
      }
    }

    e.target.value = "";
  };

  // --- REMOVE FILE ---
  const removeExtraFile = (idToRemove: string) => {
    if (!fileData) return;
    commitToHistory();

    // 1. Remove from UI
    setExtraFiles((prev) => prev.filter((f) => f.id !== idToRemove));

    // 2. Clear Error state
    setExtractionErrors((prev) => {
      const next = { ...prev };
      delete next[idToRemove];
      return next;
    });

    // 3. Remove Data
    const { newData, newMetadata } = removeDataForFileId(
      idToRemove,
      fileData,
      editMetadata,
    );

    setFileData(newData);
    setEditMetadata(newMetadata);
  };

  // --- MANUAL RETRY (REFINE) ---
  const handleManualExtract = async (refFile: ReferenceFile) => {
    if (!fileData) return;
    commitToHistory();
    // Pass current state. runExtraction handles the cleanup.
    const result = await runExtraction(refFile, fileData, editMetadata);
    if (result) {
      setFileData(result.updatedData);
      setEditMetadata(result.newMetadata);
    }
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
      const id = source.replace("extraction-", "");
      const refFile = extraFiles.find((f) => f.id === id);
      if (refFile) {
        return FILE_CELL_VARIANTS[refFile.colorIndex];
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

          {/* Legend - Removed "Extraction" item */}
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

          {/* Main File Load Error Only */}
          {!!mainFileError && (
            <div className="ml-2 font-medium whitespace-nowrap text-red-400">
              {mainFileError}
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
              {extraFiles.map((refFile) => {
                const colorClass = FILE_CHIP_VARIANTS[refFile.colorIndex];
                const isExtracting = extractingFileIds.includes(refFile.id);
                // Check if this file has a specific error
                const fileError = extractionErrors[refFile.id];

                return (
                  <div
                    key={refFile.id}
                    className={cn(
                      "flex items-center gap-2 rounded border px-2 py-1 text-xs shadow-sm transition-all",
                      colorClass,
                      // Visual cue if error (optional, adds red tint)
                      fileError && "border-red-500/50 bg-red-900/20",
                    )}
                  >
                    <span
                      className="max-w-[150px] truncate"
                      title={refFile.file.name}
                    >
                      {refFile.file.name}
                    </span>

                    {/* STATUS INDICATORS */}
                    {isExtracting ? (
                      <span className="ml-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-white"></span>
                    ) : fileError ? (
                      // ERROR STATE: Warning Icon + Tooltip
                      <div className="group relative ml-1 flex items-center justify-center">
                        <button
                          onClick={() => handleManualExtract(refFile)}
                          className="cursor-pointer text-red-400 hover:text-red-300"
                        >
                          <WarningIcon className="h-4 w-4" />
                        </button>
                        {/* CSS Tooltip */}
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-max max-w-[250px] -translate-x-1/2 rounded bg-black/90 px-3 py-2 text-xs text-white shadow-xl ring-1 ring-white/10 group-hover:block">
                          {fileError}
                          <div className="ring-r-1 ring-b-1 absolute top-full left-1/2 -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-black/90 ring-white/10"></div>
                        </div>
                      </div>
                    ) : (
                      // SUCCESS STATE: Magic Wand
                      <button
                        onClick={() => handleManualExtract(refFile)}
                        className={cn(
                          "ml-1 cursor-pointer rounded p-0.5 text-white/70 hover:bg-white/20 hover:text-white",
                        )}
                        title="Re-run extraction (Refine)"
                      >
                        <MagicIcon className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => removeExtraFile(refFile.id)}
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
