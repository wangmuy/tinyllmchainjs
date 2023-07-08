import { BaseLanguageModel } from "../../base_language/index.js";
import { LLMChain } from "../../chains/llm_chain.js";
import { PromptTemplate } from "../../prompts/prompt.js";
import { renderTemplate } from "../../prompts/template.js";
import { Tool } from "../../tools/base.js";
import { Optional } from "../../types/type-utils.js";
import { Agent, AgentArgs, OutputParserArgs } from "../agent.js";
import { AgentInput } from "../types.js";
import { ZeroShotAgentOutputParser } from "./outputParser.js";
import { FORMAT_INSTRUCTIONS, PREFIX, SUFFIX } from "./prompt.js";

export interface ZeroShotCreatePromptArgs {
  suffix?: string;
  prefix?: string;
  inputVariables?: string[];
}

export type ZeroShotAgentInput = Optional<AgentInput, "outputParser">;

export class ZeroShotAgent extends Agent {
  lc_namespace = ["langchain", "agents", "mrkl"];

  declare ToolType: Tool;

  constructor(input: ZeroShotAgentInput) {
    const outputParser =
      input?.outputParser ?? ZeroShotAgent.getDefaultOutputParser();
    super({ ...input, outputParser });
  }

  _agentType() {
    return "zero-shot-react-description" as const;
  }

  observationPrefix() {
    return "Observation: ";
  }

  llmPrefix() {
    return "Thought:";
  }

  static getDefaultOutputParser(fields?: OutputParserArgs) {
    return new ZeroShotAgentOutputParser(fields);
  }

  static validateTools(tools: Tool[]) {
    const descriptionlessTool = tools.find((tool) => !tool.description);
    if (descriptionlessTool) {
      const msg =
        `Got a tool ${descriptionlessTool.name} without a description.` +
        ` This agent requires descriptions for all tools.`;
      throw new Error(msg);
    }
  }

  static createPrompt(tools: Tool[], args?: ZeroShotCreatePromptArgs) {
    const {
      prefix = PREFIX,
      suffix = SUFFIX,
      inputVariables = ["inputs", "agent_scratchpad"],
    } = args ?? {};
    const toolStrings = tools
      .map((tool) => `${tool.name}: ${tool.description}`)
      .join("\n");

    const toolNames = tools.map((tool) => tool.name);

    const formatInstructions = renderTemplate(FORMAT_INSTRUCTIONS, "f-string", {
      tool_names: toolNames,
    });

    const template = [prefix, toolStrings, formatInstructions, suffix].join(
      "\n\n"
    );

    return new PromptTemplate({
      template,
      inputVariables,
    });
  }

  static fromLLMAndTools(
    llm: BaseLanguageModel,
    tools: Tool[],
    args?: ZeroShotCreatePromptArgs & AgentArgs
  ) {
    ZeroShotAgent.validateTools(tools);
    const prompt = ZeroShotAgent.createPrompt(tools, args);
    const outputParser =
      args?.outputParser ?? ZeroShotAgent.getDefaultOutputParser();
    const chain = new LLMChain({
      prompt,
      llm,
      callbacks: args?.callbacks ?? args?.callbackManager,
    });

    return new ZeroShotAgent({
      llmChain: chain,
      allowedTools: tools.map((t) => t.name),
      outputParser,
    });
  }
}