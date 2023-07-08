import { BaseLanguageModel } from "../base_language/index.js";
import { BaseChain, ChainInputs } from "./base.js";
import { BasePromptTemplate } from "../prompts/base.js";
import { BaseLLMOutputParser, BaseOutputParser } from "../schema/output_parser.js";
import { CallbackManager, CallbackManagerForChainRun, Callbacks } from "../callbacks/manager.js";
import { BasePromptValue, ChainValues, Generation } from "../schema/index.js";
import { NoOpOutputParser } from "../output_parsers/noop.js";

export interface LLMChainInput<
  T extends string | object = string,
  L extends BaseLanguageModel = BaseLanguageModel
> extends ChainInputs {
  prompt: BasePromptTemplate;
  llm: L;
  llmKwargs?: this["llm"]["CallOptions"];
  outputParser?: BaseLLMOutputParser<T>;
  outputKey?: string;
}

export class LLMChain<
  T extends string | object = string,
  L extends BaseLanguageModel = BaseLanguageModel
>
extends BaseChain
implements LLMChainInput<T>
{
  lc_serializable = true;

  prompt: BasePromptTemplate;

  llm: L;

  llmKwargs?: this["llm"]["CallOptions"];

  outputKey = "text";

  outputParser?: BaseLLMOutputParser<T>;

  get inputKeys() {
    return this.prompt.inputVariables;
  }

  get outputKeys() {
    return [this.outputKey];
  }

  constructor(fields: LLMChainInput<T, L>) {
    super(fields);
    this.prompt = fields.prompt;
    this.llm = fields.llm;
    this.llmKwargs = fields.llmKwargs;
    this.outputKey = fields.outputKey ?? this.outputKey;
    this.outputParser =
      fields.outputParser ?? (new NoOpOutputParser() as unknown as BaseOutputParser<T>);
    if (this.prompt.outputParser) {
      if (fields.outputParser) {
        throw new Error("Cannot set both outputParser and prompt.outputParser");
      }
      this.outputParser = this.prompt.outputParser as BaseOutputParser<T>;
    }
  }

  async _getFinalOutput(
    generations: Generation[],
    promptValue: BasePromptValue,
    runManager?: CallbackManagerForChainRun
  ): Promise<unknown> {
    let finalCompletion: unknown;
    if (this.outputParser) {
      finalCompletion = await this.outputParser.parseResultWithPrompt(
        generations,
        promptValue,
        runManager?.getChild()
      );
    } else {
      finalCompletion = generations[0].text;
    }
    return finalCompletion;
  }

  call(
    values: ChainValues & this["llm"]["CallOptions"],
    callbacks?: Callbacks | undefined
  ): Promise<ChainValues> {
    return super.call(values, callbacks);
  }

  async _call(
    values: ChainValues & this["llm"]["CallOptions"],
    runManager?: CallbackManagerForChainRun
  ): Promise<ChainValues> {
    const valuesForPrompt = { ...values };
    const valuesForLLM: this["llm"]["CallOptions"] = {
      ...this.llmKwargs,
    };
    for (const key of this.llm.callKeys) {
      if (key in values) {
        valuesForLLM[key as keyof this["llm"]["CallOptions"]] = values[key];
        delete valuesForPrompt[key];
      }
    }
    const promptValue = await this.prompt.formatPromptValue(valuesForPrompt);
    const { generations } = await this.llm.generatePrompt(
      [promptValue],
      valuesForLLM,
      runManager?.getChild()
    );
    return {
      [this.outputKey]: await this._getFinalOutput(
        generations[0],
        promptValue,
        runManager
      ),
    };
  }

  async predict(
    values: ChainValues & this["llm"]["CallOptions"],
    callbackManager?: CallbackManager
  ): Promise<T> {
    const output = await this.call(values, callbackManager);
    return output[this.outputKey];
  }

  _chainType() {
    return "llm" as const;
  }
}