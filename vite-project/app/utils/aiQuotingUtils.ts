import { generateContentWithFallback } from "./geminiApi";

export type QuotedRow = {
  rowId: number;
  totalNetPrice: string | number;
  netPricePerUnit: string | number;
  estimatedDelivery: string;
  packQuantity: string | number;
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
    1. **Search Query**: For each item, search for "Conrad [Part Number] [Manufacturer]".
    2. **Formatting**: If a search fails, try different formats (e.g. "8806.000" instead of "8806000").
    3. **Verify**: Ensure the product page matches the description (e.g., "Rittal VX25").

    PRICING RULES:
    1. **Net Price**: We need B2B (Net) prices. If only Gross (with VAT) is found, calculate: Net = Gross / 1.19.
    2. **Pack Size**: Check if it's a pack (e.g. "Pack of 10").
    3. **Delivery**: Look for "Sofort verfügbar" (1-3 days) or specific dates.

    OUTPUT FORMAT (JSON ONLY):
    Return a valid JSON Array.
    [
      {
        "rowId": 123,
        "totalNetPrice": "125.50",
        "netPricePerUnit": "12.55",
        "packQuantity": 10,
        "estimatedDelivery": "1-3 Werktage",
        "reasoning": "Found on Conrad.de (Art. 2251303). Price 149.35€ Gross. In Stock."
      }
    ]
  `;

  const contents = [{ role: "user", parts: [{ text: prompt }] }];

  try {
    const { text: responseText } = await generateContentWithFallback(
      startModel,
      availableModels,
      "You are a procurement agent with access to Google Search. You always verify prices online.",
      contents,
      undefined,
      { temperature: 0.1 },
      // FIXED: Use correct property name for TypeScript compatibility
      [{ googleSearchRetrieval: {} }],
    );

    console.log("Quoting Response:", responseText);

    // Clean and Parse JSON
    const startIndex = responseText.indexOf("[");
    const endIndex = responseText.lastIndexOf("]");

    if (startIndex === -1 || endIndex === -1) return null;

    const cleanJson = responseText.substring(startIndex, endIndex + 1);
    const parsedData = JSON.parse(cleanJson);

    return parsedData;
  } catch (error) {
    console.error("Quoting Failed:", error);
    return null;
  }
}
