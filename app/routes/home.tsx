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
  BanknotesIcon,
  BookIcon,
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
import {
  extractDataFromReference,
  type ExtractionCitation,
} from "~/utils/aiExtractionUtils";
import { quoteProducts } from "~/utils/aiQuotingUtils";
import { cn } from "~/utils/cn";
import {
  isOfTypeSupportedExportType,
  parseFile,
  saveToExcel,
  SUPPORTED_EXPORT_TYPES,
  type SupportedExportType,
} from "~/utils/excelUtils";
import type { Route } from "./+types/home";

// --- Types ---

type EditingCell = { rowIndex: number; colIndex: number };
type EditSource = "user" | "ai" | string;

// The unified structure for source info (files or API/Chat)
type RowSourceInfo = {
  fileId: string; // ID of the reference file OR "gemini-chat"
  fileName: string; // Display name (Filename or "Gemini Chat")
  citation: ExtractionCitation; // Flexible union type (Document vs Spreadsheet vs API)
};

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

// Helper to get domain from URL for cleaner display
const getDomain = (url?: string) => {
  if (!url) return "AI Search";
  try {
    // Handle cases where URL might be just a domain or incomplete
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    return urlObj.hostname.replace(/^www\./, "");
  } catch (e) {
    return "External Source";
  }
};

