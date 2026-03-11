/**
 * Calls `fn` with a hard timeout and up to `maxRetries` retries.
 * On every failure it logs the attempt, waits 1s, then retries.
 * Throws a typed Error on final failure.
 */
export async function callWithRetry<T>(
    fn: () => Promise<T>,
    context: string,
    maxRetries = 3,
    timeoutMs = 30_000,
): Promise<T> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const result = await Promise.race<T>([
                fn(),
                new Promise<never>((_, reject) =>
                    controller.signal.addEventListener('abort', () =>
                        reject(new Error(`TIMEOUT after ${timeoutMs}ms`)),
                    ),
                ),
            ]);
            clearTimeout(timer);
            return result;
        } catch (err: any) {
            clearTimeout(timer);
            lastError = err instanceof Error ? err : new Error(String(err));
            console.error(
                JSON.stringify({
                    level: 'WARN',
                    context,
                    attempt,
                    maxRetries,
                    error: lastError.message,
                }),
            );
            if (attempt < maxRetries) await sleep(1000);
        }
    }

    throw new Error(`[${context}] Failed after ${maxRetries} attempts: ${lastError.message}`);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
