import {
  GoogleGenAI,
  type Content,
  type GenerateContentConfig,
  type Tool,
} from "@google/genai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
export const DEFAULT_MODEL = "gemini-2.0-flash";

// Initialize the new client
const ai = new GoogleGenAI({ apiKey: API_KEY });

export async function fetchAvailableModels(): Promise<string[]> {
  try {
    // We can stick to the fetch implementation to ensure we get the exact list we expect,
    // or use ai.models.list() if preferred. For safety during migration, keeping the fetch
    // is reliable as it bypasses SDK method signature changes.
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`,
    );
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
      // The new SDK call structure
      const result = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          ...config,
          systemInstruction: systemInstruction,
          tools: tools,
        },
      });

      // In @google/genai, .text is a getter property, not a function
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
        throw new Error("All available models failed.");
      }
    }
  };

  return attempt(startModel, []);
}
