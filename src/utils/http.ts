/**
 * Fetches `url` with the given headers and returns the parsed JSON body.
 * Throws a plain Error (not UserError) on a non-OK response — callers that
 * want a user-facing message should catch and wrap it themselves.
 */
export async function fetchJson<T = Record<string, any>>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return (await response.json()) as T;
}
