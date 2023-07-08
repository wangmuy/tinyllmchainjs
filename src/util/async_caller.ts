import pRetry from "p-retry";
import PQueueMod from "p-queue";

const STATUS_NO_RETRY = [
  400,
  401,
  403,
  404,
  405,
  406,
  407,
  408,
  409,
];

export interface AsyncCallerParams {
  maxConcurrency?: number;
  maxRetries?: number;
}

export interface AsyncCallerCallOptions {
  signal?: AbortSignal;
}

export class AsyncCaller {
  protected maxConcurrency: AsyncCallerParams["maxConcurrency"];

  protected maxRetries: AsyncCallerParams["maxRetries"];

  private queue: typeof import("p-queue")["default"]["prototype"];

  constructor(params: AsyncCallerParams) {
    this.maxConcurrency = params.maxConcurrency ?? Infinity;
    this.maxRetries = params.maxRetries ?? 6;

    const PQueue = "default" in PQueueMod ? PQueueMod.default : PQueueMod;
    this.queue = new PQueue({ concurrency: this.maxConcurrency });
  }

  call<A extends any[], T extends (...args: A) => Promise<any>>(
    callable: T,
    ...args: Parameters<T>
  ): Promise<Awaited<ReturnType<T>>> {
    return this.queue.add(
      () =>
        pRetry(
          () =>
            callable(...args).catch((error) => {
              if (error instanceof Error) {
                throw error;
              } else {
                throw new Error(error);
              }
            }),
          {
            onFailedAttempt(error) {
              if (
                error.message.startsWith("Cancel") ||
                error.message.startsWith("TimeoutError") ||
                error.message.startsWith("AbortError")
              ) {
                throw error;
              }
              if ((error as any)?.code === "ECONNABORTED") {
                throw error;
              }
              const status = (error as any)?.response?.status;
              if (status && STATUS_NO_RETRY.includes(+status)) {
                throw error;
              }
            },
            retries: this.maxRetries,
            randomize: true,
          }
        ),
      { throwOnTimeout: true }
    );
  }

  callWithOptions<A extends any[], T extends (...args: A) => Promise<any>>(
    options: AsyncCallerCallOptions,
    callable: T,
    ...args: Parameters<T>
  ): Promise<Awaited<ReturnType<T>>> {
    if (options.signal) {
      return Promise.race([
        this.call<A, T>(callable, ...args),
        new Promise<never>((_, reject) => {
          options.signal?.addEventListener("abort", () => {
            reject(new Error("AbortError"));
          });
        }),
      ]);
    }
    return this.call<A, T>(callable, ...args);
  }

  fetch(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
    return this.call(() =>
      fetch(...args).then((res) => (res.ok ? res : Promise.reject(res)))
    );
  }
}