import { Callbacks } from "../callbacks/manager.js";
import { Generation, ChatGeneration } from "../schema/index.js";
import { BaseOutputParser } from "../schema/output_parser.js";

export class NoOpOutputParser extends BaseOutputParser<string> {
  lc_namespace = ["langchain", "output_parser", "default"];

  lc_serializable = true;

  parse(text: string): Promise<string> {
    return Promise.resolve(text);
  }

  getFormatInstructions(): string {
    return "";
  }
}