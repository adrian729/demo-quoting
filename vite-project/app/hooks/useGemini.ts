import { useEffect, useState } from "react";
import { DEFAULT_MODEL, fetchAvailableModels } from "~/utils/geminiApi";

export function useGemini() {
  const [availableModels, setAvailableModels] = useState<string[]>([
    DEFAULT_MODEL,
  ]);
  const [currentModel, setCurrentModel] = useState<string>(DEFAULT_MODEL);

  useEffect(() => {
    fetchAvailableModels().then(setAvailableModels);
  }, []);

  return {
    availableModels,
    currentModel,
    setCurrentModel,
  };
}
