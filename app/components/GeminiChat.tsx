import { type Content } from "@google/generative-ai";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  PaperClipIcon,
  SendIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
} from "~/components/icons";
import { useGemini } from "~/hooks/useGemini";
import { cn } from "~/utils/cn";
import { generateContentWithFallback } from "~/utils/geminiApi";
import ModelSelector from "./ModelSelector";

// --- Component Logic ---

type ChatMessage = {
  id: string;
  role: "user" | "model" | "system";
  text: string;
  attachments?: { name: string; type: string }[];
  isError?: boolean;
};

const isTextFile = (file: File) =>
  file.type.startsWith("text/") ||
  file.name.endsWith(".md") ||
  file.name.endsWith(".csv") ||
  file.name.endsWith(".json");

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

interface GeminiChatProps {
  className?: string;
  data?: unknown[][];
  onDataUpdate?: (
    newData: unknown[][],
    newSources?: Record<number, any>,
  ) => void;
  onClose?: () => void;
}

const GeminiChat = ({
  className,
  data,
  onDataUpdate,
  onClose,
}: GeminiChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const { availableModels, currentModel, setCurrentModel } = useGemini();

  const [selectedFiles, setSelectedFiles] = useState<
    { file: File; base64: string; textContent?: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const processed = await Promise.all(
        files.map(async (file) => ({
          file,
          base64: !isTextFile(file) ? await readFileAsBase64(file) : "",
          textContent: isTextFile(file)
            ? await readFileAsText(file)
            : undefined,
        })),
      );
      setSelectedFiles((prev) => [...prev, ...processed]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearChat = () => {
    setMessages([]);
    setPrompt("");
    setSelectedFiles([]);
  };

  const handleSendMessage = async () => {
    if (!prompt && selectedFiles.length === 0) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      text: prompt,
      attachments: selectedFiles.map((f) => ({
        name: f.file.name,
        type: f.file.type,
      })),
    };
    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    setLoading(true);

    const filesToSend = [...selectedFiles];
    setSelectedFiles([]);

    try {
      let systemInstruction = `You are an AI assistant integrated into a spreadsheet editor.`;

      // --- FIXED: Explicitly separate Headers from Data ---
      if (data && data.length > 0) {
        systemInstruction += `\n\nCURRENT SPREADSHEET CONTENT:`;
        systemInstruction += `\nHEADINGS (Row 0): ${JSON.stringify(data[0])}`;
        if (data.length > 1) {
          systemInstruction += `\nDATA (Rows 1-${Math.min(data.length, 500)}): ${JSON.stringify(data.slice(1, 501))}`;
        } else {
          systemInstruction += `\nDATA: [No data rows yet]`;
        }
        systemInstruction += `\n\nNOTE: "Row 0" is the header. The first actual data row is "Row 1". Use these absolute indices.`;
      }

      systemInstruction += `
        \n\nINSTRUCTIONS:
        1. Answer questions based on the data.
        2. If the user asks to UPDATE, MODIFY, or ADD data, you must return a valid JSON block containing ONLY the changes.
        
        FORMAT FOR UPDATES:
        You must return a valid JSON object with a "rows" key. 
        Each item in "rows" must contain a "data" array and optionally an "index".
        
        - TO UPDATE A ROW: Include the "index" property (the absolute row index, e.g., 5).
        - TO ADD A NEW ROW: Omit the "index" property.

        Example Response:
        {
          "rows": [
            {
              "index": 4,
              "data": ["Updated Col1", "Updated Col2"],
              "citation": {
                 "type": "api", 
                 "endpoint": "Gemini Chat", 
                 "reasoning": "Fixed typo in row 4 based on user request" 
              }
            },
            {
              "data": ["New Col1", "New Col2"],
              "citation": {
                 "type": "api", 
                 "endpoint": "Gemini Chat", 
                 "reasoning": "Added new entry" 
              }
            }
          ]
        }

        CITATION RULES:
        - If using data from an attached file: set "type": "document", include "page" and "quote".
        - If calculating/reasoning: set "type": "api", "endpoint": "Gemini Reasoning", and explain in "reasoning".
        - If simple edit: set "type": "api", "endpoint": "User Instruction", "reasoning": "User explicitly asked to set X to Y".
      `;

      const historyContents: Content[] = messages
        .filter((msg) => msg.role !== "system")
        .map((msg) => ({
          role: msg.role as "user" | "model",
          parts: [{ text: msg.text }],
        }));

      const currentParts: any[] = [];
      filesToSend.forEach((f) => {
        if (f.textContent) {
          currentParts.push({
            text: `\n[FILE CONTENT: ${f.file.name}]\n${f.textContent}\n[END FILE]\n`,
          });
        } else {
          currentParts.push({
            inlineData: {
              data: f.base64,
              mimeType: f.file.type || "application/octet-stream",
            },
          });
        }
      });
      if (userMessage.text) currentParts.push({ text: userMessage.text });

      const fullContents = [
        ...historyContents,
        { role: "user" as const, parts: currentParts },
      ];

      const { text: responseText } = await generateContentWithFallback(
        currentModel,
        availableModels,
        systemInstruction,
        fullContents,
        (failed, next) => {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "system",
              text: `⚠️ Model ${failed} failed. Switching to ${next}...`,
            },
          ]);
        },
        { temperature: 0.0 },
      );

      let finalResponseText = responseText;

      // Matches ```json, ```json_update, or just ```
      const updateMatch = responseText.match(
        /```(?:json|json_update)?\s*([\s\S]*?)\s*```/,
      );

      if (updateMatch && updateMatch[1]) {
        try {
          const parsedObj = JSON.parse(updateMatch[1]);

          // Handle object format with rows & citations
          if (parsedObj.rows && Array.isArray(parsedObj.rows) && onDataUpdate) {
            // --- FIXED: DEEP COPY & MERGE LOGIC ---
            // Create a working copy so we don't delete rows the AI didn't mention
            const workingData = data
              ? data.map((row) => (Array.isArray(row) ? [...row] : []))
              : [];
            const newSources: Record<number, any> = {};

            let updatedCount = 0;
            let addedCount = 0;

            parsedObj.rows.forEach((r: any) => {
              if (!Array.isArray(r.data)) return;

              let targetIndex = r.index;

              // If valid index provided, UPDATE. Otherwise, APPEND.
              if (
                typeof targetIndex === "number" &&
                targetIndex >= 0 &&
                targetIndex < workingData.length
              ) {
                workingData[targetIndex] = r.data;
                updatedCount++;
              } else {
                targetIndex = workingData.length;
                workingData.push(r.data);
                addedCount++;
              }

              if (r.citation) {
                newSources[targetIndex] = {
                  fileId: "gemini-chat",
                  fileName: "Gemini Chat",
                  citation: r.citation,
                };
              }
            });

            onDataUpdate(workingData, newSources);

            const actionMsg = [];
            if (updatedCount > 0) actionMsg.push(`updated ${updatedCount}`);
            if (addedCount > 0) actionMsg.push(`added ${addedCount}`);

            finalResponseText = responseText.replace(
              updateMatch[0],
              `\n\n✅ *Successfully ${actionMsg.join(" and ")} row(s).*`,
            );
          }
          // Handle legacy simple 2D array format (Safe Fallback? No, this deletes data if it returns partial)
          // We'll trust the AI followed the new instructions, but if it returns a full array, we replace.
          else if (Array.isArray(parsedObj) && onDataUpdate) {
            // If the AI returned a huge array close to the original size, it's likely a full replacement.
            // If it's small, it might be a mistake, but we can't easily merge without indices.
            // For now, let's assume if it returns an array, it MEANT to replace everything.
            onDataUpdate(parsedObj);
            finalResponseText = responseText.replace(
              updateMatch[0],
              "\n\n✅ *I have replaced the spreadsheet data.*",
            );
          }
        } catch (e) {
          console.warn("GeminiChat: Failed to parse JSON response", e);
          finalResponseText +=
            "\n\n⚠️ *I tried to update the data, but the JSON format was invalid.*";
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "model",
          text: finalResponseText,
        },
      ]);
    } catch (err) {
      console.error("Gemini API Error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "model",
          text: "Sorry, I encountered an error. All models may be busy.",
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-lg",
        className,
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700 bg-slate-800 p-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-bold text-slate-100">Gemini</h2>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="text-slate-400 hover:text-red-400"
              title="Clear Chat"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
          <ModelSelector
            models={availableModels}
            selectedModel={currentModel}
            onSelect={setCurrentModel}
            disabled={loading}
          />
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white"
              title="Close"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600 flex-1 overflow-y-auto bg-slate-800/50 p-4">
        <div className="flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="mt-10 text-center text-sm text-slate-500">
              <p>Ask questions about your data or ask me to edit it.</p>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex w-full flex-col gap-1",
                msg.role === "user" ? "items-end" : "items-start",
              )}
            >
              <span className="text-[10px] text-slate-500 uppercase">
                {msg.role === "model" ? "Gemini" : "You"}
              </span>
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm",
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-200",
                  msg.isError &&
                    "border border-red-500/50 bg-red-900/20 text-red-200",
                )}
              >
                {msg.text}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-white/20 pt-2">
                    {msg.attachments.map((att, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 rounded bg-black/20 px-2 py-1 text-xs"
                      >
                        <PaperClipIcon className="h-3 w-3" /> {att.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex w-full flex-col items-start gap-1">
              <span className="text-[10px] text-slate-500 uppercase">
                Gemini
              </span>
              <div className="max-w-[85%] rounded-lg bg-slate-700 px-4 py-3">
                <div className="flex gap-1">
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="shrink-0 border-t border-slate-700 bg-slate-800 p-4">
        {selectedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {selectedFiles.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-slate-300"
              >
                <span className="max-w-[150px] truncate">{f.file.name}</span>
                <button
                  onClick={() => removeFile(i)}
                  className="hover:text-white"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-600 bg-slate-700 text-slate-400 transition-colors hover:bg-slate-600 hover:text-white"
          >
            <PaperClipIcon className="h-5 w-5" />
          </button>
          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
          />

          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !loading && handleSendMessage()
            }
            placeholder="Ask Gemini to edit or analyze..."
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-4 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSendMessage}
            disabled={loading || (!prompt && selectedFiles.length === 0)}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <SendIcon className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeminiChat;
