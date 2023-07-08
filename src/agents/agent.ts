import { BaseLanguageModel } from "../base_language/index.js";
import { CallbackManager, Callbacks } from "../callbacks/manager.js";
import { LLMChain } from "../chains/llm_chain.js";
import { Serializable } from "../load/serializable.js";
import { BasePromptTemplate } from "../prompts/base.js";
import { AgentAction, AgentFinish, AgentStep, BaseChatMessage, ChainValues } from "../schema/index.js";
import { StructuredTool } from "../tools/base.js";
import { AgentActionOutputParser, AgentInput, StoppingMethod } from "./types.js";

export type OutputParserArgs = Record<string, any>;

class ParseError extends Error {
  output: string;

  constructor(msg: string, output: string) {
    super(msg);
    this.output = output;
  }
}

export abstract class BaseAgent extends Serializable {
  declare ToolType: StructuredTool;

  abstract get inputKeys(): string[];

  get returnValues(): string[] {
    return ["output"];
  }

  get allowedTools(): string[] | undefined {
    return undefined;
  }

  _agentType(): string {
    throw new Error("Not implemented");
  }

  abstract _agentActionType(): string;

  returnStoppedResponse(
    earlyStoppingMethod: StoppingMethod,
    _steps: AgentStep[],
    _inputs: ChainValues,
    _callbackManager?: CallbackManager
  ): Promise<AgentFinish> {
    if (earlyStoppingMethod === "force") {
      return Promise.resolve({
        returnValues: { output: "Agent stopped due to max iterations." },
        log: "",
      });
    }

    throw new Error(`Invalid stopping method: ${earlyStoppingMethod}`);
  }

  async prepareForOutput(
    _returnValues: AgentFinish["returnValues"],
    _steps: AgentStep[]
  ): Promise<AgentFinish["returnValues"]> {
    return {};
  }
}

export abstract class BaseSingleActionAgent extends BaseAgent {
  _agentActionType(): string {
    return "single" as const;
  }

  abstract plan(
    steps: AgentStep[],
    inputs: ChainValues,
    CallbackManager?: CallbackManager
  ): Promise<AgentAction | AgentFinish>;
}

export abstract class BaseMultiActionAgent extends BaseAgent {
  _agentActionType(): string {
    return "multi" as const;
  }

  abstract plan(
    steps: AgentStep[],
    inputs: ChainValues,
    callbackManager?: CallbackManager
  ): Promise<AgentAction[] | AgentFinish>;
}

export interface LLMSingleActionAgentInput {
  llmChain: LLMChain;
  outputParser: AgentActionOutputParser;
  stop?: string[];
}

export class LLMSingleActionAgent extends BaseSingleActionAgent {
  lc_namespace = ["langchain", "agents"];

  llmChain: LLMChain;

  outputParser: AgentActionOutputParser;

  stop?: string[];

  constructor(input: LLMSingleActionAgentInput) {
    super(input);
    this.stop = input.stop;
    this.llmChain = input.llmChain;
    this.outputParser = input.outputParser;
  }

  get inputKeys(): string[] {
    return this.llmChain.inputKeys;
  }

  async plan(
    steps: AgentStep[],
    inputs: ChainValues,
    callbackManager?: CallbackManager
  ): Promise<AgentAction | AgentFinish> {
    const output = await this.llmChain.call(
      {
        intermediate_steps: steps,
        stop: this.stop,
        ...inputs,
      },
      callbackManager
    );
    return this.outputParser.parse(
      output[this.llmChain.outputKey],
      callbackManager
    );
  }
}

export interface AgentArgs {
  outputParser?: AgentActionOutputParser;

  callbacks?: Callbacks;

  callbackManager?: CallbackManager;
}

export abstract class Agent extends BaseSingleActionAgent {
  llmChain: LLMChain;

  outputParser: AgentActionOutputParser | undefined;

  private _allowedTools?: string[] = undefined;

  get allowedTools(): string[] | undefined {
    return this._allowedTools;
  }

  get inputKeys(): string[] {
    return this.llmChain.inputKeys.filter((k) => k !== "agent_scratchpad");
  }

  constructor(input: AgentInput) {
    super(input);
    this.llmChain = input.llmChain;
    this._allowedTools = input.allowedTools;
    this.outputParser = input.outputParser;
  }

  abstract observationPrefix(): string;

  abstract llmPrefix(): string;

  abstract _agentType(): string;

  static getDefaultOutputParser(
    _fields?: OutputParserArgs
  ): AgentActionOutputParser {
    throw new Error("Not implemented");
  }

  static createPrompt(
    _tools: StructuredTool[],
    _fields?: Record<string, any>
  ): BasePromptTemplate {
    throw new Error("Not implemented");
  }

  static fromLLMAndTools(
    _llm: BaseLanguageModel,
    _tools: StructuredTool[],
    _args?: AgentArgs
  ): Agent {
    throw new Error("Not implemented");
  }

  static validateTools(_tools: StructuredTool[]): void {}

  _stop(): string[] {
    return [`\n${this.observationPrefix()}`];
  }

  finishToolName(): string {
    return "Final Answer";
  }

  async constructScratchPad(
    steps: AgentStep[]
  ): Promise<string | BaseChatMessage[]> {
    return steps.reduce(
      (thoughts, { action, observation }) =>
      thoughts +
      [
        action.log,
        `${this.observationPrefix()}${observation}`,
        this.llmPrefix(),
      ].join("\n"),
      ""
    );
  }

  private async _plan(
    steps: AgentStep[],
    inputs: ChainValues,
    suffix?: string,
    callbackManager?: CallbackManager
  ): Promise<AgentAction | AgentFinish> {
    const thoughts = await this.constructScratchPad(steps);
    const newInputs: ChainValues = {
      ...inputs,
      agent_scratchpad: suffix ? `${thoughts}${suffix}` : thoughts,
    };

    if (this._stop().length !== 0) {
      newInputs.stop = this._stop();
    }

    const output = await this.llmChain.predict(newInputs, callbackManager);
    if (!this.outputParser) {
      throw new Error("Output aprser not set");
    }
    return this.outputParser.parse(output, callbackManager);
  }

  plan(
    steps: AgentStep[],
    inputs: ChainValues,
    callbackManager?: CallbackManager
  ): Promise<AgentAction | AgentFinish> {
    return this._plan(steps, inputs, undefined, callbackManager);
  }

  async returnStoppedResponse(
    earlyStoppingMethod: StoppingMethod,
    steps: AgentStep[],
    inputs: ChainValues,
    callbackManager?: CallbackManager
  ): Promise<AgentFinish> {
    if (earlyStoppingMethod === "force") {
      return {
        returnValues: { output: "Agent stopped due to max iterations." },
        log: "",
      };
    }

    if (earlyStoppingMethod === "generate") {
      try {
        const aciton = await this._plan(
          steps,
          inputs,
          "\n\nI now need to return a final answer based on the previous steps:",
          callbackManager
        );
        if ("returnValues" in aciton) {
          return aciton;
        }

        return { returnValues: { output: aciton.log }, log: aciton.log };
      } catch (err) {
        if (!(err instanceof ParseError)) {
          throw err;
        }
        return { returnValues: { output: err.output }, log: err.output };
      }
    }

    throw new Error(`Invalid stopping method: ${earlyStoppingMethod}`);
  }
}