export default function Home() {
  // --- Main Data State ---
  const [fileData, setFileData] = useState<unknown[][]>();
  const [fileName, setFileName] = useState<string>("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [mainFileError, setMainFileError] = useState<string>();
  const [detectedFormat, setDetectedFormat] =
    useState<SupportedExportType>("xlsx");

  // --- Reference & AI State ---
  const [extraFiles, setExtraFiles] = useState<ReferenceFile[]>([]);
  const [extractingFileIds, setExtractingFileIds] = useState<string[]>([]);
  const [extractionErrors, setExtractionErrors] = useState<
    Record<string, string>
  >({});

  // Store source info per row index
  const [rowSources, setRowSources] = useState<Record<number, RowSourceInfo>>(
    {},
  );
  // Controls the Citation Modal
  const [viewingSource, setViewingSource] = useState<RowSourceInfo | null>(
    null,
  );

  const [colorCounter, setColorCounter] = useState(0);
  const { availableModels, currentModel, setCurrentModel } = useGemini();
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);

  // Quoting State
  const [isQuoting, setIsQuoting] = useState(false);
  // Track quoting status for individual rows
  const [quotingRowIndices, setQuotingRowIndices] = useState<number[]>([]);

  // --- UI State ---
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [editMetadata, setEditMetadata] = useState<Record<string, EditSource>>(
    {},
  );
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [tempValue, setTempValue] = useState<string>("");
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  // --- History ---
  type HistoryState = {
    data: unknown[][];
    metadata: Record<string, EditSource>;
    sources: Record<number, RowSourceInfo>;
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

  // --- History Management ---
  const commitToHistory = useCallback(() => {
    if (!fileData) return;
    setHistory((prev) => {
      const newHistory = [
        ...prev,
        { data: fileData, metadata: editMetadata, sources: rowSources },
      ];
      if (newHistory.length > MAX_HISTORY)
        return newHistory.slice(newHistory.length - MAX_HISTORY);
      return newHistory;
    });
    setFuture([]);
  }, [fileData, editMetadata, rowSources]);

  const handleUndo = useCallback(() => {
    if (history.length === 0 || !fileData) return;
    const previousState = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    setFuture((prev) => [
      { data: fileData, metadata: editMetadata, sources: rowSources },
      ...prev,
    ]);
    setFileData(previousState.data);
    setEditMetadata(previousState.metadata);
    setRowSources(previousState.sources || {});
    setHistory(newHistory);
  }, [history, fileData, editMetadata, rowSources]);

  const handleRedo = useCallback(() => {
    if (future.length === 0 || !fileData) return;
    const nextState = future[0];
    const newFuture = future.slice(1);
    setHistory((prev) => [
      ...prev,
      { data: fileData, metadata: editMetadata, sources: rowSources },
    ]);
    setFileData(nextState.data);
    setEditMetadata(nextState.metadata);
    setRowSources(nextState.sources || {});
    setFuture(newFuture);
  }, [future, fileData, editMetadata, rowSources]);

  // --- Main File Logic ---
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const inputFile = e.target.files[0];
    setMainFileError(undefined);
    setEditingCell(null);
    setEditMetadata({});
    setRowSources({});
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
      setRowSources({});
      setIsResetDialogOpen(false);
      setFallbackWarning(null);
      setExtractionErrors({});
    }
  };

  // --- Helper: Clean Data for File ID ---
  // Removes rows that were previously extracted from a specific file
  const removeDataForFileId = (
    idToRemove: string,
    currentData: unknown[][],
    currentMeta: Record<string, EditSource>,
    currentSources: Record<number, RowSourceInfo>,
  ) => {
    const rowsKeepIndices: number[] = [0]; // Always keep header

    for (let r = 1; r < currentData.length; r++) {
      let isFromThisFile = false;

      // Check metadata on cells
      const row = currentData[r] as unknown[];
      for (let c = 0; c < row.length; c++) {
        const meta = currentMeta[`${r}-${c}`];
        if (meta === `extraction-${idToRemove}`) {
          isFromThisFile = true;
          break;
        }
      }
      // Double check source map
      if (currentSources[r]?.fileId === idToRemove) {
        isFromThisFile = true;
      }

      if (!isFromThisFile) {
        rowsKeepIndices.push(r);
      }
    }

    const newData = rowsKeepIndices.map((idx) => currentData[idx]);
    const newMetadata: Record<string, EditSource> = {};
    const newSources: Record<number, RowSourceInfo> = {};

    rowsKeepIndices.forEach((oldRowIdx, newRowIdx) => {
      // Shift Metadata
      const row = currentData[oldRowIdx] as unknown[];
      row.forEach((_, colIdx) => {
        const oldMeta = currentMeta[`${oldRowIdx}-${colIdx}`];
        if (oldMeta) newMetadata[`${newRowIdx}-${colIdx}`] = oldMeta;
      });

      // Shift Sources
      if (currentSources[oldRowIdx]) {
        newSources[newRowIdx] = currentSources[oldRowIdx];
      }
    });

    return { newData, newMetadata, newSources };
  };

  // --- Core Extraction Function ---
  const runExtraction = async (
    refFile: ReferenceFile,
    currentData: unknown[][],
    currentMeta: Record<string, EditSource>,
    currentSources: Record<number, RowSourceInfo>,
  ) => {
    if (!currentData || currentData.length === 0) return null;

    setExtractingFileIds((prev) => [...prev, refFile.id]);
    setExtractionErrors((prev) => {
      const next = { ...prev };
      delete next[refFile.id];
      return next;
    });

    // 1. Clean old data for this file ID (Refinement)
    const {
      newData: cleanedData,
      newMetadata: cleanedMeta,
      newSources: cleanedSources,
    } = removeDataForFileId(
      refFile.id,
      currentData,
      currentMeta,
      currentSources,
    );

    const headers = cleanedData[0];
    const attemptedModel = currentModel;

    // 2. Call AI
    const result = await extractDataFromReference(
      refFile.file,
      headers,
      attemptedModel,
      availableModels,
    );

    setExtractingFileIds((prev) => prev.filter((id) => id !== refFile.id));

    if (result && result.rows.length > 0) {
      if (result.finalModel !== attemptedModel) {
        setCurrentModel(result.finalModel);
        setFallbackWarning(
          `⚠️ Model ${attemptedModel} failed. Switched to ${result.finalModel}.`,
        );
      }

      // 3. Merge New Data
      const startRowIndex = cleanedData.length;
      const newRowsData = result.rows.map((r) => r.data);
      const updatedData = [...cleanedData, ...newRowsData];

      const newMetadata = { ...cleanedMeta };
      const newSources = { ...cleanedSources };

      result.rows.forEach((rowObj, rIdx) => {
        const actualRowIdx = startRowIndex + rIdx;

        // Apply Color Metadata
        rowObj.data.forEach((_, cIdx) => {
          newMetadata[`${actualRowIdx}-${cIdx}`] = `extraction-${refFile.id}`;
        });

        // Apply Source Citation
        newSources[actualRowIdx] = {
          fileId: refFile.id,
          fileName: refFile.file.name,
          citation: rowObj.citation,
        };
      });

      return { updatedData, newMetadata, newSources };
    } else {
      // 4. Handle Failure
      setExtractionErrors((prev) => ({
        ...prev,
        [refFile.id]: `Could not extract valid tabular data from ${refFile.file.name}.`,
      }));
      // Return the cleaned state so users can retry without duplicates
      return {
        updatedData: cleanedData,
        newMetadata: cleanedMeta,
        newSources: cleanedSources,
      };
    }
  };

  // --- Auto Quoting Logic (Batch) ---
  const handleAutoQuote = async () => {
    if (!fileData || fileData.length === 0) return;
    setIsQuoting(true);
    setMainFileError(undefined);

    commitToHistory();

    try {
      const currentHeaders = fileData[0] as string[];
      let updatedHeaders = [...currentHeaders];
      let updatedData = [...fileData];
      let updatedMeta = { ...editMetadata };
      let updatedSources = { ...rowSources };

      // 1. Identify or Create Columns
      const requiredCols = ["Net Price", "Price/Unit", "Est. Delivery"];
      const colIndices: Record<string, number> = {};

      requiredCols.forEach((colName) => {
        let idx = updatedHeaders.findIndex((h) =>
          h?.toString().toLowerCase().includes(colName.toLowerCase()),
        );
        if (idx === -1) {
          idx = updatedHeaders.length;
          updatedHeaders.push(colName);
          // Expand all rows to fit new header
          updatedData = updatedData.map((row, i) =>
            i === 0 ? updatedHeaders : [...row, ""],
          );
        }
        colIndices[colName] = idx;
      });

      // Update data with new headers locally for the AI context
      updatedData[0] = updatedHeaders;

      // 2. Call AI
      const bodyRows = updatedData.slice(1);
      const quotes = await quoteProducts(
        bodyRows,
        updatedHeaders,
        currentModel,
        availableModels,
      );

      if (quotes && quotes.length > 0) {
        // 3. Merge Results
        quotes.forEach((quote) => {
          const rowIndex = quote.rowId;

          if (rowIndex < updatedData.length) {
            const row = [...(updatedData[rowIndex] as unknown[])];

            // Fill cells
            row[colIndices["Net Price"]] = quote.totalNetPrice;
            row[colIndices["Price/Unit"]] = quote.netPricePerUnit;
            row[colIndices["Est. Delivery"]] = quote.estimatedDelivery;

            updatedData[rowIndex] = row;

            // Update Metadata (Coloring)
            updatedMeta[`${rowIndex}-${colIndices["Net Price"]}`] = "ai";
            updatedMeta[`${rowIndex}-${colIndices["Price/Unit"]}`] = "ai";
            updatedMeta[`${rowIndex}-${colIndices["Est. Delivery"]}`] = "ai";

            // Update Source Citation with proper dynamic URL and Domain
            const domain = getDomain(quote.sourceUrl);
            updatedSources[rowIndex] = {
              fileId: "conrad-quoting",
              fileName: "AI Quoting",
              citation: {
                type: "api",
                endpoint: domain, // Shows "octo24.com" etc.
                reasoning: quote.reasoning,
                url: quote.sourceUrl, // Passes the full URL to the modal
              },
            };
          }
        });

        setFileData(updatedData);
        setEditMetadata(updatedMeta);
        setRowSources(updatedSources);
      } else {
        setMainFileError(
          "Quoting failed or found no results. Data not modified.",
        );
      }
    } catch (e) {
      console.error("Auto Quoting error", e);
      setMainFileError("Quoting process failed.");
    } finally {
      setIsQuoting(false);
    }
  };

  // --- Single Row Quoting Logic ---
  const handleSingleRowQuote = async (rowIndex: number) => {
    if (!fileData) return;

    setQuotingRowIndices((prev) => [...prev, rowIndex]);
    commitToHistory();

    try {
      let currentData = [...fileData];
      let currentHeaders = [...(currentData[0] as string[])];

      const requiredCols = ["Net Price", "Price/Unit", "Est. Delivery"];
      const colIndices: Record<string, number> = {};
      let columnsAdded = false;

      requiredCols.forEach((colName) => {
        let idx = currentHeaders.findIndex((h) =>
          h?.toString().toLowerCase().includes(colName.toLowerCase()),
        );
        if (idx === -1) {
          idx = currentHeaders.length;
          currentHeaders.push(colName);
          columnsAdded = true;
        }
        colIndices[colName] = idx;
      });

      if (columnsAdded) {
        currentData = currentData.map((row, i) => {
          if (i === 0) return currentHeaders;
          const newRow = [...row];
          while (newRow.length < currentHeaders.length) {
            newRow.push("");
          }
          return newRow;
        });
        setFileData(currentData);
      }

      const rowToQuote = currentData[rowIndex];
      const quotes = await quoteProducts(
        [rowToQuote],
        currentHeaders,
        currentModel,
        availableModels,
      );

      if (quotes && quotes.length > 0) {
        const quote = quotes[0];

        setFileData((prevData) => {
          if (!prevData) return prevData;
          const newData = [...prevData];
          const row = [...(newData[rowIndex] as unknown[])];
          while (row.length < currentHeaders.length) row.push("");

          row[colIndices["Net Price"]] = quote.totalNetPrice;
          row[colIndices["Price/Unit"]] = quote.netPricePerUnit;
          row[colIndices["Est. Delivery"]] = quote.estimatedDelivery;
          newData[rowIndex] = row;
          return newData;
        });

        setEditMetadata((prev) => ({
          ...prev,
          [`${rowIndex}-${colIndices["Net Price"]}`]: "ai",
          [`${rowIndex}-${colIndices["Price/Unit"]}`]: "ai",
          [`${rowIndex}-${colIndices["Est. Delivery"]}`]: "ai",
        }));

        const domain = getDomain(quote.sourceUrl);
        setRowSources((prev) => ({
          ...prev,
          [rowIndex]: {
            fileId: "conrad-quoting-single",
            fileName: "AI Quoting",
            citation: {
              type: "api",
              endpoint: domain,
              reasoning: quote.reasoning,
              url: quote.sourceUrl,
            },
          },
        }));
      }
    } catch (e) {
      console.error("Single row quote error:", e);
    } finally {
      setQuotingRowIndices((prev) => prev.filter((id) => id !== rowIndex));
    }
  };

  // --- Add Reference Handler ---
  const handleAddExtraFile = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!fileData) return;

    const newFilesRaw = Array.from(e.target.files);
    const newRefFiles: ReferenceFile[] = newFilesRaw.map((file, i) => ({
      id: crypto.randomUUID(),
      file,
      colorIndex: (colorCounter + i) % FILE_CHIP_VARIANTS.length,
    }));

    setExtraFiles((prev) => [...prev, ...newRefFiles]);
    setColorCounter((prev) => prev + newFilesRaw.length);
    commitToHistory();

    let workingData = [...fileData];
    let workingMeta = { ...editMetadata };
    let workingSources = { ...rowSources };

    for (const refFile of newRefFiles) {
      const result = await runExtraction(
        refFile,
        workingData,
        workingMeta,
        workingSources,
      );
      if (result) {
        workingData = result.updatedData;
        workingMeta = result.newMetadata;
        workingSources = result.newSources;
        setFileData(workingData);
        setEditMetadata(workingMeta);
        setRowSources(workingSources);
      }
    }
    e.target.value = "";
  };

  // --- Remove Reference Handler ---
  const removeExtraFile = (idToRemove: string) => {
    if (!fileData) return;
    commitToHistory();

    setExtraFiles((prev) => prev.filter((f) => f.id !== idToRemove));
    setExtractionErrors((prev) => {
      const next = { ...prev };
      delete next[idToRemove];
      return next;
    });

    const { newData, newMetadata, newSources } = removeDataForFileId(
      idToRemove,
      fileData,
      editMetadata,
      rowSources,
    );

    setFileData(newData);
    setEditMetadata(newMetadata);
    setRowSources(newSources);
  };

  // --- Manual Retry Handler ---
  const handleManualExtract = async (refFile: ReferenceFile) => {
    if (!fileData) return;
    commitToHistory();
    const result = await runExtraction(
      refFile,
      fileData,
      editMetadata,
      rowSources,
    );
    if (result) {
      setFileData(result.updatedData);
      setEditMetadata(result.newMetadata);
      setRowSources(result.newSources);
    }
  };

  // --- Chat & Edit Handlers ---
  const handleGeminiUpdate = (
    newData: unknown[][],
    newSources?: Record<number, RowSourceInfo>,
  ) => {
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

    let updatedSources = { ...rowSources };
    if (newSources) {
      updatedSources = { ...updatedSources, ...newSources };
    }

    setHistory((prev) => [
      ...prev,
      { data: fileData!, metadata: editMetadata, sources: rowSources },
    ]);
    setFileData(newData);
    setEditMetadata(newMetadata);
    setRowSources(updatedSources);
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

  const getCellHighlightClass = (rowIndex: number, colIndex: number) => {
    const source = editMetadata[`${rowIndex}-${colIndex}`];
    if (source === "user")
      return "bg-blue-900/40 text-blue-100 ring-1 ring-inset ring-blue-500/50";
    if (source === "ai")
      return "bg-purple-900/40 text-purple-100 ring-1 ring-inset ring-purple-500/50";
    if (typeof source === "string" && source.startsWith("extraction-")) {
      const id = source.replace("extraction-", "");
      const refFile = extraFiles.find((f) => f.id === id);
      if (refFile) return FILE_CELL_VARIANTS[refFile.colorIndex];
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
      {/* 1. HEADER SECTION */}
      <div className="flex shrink-0 flex-col gap-4 border-b border-slate-700 pb-4">
        {/* Top: File Actions */}
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-300">File</span>
          <label
            className={cn(
              "flex min-w-35 cursor-pointer items-center justify-center rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-600",
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
            <>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white",
                )}
              >
                <PaperClipIcon className="h-4 w-4" /> Add Reference
                <input
                  type="file"
                  multiple
                  onChange={handleAddExtraFile}
                  className="hidden"
                />
              </label>

              {/* NEW: Model Selector for Quoting */}
              <div className="ml-2 flex items-center gap-2 border-l border-slate-700 pl-4">
                <span className="hidden text-xs text-slate-500 xl:inline">
                  Quoting Model:
                </span>
                <ModelSelector
                  models={availableModels}
                  selectedModel={currentModel}
                  onSelect={setCurrentModel}
                />
              </div>

              <button
                onClick={handleAutoQuote}
                disabled={isQuoting}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-emerald-700/50 bg-emerald-900/20 px-3 py-2 text-sm font-medium text-emerald-300 transition-all hover:bg-emerald-900/40 hover:text-emerald-200 hover:shadow-lg hover:shadow-emerald-900/20",
                  isQuoting && "cursor-wait opacity-70",
                )}
                title="Automatically fetch prices and delivery times from Conrad.de"
              >
                {isQuoting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500/50 border-t-emerald-400" />
                ) : (
                  <BanknotesIcon className="h-4 w-4" />
                )}
                Auto Quote
              </button>
            </>
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

        {/* Bottom: References List */}
        {extraFiles.length > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-xs font-semibold text-slate-500 uppercase">
                References:
              </span>
              {extraFiles.map((refFile) => {
                const colorClass = FILE_CHIP_VARIANTS[refFile.colorIndex];
                const isExtracting = extractingFileIds.includes(refFile.id);
                const fileError = extractionErrors[refFile.id];
                return (
                  <div
                    key={refFile.id}
                    className={cn(
                      "flex items-center gap-2 rounded border px-2 py-1 text-xs shadow-sm transition-all",
                      colorClass,
                      fileError && "border-red-500/50 bg-red-900/20",
                    )}
                  >
                    <span
                      className="max-w-[150px] truncate"
                      title={refFile.file.name}
                    >
                      {refFile.file.name}
                    </span>
                    {isExtracting ? (
                      <span className="ml-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-white"></span>
                    ) : fileError ? (
                      <div className="group relative ml-1 flex items-center justify-center">
                        <button
                          onClick={() => handleManualExtract(refFile)}
                          className="cursor-pointer text-red-400 hover:text-red-300"
                        >
                          <WarningIcon className="h-4 w-4" />
                        </button>
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-max max-w-[250px] -translate-x-1/2 rounded bg-black/90 px-3 py-2 text-xs text-white shadow-xl ring-1 ring-white/10 group-hover:block">
                          {fileError}
                          <div className="ring-r-1 ring-b-1 absolute top-full left-1/2 -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-black/90 ring-white/10"></div>
                        </div>
                      </div>
                    ) : (
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

      {/* 2. MAIN CONTENT SECTION */}
      <div className="relative flex flex-1 gap-6 overflow-hidden">
        {/* Left: Table */}
        <div className="flex min-w-0 flex-1 flex-col transition-all duration-300">
          {fileData ? (
            <div className="relative flex-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-lg">
              <div className="h-full overflow-auto">
                <table className="w-full border-collapse text-left text-sm text-slate-400">
                  <thead className="sticky top-0 z-10 bg-slate-900 text-xs font-bold text-slate-200 shadow-sm">
                    <tr>
                      {/* Status Column */}
                      <th className="sticky left-0 z-20 w-20 border-b border-slate-700 bg-slate-900 px-3 py-3 text-center">
                        <span className="sr-only">Source</span>
                      </th>
                      {/* Headers */}
                      {[...headers].map((header, colIndex) => (
                        <th
                          key={colIndex}
                          onDoubleClick={() =>
                            startEditing(0, colIndex, header)
                          }
                          className={cn(
                            "cursor-pointer border-b border-slate-700 px-6 py-3 tracking-wider whitespace-nowrap hover:bg-slate-800",
                            !getCellHighlightClass(0, colIndex) &&
                              (colIndex % 2 === 0
                                ? "bg-slate-900"
                                : "bg-slate-800"),
                            getCellHighlightClass(0, colIndex),
                            editingCell?.rowIndex === 0 &&
                              editingCell?.colIndex === colIndex &&
                              "p-0",
                          )}
                        >
                          {editingCell?.rowIndex === 0 &&
                          editingCell?.colIndex === colIndex ? (
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
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {bodyRows.map((row, rIndex) => {
                      const rowIndex = rIndex + 1;
                      const rowSource = rowSources[rowIndex];
                      const isRowQuoting = quotingRowIndices.includes(rowIndex);
                      return (
                        <tr key={rowIndex}>
                          {/* Status Cell */}
                          <td className="sticky left-0 z-10 border-b border-slate-700 bg-slate-900/95 px-3 py-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {rowSource && (
                                <button
                                  onClick={() => setViewingSource(rowSource)}
                                  className="cursor-pointer text-slate-500 transition-colors hover:text-emerald-400"
                                  title="View Source Citation"
                                >
                                  <BookIcon className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleSingleRowQuote(rowIndex)}
                                disabled={isRowQuoting}
                                className={cn(
                                  "cursor-pointer rounded p-1 transition-colors hover:bg-slate-700",
                                  isRowQuoting
                                    ? "cursor-not-allowed opacity-50"
                                    : "text-slate-500 hover:text-emerald-400",
                                )}
                                title="Quote this row"
                              >
                                {isRowQuoting ? (
                                  <span className="block h-4 w-4 animate-spin rounded-full border-2 border-emerald-500/50 border-t-emerald-400" />
                                ) : (
                                  <BanknotesIcon className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </td>
                          {/* Data Cells */}
                          {[...row].map((cell, colIndex) => (
                            <td
                              key={colIndex}
                              onDoubleClick={() =>
                                startEditing(rowIndex, colIndex, cell)
                              }
                              className={cn(
                                "relative min-w-25 cursor-pointer px-6 py-4 font-medium whitespace-nowrap text-slate-300",
                                !getCellHighlightClass(rowIndex, colIndex) &&
                                  (colIndex % 2 !== 0 ? "bg-slate-700/20" : ""),
                                getCellHighlightClass(rowIndex, colIndex),
                                "transition-colors",
                                editingCell?.rowIndex === rowIndex &&
                                  editingCell?.colIndex === colIndex &&
                                  "p-0",
                              )}
                            >
                              {editingCell?.rowIndex === rowIndex &&
                              editingCell?.colIndex === colIndex ? (
                                <input
                                  autoFocus
                                  type="text"
                                  value={tempValue}
                                  onChange={(e) => setTempValue(e.target.value)}
                                  onBlur={saveEdit}
                                  onKeyDown={handleInputKeyDown}
                                  className="h-full w-full rounded border-2 border-blue-500 bg-slate-600 px-2 py-1.5 text-white outline-none"
                                />
                              ) : String(cell ?? "") === "" ? (
                                <span className="absolute top-1 left-1 text-[10px] leading-none text-slate-400 italic opacity-60 select-none">
                                  Empty
                                </span>
                              ) : (
                                String(cell)
                              )}
                            </td>
                          ))}
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

        {/* Right: Chat */}
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

      {/* Reset Modal */}
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

      {/* 3. CITATION MODAL */}
      {viewingSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-2xl">
            <button
              onClick={() => setViewingSource(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <XIcon className="h-5 w-5" />
            </button>

            <div className="mb-4 flex items-center gap-2">
              <BookIcon className="h-5 w-5 text-emerald-400" />
              <h3 className="text-lg font-bold text-slate-100">
                {viewingSource.citation.type === "api"
                  ? "Endpoint Source"
                  : "Source Citation"}
              </h3>
            </div>

            <div className="space-y-4 text-sm">
              {/* Field 1: Source Name */}
              <div className="rounded border border-slate-700 bg-slate-900 p-3">
                <span className="mb-1 block text-xs tracking-wider text-slate-500 uppercase">
                  {viewingSource.citation.type === "api"
                    ? "Endpoint"
                    : "Document"}
                </span>
                <span className="font-medium text-emerald-400">
                  {viewingSource.fileName ||
                    (viewingSource.citation.type === "api"
                      ? viewingSource.citation.endpoint
                      : "Unknown")}
                </span>
              </div>

              {/* Field 1.5: URL (New) */}
              {viewingSource.citation.type === "api" &&
                viewingSource.citation.url && (
                  <div className="rounded border border-slate-700 bg-slate-900 p-3">
                    <span className="mb-1 block text-xs tracking-wider text-slate-500 uppercase">
                      Source Link
                    </span>
                    <a
                      href={viewingSource.citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-blue-400 underline hover:text-blue-300"
                    >
                      {viewingSource.citation.url}
                    </a>
                  </div>
                )}

              {/* Field 2: Location (Conditional) */}
              {viewingSource.citation.type !== "api" && (
                <div className="rounded border border-slate-700 bg-slate-900 p-3">
                  <span className="mb-1 block text-xs tracking-wider text-slate-500 uppercase">
                    Location
                  </span>
                  <span className="text-slate-300">
                    {viewingSource.citation.type === "spreadsheet"
                      ? viewingSource.citation.location
                      : `Page ${viewingSource.citation.page}`}
                  </span>
                </div>
              )}

              {/* Field 3: Evidence (Quote or Reasoning) */}
              <div className="rounded border border-slate-700 bg-slate-900 p-3">
                <span className="mb-1 block text-xs tracking-wider text-slate-500 uppercase">
                  {viewingSource.citation.type === "document"
                    ? "Quote / Context"
                    : "Reasoning"}
                </span>
                <blockquote className="border-l-2 border-slate-600 py-1 pl-3 text-slate-300 italic">
                  "
                  {viewingSource.citation.type === "document"
                    ? viewingSource.citation.quote
                    : viewingSource.citation.reasoning}
                  "
                </blockquote>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setViewingSource(null)}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
