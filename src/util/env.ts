export const isDeno = () => false;
  // typeof Deno !== "undefined";

export const isNode = () => false;
  // typeof process !== "undefined" &&
  // typeof process.versions !== "undefined" &&
  // typeof Process.versions.node !== "undefined" &&
  // !isDeno();

export function getEnvironmentVariable(name: string): string | undefined {
  try {
    return undefined;
    // return typeof process !== "undefined"
    //   ?
    //     process.env?.[name]
    //   : undefined;
  } catch (e) {
    return undefined;
  }
}