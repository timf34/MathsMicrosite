// Keep the exact same submission ID and payload across uncertain responses.
export async function submitSignature(payload, {
  fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onRetry = () => {},
  random = Math.random,
} = {}) {
  const body = JSON.stringify(payload);
  const fallback = 'We could not confirm your submission. Please try again; retries will not add duplicates.';
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    let data;
    let interrupted = false;
    try {
      response = await fetchImpl('/api/signatures', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body, signal: AbortSignal.timeout(35000),
      });
      data = await response.json();
    } catch {
      interrupted = true;
      // A lost response may still have saved: reuse the ID on the next attempt.
    }
    if (response?.ok && data?.ok === true) return data;
    const temporary = !response || (response.ok && interrupted) || [408, 500, 502, 503, 504].includes(response.status);
    if (!temporary || attempt === 2) throw new Error(data?.error || fallback);
    onRetry(attempt + 2);
    await sleep((attempt === 0 ? 1000 : 3000) + Math.floor(random() * 500));
  }
}
