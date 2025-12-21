import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { cn } from "~/utils/cn";
import {
  PaperClipIcon,
  SendIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
} from "./icons";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const DEFAULT_MODEL = "gemini-2.0-flash";

// --- Types ---
type ChatMessage = {
  id: string;
  role: "user" | "model" | "system"; // UPDATED: Added 'system' role
  text: string;
  attachments?: { name: string; type: string }[];
  isError?: boolean;
};

// --- Helpers ---
const isTextFile = (file: File) => {
  const textTypes = [
    "text/",
    "application/json",
    "application/javascript",
    "application/xml",
  ];
  const textExtensions = [
    ".csv",
    ".txt",
    ".md",
    ".html",
    ".css",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".json",
  ];
  return (
    textTypes.some((t) => file.type.startsWith(t)) ||
    textExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
  );
};

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
  onDataUpdate?: (newData: unknown[][]) => void;
  onClose?: () => void;
}

const GeminiChat = ({
  className,
  data,
  onDataUpdate,
  onClose,
}: GeminiChatProps) => {
  // --- State ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  // Model Management State
  const [availableModels, setAvailableModels] = useState<string[]>([
    DEFAULT_MODEL,
  ]);
  const [currentModel, setCurrentModel] = useState<string>(DEFAULT_MODEL);
  const [failedModels, setFailedModels] = useState<string[]>([]);
  // Removed 'retryLog' state, we will use 'messages' instead.

  const [selectedFiles, setSelectedFiles] = useState<
    { file: File; base64: string; textContent?: string }[]
  >([]);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // 1. Fetch Models
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

          generateModels.sort((a: string, b: string) =>
            a === DEFAULT_MODEL ? -1 : b === DEFAULT_MODEL ? 1 : 0,
          );
          setAvailableModels(generateModels);
          if (generateModels.length > 0) setCurrentModel(generateModels[0]);
        }
      } catch (error) {
        console.error("Error listing models:", error);
      }
    }
    listAllModels();
  }, []);

  // --- Handlers ---

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    try {
      const newFiles = await Promise.all(
        files.map(async (file) => {
          const base64 = await readFileAsBase64(file);
          let textContent: string | undefined;
          if (isTextFile(file)) {
            textContent = await readFileAsText(file);
          }
          return { file, base64, textContent };
        }),
      );
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    } catch (err) {
      console.error(err);
    }
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearChat = () => {
    setMessages([]);
    setPrompt("");
    setSelectedFiles([]);
    setFailedModels([]);
  };

  // --- RECURSIVE RETRY LOGIC ---
  const tryGenerateContent = async (
    modelName: string,
    systemInstruction: string,
    contents: Content[],
    currentFailedList: string[],
  ): Promise<string> => {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction,
    });

    try {
      const result = await model.generateContent({ contents });
      const responseText = result.response.text();

      // Success! Update current model
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
        // UPDATED: Push a "system" message to the chat history
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "system",
            text: `⚠️ Model ${modelName} failed. Switching to ${nextModel}...`,
          },
        ]);

        return tryGenerateContent(
          nextModel,
          systemInstruction,
          contents,
          newFailedList,
        );
      } else {
        setFailedModels(newFailedList);
        throw new Error("All available models failed.");
      }
    }
  };

  const handleSendMessage = async () => {
    if (!prompt && selectedFiles.length === 0) return;

    // 1. Add User Message
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
      // 2. Prepare Context
      let systemInstruction = `You are an AI assistant integrated into a spreadsheet editor.`;

      if (data && data.length > 0) {
        systemInstruction += `\n\nCURRENT SPREADSHEET DATA (First 500 rows):\n${JSON.stringify(data.slice(0, 500))}`;
      }

      systemInstruction += `\n\nINSTRUCTIONS:
      1. Answer questions based on the data provided above and the conversation history.
      2. If asked to MODIFY the data, return the COMPLETE updated dataset wrapped in a 'json_update' code block.
      Example:
      \`\`\`json_update
      [["Name", "Email"], ["Alice", "alice@test.com"]]
      \`\`\`
      `;

      // 3. Convert History (Filter out system messages so AI doesn't get confused)
      const historyContents: Content[] = messages
        .filter((msg) => msg.role !== "system")
        .map((msg) => ({
          role: msg.role as "user" | "model",
          parts: [{ text: msg.text }],
        }));

      // 4. New Message Content
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

      if (userMessage.text) {
        currentParts.push({ text: userMessage.text });
      }

      const fullContents = [
        ...historyContents,
        { role: "user" as const, parts: currentParts },
      ];

      // 5. Call API
      const responseText = await tryGenerateContent(
        currentModel,
        systemInstruction,
        fullContents,
        failedModels,
      );

      // 6. Handle Updates
      let finalResponseText = responseText;
      const updateMatch = responseText.match(
        /```json_update\s*([\s\S]*?)\s*```/,
      );

      if (updateMatch && updateMatch[1]) {
        try {
          const newData = JSON.parse(updateMatch[1]);
          if (Array.isArray(newData) && onDataUpdate) {
            onDataUpdate(newData);
            finalResponseText = responseText.replace(
              updateMatch[0],
              "\n\n✅ *I have updated the spreadsheet data as requested.*",
            );
          }
        } catch (e) {
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
          text: "Sorry, I encountered an error connecting to the AI. All available models may be busy or the API key is invalid.",
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
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
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700 p-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-bold text-slate-100">Gemini</h2>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="mr-2 cursor-pointer rounded p-1 text-slate-400 hover:bg-red-900/30 hover:text-red-400"
              title="Clear Chat History"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}

          <select
            value={currentModel}
            onChange={(e) => setCurrentModel(e.target.value)}
            className="max-w-32 truncate rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-300 focus:border-blue-500 focus:outline-none"
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

          {onClose && (
            <button
              onClick={onClose}
              className="ml-2 cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mt-8 text-center text-sm text-slate-500">
            <p>Ask questions about your data or attach files for analysis.</p>
          </div>
        )}

        {messages.map((msg) => {
          // Render SYSTEM MESSAGES differently
          if (msg.role === "system") {
            return (
              <div key={msg.id} className="flex w-full justify-center">
                <span className="rounded-full border border-orange-900/30 bg-orange-900/20 px-3 py-1 text-[11px] font-medium text-orange-400">
                  {msg.text}
                </span>
              </div>
            );
          }

          // Render USER/MODEL messages
          return (
            <div
              key={msg.id}
              className={cn(
                "flex w-full flex-col gap-1",
                msg.role === "user" ? "items-end" : "items-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[90%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : msg.isError
                      ? "border border-red-800 bg-red-900/50 text-red-200"
                      : "bg-slate-700 text-slate-200",
                )}
              >
                {msg.text}
              </div>

              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {msg.attachments.map((att, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 rounded bg-slate-900/50 px-1.5 py-0.5 text-[10px] text-slate-400"
                    >
                      <PaperClipIcon className="h-3 w-3" />
                      {att.name}
                    </span>
                  ))}
                </div>
              )}

              <span className="text-[10px] text-slate-500 capitalize">
                {msg.role === "model" ? "Gemini" : "You"}
              </span>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-start">
            <div className="flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-2">
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400"></span>
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-100"></span>
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-200"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 border-t border-slate-700 bg-slate-800 p-4">
        {selectedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {selectedFiles.map((fileObj, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-md border border-emerald-800 bg-emerald-900/20 px-2 py-1"
              >
                <span className="max-w-[120px] truncate text-xs font-medium text-emerald-300">
                  {fileObj.file.name}
                </span>
                <button
                  onClick={() => removeFile(index)}
                  className="cursor-pointer rounded-full p-0.5 text-emerald-400 hover:bg-emerald-900/50 hover:text-white"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="w-full resize-none rounded-lg border border-slate-600 bg-slate-900 py-3 pr-24 pl-3 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            style={{ minHeight: "46px" }}
          />

          <div className="absolute right-2 bottom-1.5 flex items-center gap-1">
            <input
              type="file"
              multiple
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              title="Attach File"
            >
              <PaperClipIcon className="h-4 w-4" />
            </button>
            <button
              onClick={handleSendMessage}
              disabled={loading || (!prompt && selectedFiles.length === 0)}
              className={cn(
                "rounded p-1.5 transition-colors",
                loading || (!prompt && selectedFiles.length === 0)
                  ? "cursor-not-allowed text-slate-600"
                  : "bg-blue-600 text-white hover:bg-blue-500",
              )}
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeminiChat;
