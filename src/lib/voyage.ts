const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
}

/**
 * Call the Voyage AI embeddings API directly via fetch.
 * Returns one embedding vector per input text, in the same order.
 */
export async function voyageEmbed(
  texts: string[],
  apiKey: string,
  model = "voyage-large-2"
): Promise<number[][]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  });

  if (!response.ok) {
    const msg = await response.text().catch(() => response.statusText);
    throw new Error(`Voyage AI API error ${response.status}: ${msg}`);
  }

  const data = (await response.json()) as VoyageResponse;
  return data.data.map((item) => item.embedding);
}
