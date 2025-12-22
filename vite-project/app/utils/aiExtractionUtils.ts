import { generateContentWithFallback } from "./geminiApi";

// Definition of what we now expect from the AI
export type ExtractedRowWithSource = {
  data: string[]; // The spreadsheet columns
  citation: {
    page: number | string; // Sometimes might be "Cover" or "Unknown"
    quote: string;
  };
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

export async function extractDataFromReference(
  file: File,
  currentHeaders: unknown[],
  startModel: string,
  availableModels: string[],
): Promise<{ rows: ExtractedRowWithSource[]; finalModel: string } | null> {
  try {
    const base64Data = await readFileAsBase64(file);

    const prompt = `
      ROLE: Technical Specification Analyst.
      
      TASK: Extract a Bill of Materials (BOM) from the provided document.
      
      TARGET HEADERS:
      ${JSON.stringify(currentHeaders)}
      
      EXTRACTION RULES:
      1. SCAN text for explicit hardware components, part numbers, or material instructions.
         - Look for keywords: "Best.-Nr.", "Order No.", "Type", "Typ", "Lieferant", "Hersteller", "Qty", "Stk".
      2. MAPPING: Map found items to the headers.
      
      3. CRITICAL ANTI-HALLUCINATION:
         - IGNORE source code (Python, JS, C++), scripts, or debug logs.
         - If the document is just code or does not contain a list of physical parts, RETURN EMPTY: { "rows": [] }
         - DO NOT invent parts. If the text says "Connect to PC", do not add a "PC" row unless a specific part number is listed.

      4. CITATION REQUIRED: For EVERY row extracted, you MUST provide:
         - The Page Number where found.
         - The EXACT Quote or sentence fragment from the file that proves this item exists.

      OUTPUT FORMAT:
      Return a JSON Object with a "rows" key containing an array of objects.
      
      Example JSON Structure:
      {
        "rows": [
          {
            "data": ["1234.500", "Rittal VX25", "1"],
            "citation": { "page": 5, "quote": "Use 1x Rittal VX25 1234.500 for the enclosure." }
          }
        ]
      }
      
      - No markdown formatting.
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
        "You are a strict data extraction assistant. Output valid JSON only.",
        contents,
        (failed, next) =>
          console.warn(`Extraction: ${failed} failed, retrying with ${next}`),
      );

    console.log("Raw AI Response:", responseText);

    // Parsing Logic
    const startIndex = responseText.indexOf("{");
    const endIndex = responseText.lastIndexOf("}");

    if (startIndex === -1 || endIndex === -1) {
      console.warn("AI did not return valid JSON object brackets.");
      return { rows: [], finalModel };
    }

    const cleanJson = responseText.substring(startIndex, endIndex + 1);

    try {
      const parsedObj = JSON.parse(cleanJson);
      if (parsedObj.rows && Array.isArray(parsedObj.rows)) {
        return { rows: parsedObj.rows, finalModel };
      }
      // Handle case where AI returns empty array directly instead of { rows: [] }
      if (Array.isArray(parsedObj)) {
        return { rows: [], finalModel };
      }
      console.error("Parsed JSON did not contain 'rows' array:", parsedObj);
      return null;
    } catch (e) {
      console.error("JSON Parse Error:", e);
      return null;
    }
  } catch (error) {
    console.error("Extraction Failed:", error);
    return null;
  }
}
