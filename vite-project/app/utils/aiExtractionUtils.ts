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

    // NEW PROMPT: "Technical Analyst" - Finds specific parts in text, ignores generic code/noise.
    const prompt = `
      ROLE: Technical Specification Analyst.
      
      TASK: Extract a Bill of Materials (BOM) from the provided document.
      The document might be a PDF Specification (Lastenheft), a Catalog, or a Technical Drawing.
      
      TARGET HEADERS:
      ${JSON.stringify(currentHeaders)}
      
      EXTRACTION RULES:
      1. SCAN the text for explicit mentions of specific hardware components, part numbers, or material specifications.
         - Look for keywords like "Best.-Nr.", "Order No.", "Type", "Typ", "Lieferant" (Supplier), "Hersteller" (Manufacturer).
         - Example found in text: "RITTAL Bohrschraube M5 x 16mm, Lieferant Sonepar SZ 2487.000" -> Extract this!
      
      2. MAPPING:
         - Map the found item Name/Description to the column like "Bezeichnung" or "Description".
         - Map the Part Number to "Typ / Artikelnr. / Bestellnr.".
         - Map the Brand/Supplier to "Hersteller".
         - If a quantity is mentioned (e.g. "4x"), use it. If it is a general instruction ("Use this screw"), default Quantity to "1" or "".

      3. ANTI-HALLUCINATION PROTOCOL:
         - ONLY output items clearly written in the document.
         - If the file is a Python script, Source Code, or generic prose without part numbers, RETURN AN EMPTY ARRAY [].
         - DO NOT invent a standard BOM. If the file doesn't list "Circuit Breaker", do not add one.

      OUTPUT FORMAT:
      - Return ONLY a raw JSON Array of Arrays matching the target headers.
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
        "You are a technical data extraction assistant. You output strict JSON arrays.",
        contents,
        (failed, next) =>
          console.warn(`Extraction: ${failed} failed, retrying with ${next}`),
      );

    console.log("Raw AI Response:", responseText);

    // Robust parsing logic
    const startIndex = responseText.indexOf("[");
    const endIndex = responseText.lastIndexOf("]");

    if (startIndex === -1 || endIndex === -1) {
      console.warn("AI did not return valid JSON brackets. Assuming no data.");
      return { data: [], finalModel };
    }

    const cleanJson = responseText.substring(startIndex, endIndex + 1);

    try {
      const parsedData = JSON.parse(cleanJson);
      if (Array.isArray(parsedData)) {
        // Check if it's an empty array (valid result for code files)
        if (parsedData.length === 0) {
          return { data: [], finalModel };
        }
        // Check if structure matches array of arrays
        if (Array.isArray(parsedData[0])) {
          return { data: parsedData, finalModel };
        }
      }
      console.error("Parsed JSON structure invalid:", parsedData);
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
