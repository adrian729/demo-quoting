import { GoogleGenerativeAI } from "@google/generative-ai";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { cn } from "~/utils/cn";
import { PaperClipIcon, SendIcon, SparklesIcon, XIcon } from "./icons";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const DEFAULT_MODEL = "gemini-2.0-flash";

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(",")[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

interface GeminiChatProps {
  className?: string;
  data?: unknown[][];
  onDataUpdate?: (newData: unknown[][]) => void;
  onClose?: () => void; // Added Prop
}

const GeminiChat = ({
  className,
  data,
  onDataUpdate,
  onClose,
}: GeminiChatProps) => {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Model Management
  const [availableModels, setAvailableModels] = useState<string[]>([
    DEFAULT_MODEL,
  ]);
  const [currentModel, setCurrentModel] = useState<string>(DEFAULT_MODEL);
  const [failedModels, setFailedModels] = useState<string[]>([]);

  const [retryLog, setRetryLog] = useState<string[]>([]);

  // File State
  const [selectedFile, setSelectedFile] = useState<{
    file: File;
    base64: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch Models on Mount
  useEffect(() => {
    async function listAllModels() {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`,
        );
        const data = await response.json();

        if (data.models) {
          const generateModels = data.models
            .filter((m: any) =>
              m.supportedGenerationMethods.includes("generateContent"),
            )
            .map((m: any) => m.name.replace("models/", ""));

          generateModels.sort((a: string, b: string) => {
            if (a === DEFAULT_MODEL) return -1;
            if (b === DEFAULT_MODEL) return 1;
            return 0;
          });

          setAvailableModels(generateModels);
          if (generateModels.length > 0) {
            setCurrentModel(generateModels[0]);
          }
        }
      } catch (error) {
        console.error("Error listing models:", error);
      }
    }
    listAllModels();
  }, []);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    setError("");
    try {
      const base64 = await readFileAsBase64(file);
      setSelectedFile({ file, base64 });
    } catch (err) {
      console.error(err);
      setError("Failed to read file.");
    }
    e.target.value = "";
  };

  const clearFile = () => setSelectedFile(null);

  // 2. Recursive Generation Logic
  const tryGenerateContent = async (
    modelName: string,
    parts: any[],
    currentFailedList: string[],
  ): Promise<string> => {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });

    try {
      const result = await model.generateContent(parts);
      const responseText = result.response.text();

      setCurrentModel(modelName);
      setFailedModels(currentFailedList);

      return responseText;
    } catch (err) {
      console.warn(`Model ${modelName} failed:`, err);

      const newFailedList = [...currentFailedList, modelName];
      const nextModelIndex = availableModels.indexOf(modelName) + 1;
      const nextModel = availableModels
        .slice(nextModelIndex)
        .find((m) => !newFailedList.includes(m));

      if (nextModel) {
        setRetryLog((prev) => [
          ...prev,
          `${modelName} failed → switching to ${nextModel}`,
        ]);
        return tryGenerateContent(nextModel, parts, newFailedList);
      } else {
        setFailedModels(newFailedList);
        throw new Error("All available models failed.");
      }
    }
  };

  const fetchResponse = async () => {
    if (!prompt && !selectedFile) return;

    setLoading(true);
    setError("");
    setResponse("");
    setRetryLog([]);

    const parts: any[] = [];
    let systemInstruction = `You are an AI assistant integrated into a spreadsheet editor.`;

    if (data && data.length > 0) {
      systemInstruction += `
      \n\nCURRENT SPREADSHEET DATA (JSON Array of Arrays):
      ${JSON.stringify(data.slice(0, 500))} 
      (Note: Only the first 500 rows are shown to you to save context)

      INSTRUCTIONS:
      1. Answer questions based on the JSON above.
      2. If asked to MODIFY data, return the COMPLETE updated dataset wrapped in a 'json_update' code block.
      Example:
      \`\`\`json_update
      [["Name", "Email"], ["Alice", "alice@test.com"]]
      \`\`\`
      `;
    }

    if (selectedFile) {
      parts.push({
        inlineData: {
          data: selectedFile.base64,
          mimeType: selectedFile.file.type || "text/plain",
        },
      });
    }

    parts.push({ text: `${systemInstruction}\n\nUser Question: ${prompt}` });

    try {
      const text = await tryGenerateContent(currentModel, parts, failedModels);

      const updateMatch = text.match(/```json_update\s*([\s\S]*?)\s*```/);
      if (updateMatch && updateMatch[1]) {
        try {
          const newData = JSON.parse(updateMatch[1]);
          if (Array.isArray(newData) && onDataUpdate) {
            onDataUpdate(newData);
            setResponse(
              text.replace(
                updateMatch[0],
                "\n\n✅ *Data successfully updated in the table!*",
              ),
            );
          } else {
            setResponse(text);
          }
        } catch (e) {
          setResponse(
            text +
              "\n\n⚠️ *Attempted to update data but failed to parse JSON.*",
          );
        }
      } else {
        setResponse(text);
      }
    } catch (err) {
      console.error("Gemini API Error:", err);
      setError("Failed to generate response. All models may be busy.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-lg border border-slate-700 bg-slate-800 shadow-lg",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 p-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-bold text-slate-100">Gemini</h2>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={currentModel}
            onChange={(e) => setCurrentModel(e.target.value)}
            className="max-w-35 truncate rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-300 focus:border-blue-500 focus:outline-none"
            disabled={loading}
          >
            {availableModels.map((model) => {
              const isFailed = failedModels.includes(model);
              return (
                <option key={model} value={model} disabled={isFailed}>
                  {model} {isFailed ? "(Failed)" : ""}
                </option>
              );
            })}
          </select>

          {/* Close Button */}
          {onClose && (
            <button
              onClick={onClose}
              className="ml-2 cursor-pointer rounded p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
              title="Close Chat"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {selectedFile && (
          <div className="flex items-center justify-between rounded-md border border-emerald-800 bg-emerald-900/20 px-3 py-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-sm font-semibold text-emerald-400">
                Attached:
              </span>
              <span className="max-w-30 truncate text-sm text-emerald-300">
                {selectedFile.file.name}
              </span>
            </div>
            <button
              onClick={clearFile}
              className="ml-2 rounded-full p-1 text-emerald-400 hover:bg-emerald-900/50"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {retryLog.length > 0 && (
          <div className="flex flex-col gap-1">
            {retryLog.map((log, idx) => (
              <div
                key={idx}
                className="rounded border border-red-900/30 bg-red-900/10 px-2 py-1 text-[10px] font-medium text-red-400"
              >
                ⚠️ {log}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-900/50 bg-red-900/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {response && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <strong className="block text-xs tracking-wider text-blue-400 uppercase">
                Response
              </strong>
              <span className="text-[10px] text-slate-500">
                Model: {currentModel}
              </span>
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-slate-300">
              {response}
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="rounded-b-lg border-t border-slate-700 bg-slate-800 p-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            data ? "Ask to filter or edit data..." : "Ask a question..."
          }
          rows={3}
          className="mb-3 w-full resize-none rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />

        <div className="flex items-center justify-between">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
          >
            <PaperClipIcon className="h-5 w-5" />
          </button>

          <button
            onClick={fetchResponse}
            disabled={loading || (!prompt && !selectedFile)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all",
              loading || (!prompt && !selectedFile)
                ? "cursor-not-allowed bg-slate-600 text-slate-400"
                : "bg-blue-600 shadow-sm hover:bg-blue-500 active:scale-95",
            )}
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-white"></span>
            ) : (
              <>
                <SendIcon className="h-4 w-4" />
                Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeminiChat;
