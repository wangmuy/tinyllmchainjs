import { LLMChain } from "../chains/llm_chain.js";
import { AgentAction, AgentFinish } from "../schema/index.js";
import { BaseOutputParser } from "../schema/output_parser.js";

export abstract class AgentActionOutputParser extends BaseOutputParser<
 AgentAction | AgentFinish
> {}

export type StoppingMethod = "force" | "generate";

export interface AgentInput {
  llmChain: LLMChain,
  outputParser: AgentActionOutputParser | undefined;
  allowedTools?: string[];
}