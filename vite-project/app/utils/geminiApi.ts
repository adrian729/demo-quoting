import {
  GoogleGenerativeAI,
  type Content,
  type GenerationConfig,
} from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
export const DEFAULT_MODEL = "gemini-2.0-flash";

export async function fetchAvailableModels(): Promise<string[]> {
  try {
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
  // NEW: Allow passing config
  config: GenerationConfig = {},
): Promise<{ text: string; finalModel: string }> {
  const genAI = new GoogleGenerativeAI(API_KEY);

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
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
        // APPLY CONFIG (Temperature, etc.)
        generationConfig: config,
      });

      const result = await model.generateContent({ contents });
      const text = result.response.text();
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
