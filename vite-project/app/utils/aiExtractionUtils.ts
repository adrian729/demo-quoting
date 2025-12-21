import { generateContentWithFallback } from "./geminiApi";

// Helper to convert file to Base64
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

export async function extractDataFromReference(
  file: File,
  currentHeaders: unknown[],
  startModel: string,
  availableModels: string[],
): Promise<{ data: unknown[][]; finalModel: string } | null> {
  try {
    const base64Data = await readFileAsBase64(file);

    const prompt = `
      You are an expert Estimation Engineer for Control Cabinets (Schaltschrankbau).
      
      YOUR TASK:
      Analyze the attached document (PDF/Image/Text). 
      It might be a structured Bill of Materials (BOM) OR a textual Specification (Lastenheft).
      
      1. IDENTIFY components, enclosures, parts, or billable items mentioned.
      2. MAP them to the target spreadsheet headers provided below.
      
      TARGET HEADERS:
      ${JSON.stringify(currentHeaders)}
      
      RULES:
      - If a column in the headers doesn't match data in the doc, return an empty string "" for that cell.
      - If the document is a "Lastenheft" (text spec), infer the components needed (e.g., if it says "5x VX25 2000x800", create a row for it).
      - Do not include header rows from the source document.
      - STRICTLY return a JSON Array of Arrays. 
      - NO MARKDOWN, NO CODE BLOCKS, NO CONVERSATIONAL TEXT. Just the raw array.
    `;

    const contents = [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: file.type || "application/pdf",
            },
          },
          { text: prompt },
        ],
      },
    ];

    const { text: responseText, finalModel } =
      await generateContentWithFallback(
        startModel,
        availableModels,
        "You are a data extraction assistant.",
        contents,
        (failed, next) =>
          console.warn(`Extraction: ${failed} failed, retrying with ${next}`),
      );

    console.log("Raw AI Response:", responseText);

    // Robust parsing
    const startIndex = responseText.indexOf("[");
    const endIndex = responseText.lastIndexOf("]");

    if (startIndex === -1 || endIndex === -1) {
      console.error("AI did not return valid array brackets");
      return null;
    }

    const cleanJson = responseText.substring(startIndex, endIndex + 1);
    const parsedData = JSON.parse(cleanJson);

    if (
      Array.isArray(parsedData) &&
      (parsedData.length === 0 || Array.isArray(parsedData[0]))
    ) {
      // RETURN OBJECT WITH DATA AND MODEL
      return { data: parsedData, finalModel };
    }

    return null;
  } catch (error) {
    console.error("Extraction Failed:", error);
    return null;
  }
}
