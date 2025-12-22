import { generateContentWithFallback } from "./geminiApi";

export type QuotedRow = {
  rowId: number;
  totalNetPrice: string | number;
  netPricePerUnit: string | number;
  estimatedDelivery: string;
  packQuantity: string | number;
  sourceUrl: string;
  reasoning: string;
};

export async function quoteProducts(
  rows: unknown[][],
  headers: unknown[],
  startModel: string,
  availableModels: string[],
): Promise<QuotedRow[] | null> {
  // Prepare data (Row ID + Data)
  const itemsToQuote = rows.map((row, index) => ({
    rowId: index + 1,
    data: row,
  }));

  const prompt = `
    ROLE: B2B Procurement Assistant.
    
    TASK: Find the current price and availability for the products below using Google Search.
    
    TARGET STORE: Conrad.de (primary), Voelkner, or similar German industrial suppliers.
    
    INPUT DATA:
    HEADERS: ${JSON.stringify(headers)}
    ROWS: ${JSON.stringify(itemsToQuote)}

    SEARCH STRATEGY:
    1. **Search Query**: For each item, search for "Conrad [Part Number] [Manufacturer]" or "buy [Part Number] [Manufacturer] price".
    2. **Formatting**: If a search fails, try different formats (e.g. "8806.000" instead of "8806000").
    3. **Verify**: Ensure the product page matches the description.

    PRICING RULES:
    1. **Net Price**: We need B2B (Net) prices. If only Gross (with VAT) is found, calculate: Net = Gross / 1.19.
    2. **Pack Size**: Check if it's a pack (e.g. "Pack of 10").
    3. **Delivery**: Look for "Sofort verfügbar" (1-3 days) or specific dates.

    CRITICAL URL RULES (VIOLATION = FAILURE):
    - **sourceUrl**: You MUST use the EXACT URL returned by the Google Search tool. 
    - **DO NOT GUESS URLs**: Do not construct URLs like "shop.com/product/123" if you didn't click/see them. 
    - If the search tool does not provide a direct link to a product page, leave sourceUrl empty.
    - **Consistency**: The 'sourceUrl' domain must match the supplier mentioned in 'reasoning'.

    OUTPUT REQUIREMENTS:
    - You MUST return a JSON Array.
    - You MUST return an object for EVERY single input row.
    - If a product is NOT found, set values to "N/A", sourceUrl to "", and reasoning to "Product not found".

    OUTPUT FORMAT (JSON ONLY):
    [
      {
        "rowId": 123,
        "totalNetPrice": "125.50",
        "netPricePerUnit": "12.55",
        "packQuantity": 10,
        "estimatedDelivery": "1-3 Werktage",
        "sourceUrl": "https://www.conrad.de/de/p/rittal-vx-...",
        "reasoning": "Found on Conrad.de (Art. 2251303). Price 149.35€ Gross. In Stock."
      }
    ]
  `;

  const contents = [{ role: "user", parts: [{ text: prompt }] }];

  try {
    const { text: responseText } = await generateContentWithFallback(
      startModel,
      availableModels,
      "You are a procurement agent with access to Google Search. You never invent URLs.",
      contents,
      undefined,
      { temperature: 0.0 }, // Lowered to 0.0 to reduce hallucinations
      // Pass the tool definition compatible with @google/genai
      [{ googleSearch: {} }],
    );

    console.log("Quoting Response:", responseText);

    // Robust parsing to handle Markdown blocks
    const jsonMatch =
      responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
      responseText.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      console.warn("No JSON found in response");
      return null;
    }

    const cleanJson = jsonMatch[0].replace(/```json|```/g, "").trim();

    try {
      const parsedData = JSON.parse(cleanJson);
      return Array.isArray(parsedData) ? parsedData : null;
    } catch (e) {
      console.error("JSON Parse Error:", e);
      return null;
    }
  } catch (error) {
    console.error("Quoting Failed:", error);
    return null;
  }
}
