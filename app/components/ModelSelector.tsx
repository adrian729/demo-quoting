import { cn } from "~/utils/cn";

interface ModelSelectorProps {
  models: string[];
  selectedModel: string;
  onSelect: (model: string) => void;
  className?: string;
  disabled?: boolean;
}

export default function ModelSelector({
  models,
  selectedModel,
  onSelect,
  className,
  disabled,
}: ModelSelectorProps) {
  return (
    <select
      value={selectedModel}
      onChange={(e) => onSelect(e.target.value)}
      disabled={disabled}
      className={cn(
        "max-w-35 truncate rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-300",
        "cursor-pointer hover:bg-slate-700 focus:border-blue-500 focus:outline-none",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      title="Select AI Model"
    >
      {models.map((model) => (
        <option key={model} value={model}>
          {model}
        </option>
      ))}
    </select>
  );
}
