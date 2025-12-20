import { GoogleGenerativeAI } from "@google/generative-ai";
import { useRef, useState, type ChangeEvent } from "react";
import { cn } from "~/utils/cn";

// --- Icons ---
const SparklesIcon = ({ className }: { className?: string }) => (
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
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const SendIcon = ({ className }: { className?: string }) => (
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
      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
    />
  </svg>
);

const PaperClipIcon = ({ className }: { className?: string }) => (
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
      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
    />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
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
      d="M6 18L18 6M6 6l12 12"
    />
  </svg>
);

// Helper to read file as Base64
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
  data?: unknown[][]; // Current table data
  onDataUpdate?: (newData: unknown[][]) => void; // Function to update table
}

const GeminiChat = ({ className, data, onDataUpdate }: GeminiChatProps) => {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedFile, setSelectedFile] = useState<{
    file: File;
    base64: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

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

  const clearFile = () => {
    setSelectedFile(null);
  };

  const fetchResponse = async () => {
    if (!prompt && !selectedFile) return;

    setLoading(true);
    setError("");
    setResponse("");

    try {
      const genAI = new GoogleGenerativeAI(API_KEY);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
      });

      const parts: any[] = [];

      // 1. Construct the System Prompt with Data Context
      let systemInstruction = `You are an AI assistant integrated into a spreadsheet editor.`;

      if (data && data.length > 0) {
        systemInstruction += `
        \n\nCURRENT SPREADSHEET DATA (JSON Array of Arrays):
        ${JSON.stringify(data.slice(0, 500))} 
        (Note: Only the first 500 rows are shown to you to save context)

        INSTRUCTIONS:
        1. If the user asks a question about the data, answer based on the JSON above.
        2. If the user asks to MODIFY the data (e.g., "Add a column", "Delete row 1", "Make all emails lowercase"), you MUST return the COMPLETE updated dataset.
        3. To update the data, you must wrap the new JSON 2D array strictly inside a code block labeled 'json_update'.
        
        Example of update response:
        "I have updated the emails to lowercase.
        \`\`\`json_update
        [["Name", "Email"], ["Alice", "alice@test.com"]]
        \`\`\`"
        
        4. Do NOT use the 'json_update' block unless you are actually changing the data.
        `;
      }

      // Add file if attached (image/pdf context)
      if (selectedFile) {
        parts.push({
          inlineData: {
            data: selectedFile.base64,
            mimeType: selectedFile.file.type || "text/plain",
          },
        });
      }

      // Add the user prompt combined with system instruction
      // (Gemini API treats the first part as context often, or we can just prepend it)
      parts.push({ text: `${systemInstruction}\n\nUser Question: ${prompt}` });

      const result = await model.generateContent(parts);
      const text = result.response.text();

      // --- Parse for Data Updates ---
      const updateMatch = text.match(/```json_update\s*([\s\S]*?)\s*```/);

      if (updateMatch && updateMatch[1]) {
        try {
          const newData = JSON.parse(updateMatch[1]);
          if (Array.isArray(newData) && onDataUpdate) {
            onDataUpdate(newData);
            // Remove the JSON block from the displayed response to keep it clean
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
          console.error("Failed to parse AI update:", e);
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
      setError("Failed to generate response.");
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
      <div className="flex items-center gap-2 border-b border-slate-700 p-4">
        <SparklesIcon className="h-5 w-5 text-blue-400" />
        <h2 className="text-lg font-bold text-slate-100">Gemini Assistant</h2>
      </div>

      {/* Content Area */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {selectedFile && (
          <div className="flex items-center justify-between rounded-md border border-emerald-800 bg-emerald-900/20 px-3 py-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-sm font-semibold text-emerald-400">
                Attached:
              </span>
              <span className="max-w-[150px] truncate text-sm text-emerald-300">
                {selectedFile.file.name}
              </span>
            </div>
            <button
              onClick={clearFile}
              className="ml-2 rounded-full p-1 text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-200"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-900/50 bg-red-900/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {response && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
            <strong className="mb-2 block text-xs tracking-wider text-blue-400 uppercase">
              Response
            </strong>
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
            data
              ? "Ask to filter, sort, or edit the table..."
              : "Ask a question..."
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
            title="Upload File"
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
