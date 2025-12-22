import {
  GoogleGenAI,
  type Content,
  type GenerateContentConfig,
  type Tool,
} from "@google/genai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
export const DEFAULT_MODEL = "gemini-2.0-flash";

// 1. Export a helper to check if AI is usable
export const isAiEnabled = !!(API_KEY && API_KEY.trim().length > 0);

// 2. Safely initialize the client
let ai: GoogleGenAI | null = null;
if (isAiEnabled) {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  } catch (error) {
    console.error("Failed to initialize Gemini client:", error);
  }
}

export async function fetchAvailableModels(): Promise<string[]> {
  // If AI isn't enabled, just return the default so the UI doesn't break
  if (!isAiEnabled) return [DEFAULT_MODEL];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`,
    );
    if (!response.ok) {
      // Handle invalid key response gracefully
      console.warn("Failed to fetch models, using default.");
      return [DEFAULT_MODEL];
    }

    const data = await response.json();
    if (data.models) {
      const models = data.models
        .filter((m: any) =>
          m.supportedGenerationMethods.includes("generateContent"),
        )
        .map((m: any) => m.name.replace("models/", ""));

      return models.sort((a: string, b: string) =>
        a === DEFAULT_MODEL ? -1 : b === DEFAULT_MODEL ? 1 : 0,
      );
    }
    return [DEFAULT_MODEL];
  } catch (error) {
    console.error("Error listing models:", error);
    return [DEFAULT_MODEL];
  }
}

export async function generateContentWithFallback(
  startModel: string,
  availableModels: string[],
  systemInstruction: string,
  contents: Content[],
  onRetry?: (failedModel: string, nextModel: string) => void,
  config: GenerateContentConfig = {},
  tools: Tool[] = [],
): Promise<{ text: string; finalModel: string }> {
  // Guard clause: Fail fast if no AI
  if (!ai) {
    throw new Error("AI is not configured. Please check your .env file.");
  }

  const getNextModel = (current: string, excluded: string[]) => {
    const idx = availableModels.indexOf(current);
    const next = availableModels
      .slice(idx + 1)
      .find((m) => !excluded.includes(m));
    return next;
  };

  const attempt = async (
    modelName: string,
    failedList: string[],
  ): Promise<{ text: string; finalModel: string }> => {
    try {
      // @ts-ignore - 'ai' is checked above, but TS might not infer it inside the async closure
      const result = await ai!.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          ...config,
          systemInstruction: systemInstruction,
          tools: tools,
        },
      });

      const text = result.text || "";
      return { text, finalModel: modelName };
    } catch (err) {
      console.warn(`Model ${modelName} failed:`, err);
      const newFailedList = [...failedList, modelName];
      const nextModel = getNextModel(modelName, newFailedList);

      if (nextModel) {
        if (onRetry) onRetry(modelName, nextModel);
        return attempt(nextModel, newFailedList);
      } else {
        throw new Error("AI Request failed. Check your API Key or connection.");
      }
    }
  };

  return attempt(startModel, []);
}
