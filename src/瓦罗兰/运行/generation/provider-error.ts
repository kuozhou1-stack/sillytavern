/** Only failures at the provider boundary may send the same operation to another connection. */
export class ApiProviderError extends Error {}

export async function withApiProviderError<T>(signal: AbortSignal, send: () => Promise<T>, key?: string): Promise<T> {
  signal.throwIfAborted();
  try {
    return await send();
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof ApiProviderError || (error as Error)?.name === 'AbortError') throw error;
    const message: string = (error as Error)?.message || String(error);
    throw new ApiProviderError(key ? message.replaceAll(key, '[密钥已隐藏]') : message);
  }
}
