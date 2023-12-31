import PQueueMod from "p-queue";

let queue: typeof import("p-queue")["default"]["prototype"];

function createQueue() {
  const PQueue = "default" in PQueueMod ? PQueueMod.default : PQueueMod;
  return new PQueue({
    autoStart: true,
    concurrency: 1,
  });
}

export async function consumeCallback<T>(
  promiseFn: () => Promise<T> | T | void,
  wait: boolean
): Promise<void> {
  if (wait === true) {
    await promiseFn();
  } else {
    if (typeof queue == "undefined") {
      queue = createQueue();
    }
    void queue.add(promiseFn);
  }
}

export function awaitAllCallbacks(): Promise<void> {
  return typeof queue !== "undefined" ? queue.onIdle() : Promise.resolve();
}