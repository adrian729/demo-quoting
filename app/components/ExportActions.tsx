import { useEffect, useState } from "react";
import {
  SUPPORTED_EXPORT_TYPES,
  type SupportedExportType,
  isOfTypeSupportedExportType,
  saveToExcel,
} from "~/utils/excelUtils";
import { DownloadIcon } from "./icons";

interface ExportActionsProps {
  data: unknown[][];
  fileName: string;
  onFileNameChange: (newName: string) => void;
  initialFormat?: SupportedExportType;
}

const ExportActions = ({
  data,
  fileName,
  onFileNameChange,
  initialFormat = "xlsx",
}: ExportActionsProps) => {
  const [format, setFormat] = useState<SupportedExportType>(initialFormat);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(fileName);

  useEffect(() => {
    setTempName(fileName);
  }, [fileName]);

  useEffect(() => {
    setFormat(initialFormat);
  }, [initialFormat]);

  const saveName = () => {
    setIsEditingName(false);
    if (tempName.trim()) {
      onFileNameChange(tempName.trim());
    } else {
      setTempName(fileName); // Revert if empty
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") saveName();
    if (e.key === "Escape") {
      setIsEditingName(false);
      setTempName(fileName);
    }
  };

  if (!data || data.length === 0) return null;

  return (
    <div className="ml-auto flex items-center gap-2">
      {/* Filename Editor */}
      <div className="flex items-center justify-end">
        {isEditingName ? (
          <input
            autoFocus
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            onBlur={saveName}
            onKeyDown={handleKeyDown}
            className="w-40 rounded border border-blue-500 bg-slate-800 px-2 py-1 text-right text-sm text-white outline-none"
          />
        ) : (
          <span
            onDoubleClick={() => setIsEditingName(true)}
            title="Double click to rename"
            className="cursor-text truncate px-2 py-1 text-sm font-medium text-slate-300 transition-colors hover:text-white"
          >
            {fileName || "untitled"}
          </span>
        )}
        <span className="text-slate-500">.</span>
      </div>

      {/* Styled Dropdown */}
      <div className="group relative">
        <select
          value={format}
          onChange={(e) => {
            const val = e.target.value;
            if (isOfTypeSupportedExportType(val)) setFormat(val);
          }}
          className="cursor-pointer appearance-none rounded py-1 pr-7 pl-2 text-sm font-bold text-slate-300 uppercase transition-colors hover:bg-slate-800 hover:text-white focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
        >
          {SUPPORTED_EXPORT_TYPES.map((option) => (
            <option key={option} value={option} className="text-slate-900">
              {option.toUpperCase()}
            </option>
          ))}
        </select>
        {/* Custom Chevron Arrow */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1 text-slate-500 transition-colors group-hover:text-white">
          <svg
            className="h-4 w-4 fill-current"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
          >
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
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

export default ExportActions;
