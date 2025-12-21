import { type Content } from "@google/generative-ai";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useGemini } from "~/hooks/useGemini"; // NEW
import { cn } from "~/utils/cn";
import { generateContentWithFallback } from "~/utils/geminiApi"; // NEW
import { SparklesIcon, TrashIcon, XIcon } from "./icons";
import ModelSelector from "./ModelSelector"; // NEW

// ... (Keep types and file helpers: ChatMessage, isTextFile, readFileAsBase64, readFileAsText) ...
type ChatMessage = {
  id: string;
  role: "user" | "model" | "system";
  text: string;
  attachments?: { name: string; type: string }[];
  isError?: boolean;
};

// Paste helpers here if needed, or import them. Assuming they are in the file:
const isTextFile = (file: File) => {
  /*...*/ return false;
}; // Use your existing helper code
const readFileAsBase64 = (file: File): Promise<string> => {
  /*...*/ return Promise.resolve("");
}; // Use existing
const readFileAsText = (file: File): Promise<string> => {
  /*...*/ return Promise.resolve("");
}; // Use existing

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  // Use the Hook!
  const { availableModels, currentModel, setCurrentModel } = useGemini();

  const [selectedFiles, setSelectedFiles] = useState<
    { file: File; base64: string; textContent?: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ... (Keep handleFileSelect, removeFile, handleClearChat) ...

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    // ... same as before
  };
  const removeFile = (index: number) => {
    // ... same as before
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
      if (data && data.length > 0) {
        systemInstruction += `\n\nCURRENT SPREADSHEET DATA (First 500 rows):\n${JSON.stringify(data.slice(0, 500))}`;
      }
      systemInstruction += `\n\nINSTRUCTIONS: 1. Answer questions based on data. 2. If modifying, return 'json_update' block.`;

      const historyContents: Content[] = messages
        .filter((msg) => msg.role !== "system")
        .map((msg) => ({
          role: msg.role as "user" | "model",
          parts: [{ text: msg.text }],
        }));

      const currentParts: any[] = [];
      filesToSend.forEach((f) => {
        if (f.textContent)
          currentParts.push({
            text: `\n[FILE CONTENT: ${f.file.name}]\n${f.textContent}\n[END FILE]\n`,
          });
        else
          currentParts.push({
            inlineData: {
              data: f.base64,
              mimeType: f.file.type || "application/octet-stream",
            },
          });
      });
      if (userMessage.text) currentParts.push({ text: userMessage.text });

      const fullContents = [
        ...historyContents,
        { role: "user" as const, parts: currentParts },
      ];

      // USE SHARED API FUNCTION
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
      );

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
          text: "Sorry, I encountered an error. All models may be busy.",
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ... (Keep rest of UI, replacing the old <select> with <ModelSelector />) ...

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-lg border border-slate-700 bg-slate-800 shadow-lg",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700 p-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-bold text-slate-100">Gemini</h2>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button onClick={handleClearChat}>
              <TrashIcon className="h-4 w-4" />
            </button>
          )}

          {/* NEW SELECTOR */}
          <ModelSelector
            models={availableModels}
            selectedModel={currentModel}
            onSelect={setCurrentModel}
            disabled={loading}
          />

          {onClose && (
            <button onClick={onClose}>
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {/* ... (Rest of UI is identical to previous version) ... */}
    </div>
  );
};

export default GeminiChat;
