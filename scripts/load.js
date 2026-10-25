const DEFAULT_URL = 'http://localhost:3000/health';
const DEFAULT_REQUESTS = 100;
const DEFAULT_CONCURRENCY = 10;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const url = process.env.LOAD_URL || DEFAULT_URL;
  const total = parsePositiveInteger(process.env.LOAD_REQUESTS, DEFAULT_REQUESTS);
  const concurrency = parsePositiveInteger(process.env.LOAD_CONCURRENCY, DEFAULT_CONCURRENCY);

  let nextIndex = 0;
  let successes = 0;
  let failures = 0;
  let totalMs = 0;
  let maxMs = 0;

  async function worker() {
    while (nextIndex < total) {
      const index = nextIndex;
      nextIndex += 1;

      const startedAt = performance.now();
      try {
        const response = await fetch(url);
        await response.arrayBuffer();
        if (response.ok) {
          successes += 1;
        } else {
          failures += 1;
        }
      } catch {
        failures += 1;
      }

      const elapsed = performance.now() - startedAt;
      totalMs += elapsed;
      maxMs = Math.max(maxMs, elapsed);

      if ((index + 1) % 25 === 0) {
        console.log(`Completed ${index + 1} of ${total} requests.`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const averageMs = total > 0 ? totalMs / total : 0;
  console.log(
    `Requests: ${total}, success: ${successes}, failed: ${failures}, average: ${averageMs.toFixed(1)} ms, max: ${maxMs.toFixed(1)} ms.`,
  );

  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
