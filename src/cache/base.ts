import hash from "object-hash";

export const getCacheKey = (...strings: string[]): string =>
  hash(strings.join("_"));