import { generateContentWithFallback } from "./geminiApi";

export type ExtractionCitation =
  | { type: "document"; page: string | number; quote: string }
  | { type: "spreadsheet"; location: string; reasoning: string }
  | { type: "api"; endpoint: string; reasoning: string };

export type ExtractedRowWithSource = {
  data: string[];
  citation: ExtractionCitation;
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
    const isSpreadsheet = /\.(csv|xlsx|xls|ods)$/i.test(file.name);
    const fileTypeContext = isSpreadsheet
      ? "SPREADSHEET/CSV"
      : "DOCUMENT (PDF/Image)";

    // FORENSIC AUDITOR PROMPT
    // This prompt forces the model to find the evidence FIRST, before creating the data row.
    const prompt = `
      ROLE: Forensic Data Auditor.
      TASK: Extract a Bill of Materials (BOM) strictly from the provided ${fileTypeContext}.
      
      TARGET HEADERS:
      ${JSON.stringify(currentHeaders)}
      
      STRICT RULES (VIOLATION = FAILURE):
      1. EVIDENCE FIRST: You must find the EXACT text in the document before extracting any data.
      2. VERBATIM QUOTES: The "quote" field must be a COPY-PASTE substring from the file. Do not summarize or paraphrase the quote.
      3. NO HALLUCINATION: 
         - If the document contains Python code, Scripts, or non-BOM text, return { "rows": [] }.
         - Do not invent part numbers.
         - Do not guess quantities. If quantity is not listed, leave it blank or "1" only if implied by a singular noun.
      4. PAGE NUMBERS: If the document has page markers (e.g. "Seite 1/18"), use them. If not, count the pages sequentially.

      OUTPUT JSON FORMAT:
      {
        "rows": [
          {
            "data": ["(Value for Col 1)", "(Value for Col 2)", ...],
            "citation": ${
              isSpreadsheet
                ? `{ "type": "spreadsheet", "location": "Row 2", "reasoning": "Found in 'Motors' sheet" }`
                : `{ "type": "document", "page": "5", "quote": "exact substring from text" }`
            }
          }
        ]
      }
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
        "You are a robotic data scraper. You have no imagination. You only extract facts present in the text.",
        contents,
        (failed, next) =>
          console.warn(`Extraction: ${failed} failed, retrying with ${next}`),
        // CRITICAL: Force Temperature 0.0 to kill hallucinations
        { temperature: 0.0 },
      );

    console.log("Raw AI Response:", responseText);

    const startIndex = responseText.indexOf("{");
    const endIndex = responseText.lastIndexOf("}");

    if (startIndex === -1 || endIndex === -1) {
      return { rows: [], finalModel };
    }

    const cleanJson = responseText.substring(startIndex, endIndex + 1);

    try {
      const parsedObj = JSON.parse(cleanJson);
      if (parsedObj.rows && Array.isArray(parsedObj.rows)) {
        return { rows: parsedObj.rows, finalModel };
      }
      return { rows: [], finalModel };
    } catch (e) {
      console.error("JSON Parse Error:", e);
      return null;
    }
  } catch (error) {
    console.error("Extraction Failed:", error);
    return null;
  }
}
