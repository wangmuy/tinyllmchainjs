import { Serializable } from "../load/serializable.js";
import { CallbackManager, Callbacks } from "../callbacks/manager.js";
import { AsyncCallerParams, AsyncCaller } from "../util/async_caller.js";
import { BaseChatMessage, BasePromptValue, LLMResult } from "../schema/index.js";

const getVerbosity = () => false;

export type SerializedLLM = {
  _model: string;
  _type: string;
} & Record<string, any>;

export interface BaseLangChainParams {
  verbose?: boolean;
  callbacks?: Callbacks;
  tags?: string[];
}

export abstract class BaseLangChain
  extends Serializable
  implements BaseLangChainParams
{
  verbose: boolean;

  callbacks?: Callbacks;

  tags?: string[];

  get lc_attributes(): { [key: string]: undefined } | undefined {
    return {
      callbacks: undefined,
      verbose: undefined,
    };
  }

  constructor(params: BaseLangChainParams) {
    super(params);
    this.verbose = params.verbose ?? getVerbosity();
    this.callbacks = params.callbacks;
    this.tags = params.tags ?? [];
  }
}

export interface BaseLanguageModelParams
  extends AsyncCallerParams,
    BaseLangChainParams {
  callbackManager?: CallbackManager;
}

export interface BaseLanguageModelCallOptions {
  stop?: string[];
  timeout?: number;
  signal?: AbortSignal;
  tags?: string[];
}

export abstract class BaseLanguageModel
  extends BaseLangChain
  implements BaseLanguageModelParams
{
  declare CallOptions: BaseLanguageModelCallOptions;

  get callKeys(): string[] {
    return ["stop", "timeout", "signal"];
  }

  caller: AsyncCaller;

  constructor({
    callbacks,
    callbackManager,
    ...params
  }: BaseLanguageModelParams) {
    super({
      callbacks: callbacks ?? callbackManager,
      ...params,
    });
    this.caller = new AsyncCaller(params ?? {});
  }

  abstract generatePrompt(
    promptValues: BasePromptValue[],
    options?: string[] | this["CallOptions"],
    callbacks?: Callbacks
  ): Promise<LLMResult>;

  abstract predict(
    text: string,
    options?: string[] | this["CallOptions"],
    callbacks?: Callbacks
  ): Promise<string>;

  abstract predictMessages(
    messages: BaseChatMessage[],
    options?: string[] | this["CallOptions"],
    callbacks?: Callbacks
  ): Promise<BaseChatMessage>;

  abstract _modelType(): string;

  abstract _llmType(): string;

  _identifyingParams(): Record<string, any> {
    return {};
  }
}