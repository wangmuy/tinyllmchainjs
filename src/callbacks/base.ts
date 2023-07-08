import * as uuid from "uuid";
import { SerializedFields } from "../load/map_keys.js";
import { Serializable, Serialized, SerializedNotImplemented } from "../load/serializable.js";
import { AgentAction, AgentFinish, BaseChatMessage, ChainValues, LLMResult } from "../schema/index.js";

type Error = any;

export interface BaseCallbackHandlerInput {
  ignoreLLM?: boolean;
  ignoreChain?: boolean;
  ignoreAgent?: boolean;
}

export interface NewTokenIndices {
  prompt: number;
  completion: number;
}

abstract class BaseCallbackHandlerMethodsClass {
  handleLLMStart?(
    llm: Serialized,
    prompts: string[],
    runId: string,
    parenRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[]
  ): Promise<void> | void;

  handleLLMNewToken?(
    token: string,
    idx: NewTokenIndices,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  handleLLMError?(
    err: Error,
    runId: string,
    parenRunId?: string
  ): Promise<void> | void;

  handleLLMEnd?(
    output: LLMResult,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  handleChatModelStart?(
    llm: Serialized,
    messages: BaseChatMessage[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[]
  ): Promise<void> | void;

  handleChainStart?(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    parentRunId?: string,
    tags?: string[]
  ): Promise<void> | void;

  handleChainError?(
    err: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  handleChainEnd?(
    outputs: ChainValues,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  handleToolStart?(
    tool: Serialized,
    input: string,
    runId: string,
    parentRunId?: string,
    tags?: string[]
  ): Promise<void> | void;

  handleToolError?(
    err: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  handleToolEnd?(
    output: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  handleText?(
    text: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  handleAgentAction?(
    action: AgentAction,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  handleAgentEnd?(
    action: AgentFinish,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;
}

export type CallbackHandlerMethods = BaseCallbackHandlerMethodsClass;

export abstract class BaseCallbackHandler
  extends BaseCallbackHandlerMethodsClass
  implements BaseCallbackHandlerInput, Serializable
{
  lc_serializable = false;

  get lc_namespace(): ["langchain", "callbacks", string] {
    return ["langchain", "callbacks", this.name];
  }

  get lc_secrets(): { [key: string]: string } | undefined {
    return undefined;
  }

  get lc_attributes(): { [key: string]: string } | undefined {
    return undefined;
  }

  get lc_aliases(): { [key: string]: string } | undefined {
    return undefined;
  }

  lc_kwargs: SerializedFields;

  abstract name: string;

  ignoreLLM = false;
  ignoreChain = false;
  ignoreAgent = false;

  awaitHandlers = true;
    // typeof process !== "undefined"
    // ?
    //   process.env?.LANGCHAIN_CALLBACKS_BACKGROUND !== "true"
    // : true;

  constructor(input?: BaseCallbackHandlerInput) {
    super();
    this.lc_kwargs = input || {};
    if (input) {
      this.ignoreLLM = input.ignoreLLM ?? this.ignoreLLM;
      this.ignoreChain = input.ignoreChain ?? this.ignoreChain;
      this.ignoreAgent = input.ignoreAgent ?? this.ignoreAgent;
    }
  }

  copy(): BaseCallbackHandler {
    return new (this.constructor as new(
      input?: BaseCallbackHandlerInput
    ) => BaseCallbackHandler)(this);
  }

  toJSON(): Serialized {
    return Serializable.prototype.toJSON.call(this);
  }

  toJSONNotImplemented(): SerializedNotImplemented {
    return Serializable.prototype.toJSONNotImplemented.call(this);
  }

  static fromMethods(methods: CallbackHandlerMethods) {
    class Handler extends BaseCallbackHandler {
      name = uuid.v4();

      constructor() {
        super();
        Object.assign(this, methods);
      }
    }
    return new Handler();
  }
}