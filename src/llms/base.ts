import { BaseLanguageModel, BaseLanguageModelCallOptions, BaseLanguageModelParams } from "../base_language/index.js";
import { CallbackManager, CallbackManagerForLLMRun, Callbacks } from "../callbacks/manager.js";
import { getBufferString } from "../memory/base.js";
import { AIChatMessage, BaseCache, BaseChatMessage, BasePromptValue, Generation, LLMResult, RUN_KEY } from "../schema/index.js";
import { InMemoryCache } from "../cache/index.js";

export type SerializedLLM = {
  _model: string;
  _type: string;
} & Record<string, any>;

export interface BaseLLMParams extends BaseLanguageModelParams {
  concurrency?: number;
  cache?: BaseCache | boolean;
}

export interface BaseLLMCallOptions extends BaseLanguageModelCallOptions {}

export abstract class BaseLLM extends BaseLanguageModel {
  declare CallOptions: BaseLLMCallOptions;

  declare ParsedCallOptions: Omit<this["CallOptions"], "timeout">;

  lc_namespace = ["langchain", "llms", this._llmType()];

  cache?: BaseCache;

  constructor({ cache, concurrency, ...rest }: BaseLLMParams) {
    super(concurrency ? { maxConcurrency: concurrency, ...rest } : rest);
    if (typeof cache === "object") {
      this.cache = cache;
    } else if (cache) {
      this.cache = InMemoryCache.global();
    } else {
      this.cache = undefined;
    }
  }

  async generatePrompt(
    promptValues: BasePromptValue[],
    options?: string[] | this["CallOptions"],
    callbacks?: Callbacks
  ): Promise<LLMResult> {
    const prompts: string[] = promptValues.map((promptValue) =>
      promptValue.toString()
    );
    return this.generate(prompts, options, callbacks);
  }

  abstract _generate(
    prompts: string[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<LLMResult>;

  invocationParams(_options?: this["ParsedCallOptions"]): any {
    return {};
  }

  _flattenLLMResult(llmResult: LLMResult): LLMResult[] {
    const llmResults: LLMResult[] = [];

    for (let i = 0; i < llmResult.generations.length; i += 1) {
      const genList = llmResult.generations[i];

      if (i === 0) {
        llmResults.push({
          generations: [genList],
          llmOutput: llmResult.llmOutput,
        });
      } else {
        const llmOutput = llmResult.llmOutput
          ? { ...llmResult.llmOutput, tokenUsage: {} }
          : undefined;

        llmResults.push({
          generations: [genList],
          llmOutput,
        });
      }
    }

    return llmResults;
  }

  async _generateUncached(
    prompts: string[],
    options: this["ParsedCallOptions"],
    callbacks?: Callbacks
  ): Promise<LLMResult> {
    const callbackManager_ = await CallbackManager.configure(
      callbacks,
      this.callbacks,
      options.tags,
      this.tags,
      { verbose: this.verbose }
    );
    const extra = {
      options,
      invocation_params: this?.invocationParams(options),
    };
    const runManagers = await callbackManager_?.handleLLMStart(
      this.toJSON(),
      prompts,
      undefined,
      undefined,
      extra
    );

    let output;
    try {
      output = await this._generate(prompts, options, runManagers?.[0]);
    } catch (err) {
      await Promise.all(
        (runManagers ?? []).map((runManager) => runManager?.handleLLMError(err))
      );
      throw err;
    }

    const flattenedOutputs: LLMResult[] = this._flattenLLMResult(output);
    await Promise.all(
      (runManagers ?? []).map((runManager, i) =>
        runManager?.handleLLMEnd(flattenedOutputs[i])
      )
    );
    const runIds = runManagers?.map((manager) => manager.runId) || undefined;
    Object.defineProperty(output, RUN_KEY, {
      value: runIds ? { runIds } : undefined,
      configurable: true,
    });
    return output;
  }

  async generate(
    prompts: string[],
    options?: string[] | this["CallOptions"],
    callbacks?: Callbacks
  ): Promise<LLMResult> {
    if (!Array.isArray(prompts)) {
      throw new Error("Argument 'prompts' is expected to be a string[]");
    }

    let parsedOptions: this["CallOptions"];
    if (Array.isArray(options)) {
      parsedOptions = { stop: options } as this["ParsedCallOptions"];
    } else if (options?.timeout && !options.signal) {
      parsedOptions = {
        ...options,
        signal: AbortSignal.timeout(options.timeout),
      };
    } else {
      parsedOptions = options ?? {};
    }

    if (!this.cache) {
      return this._generateUncached(prompts, parsedOptions, callbacks);
    }

    const { cache } = this;
    const params = this.serialize();
    params.stop = parsedOptions.stop ?? params.stop;

    const llmStringKey = `${Object.entries(params).sort()}`;
    const missingPromptIndices: number[] = [];
    const generations = await Promise.all(
      prompts.map(async (prompt, index) => {
        const result = await cache.lookup(prompt, llmStringKey);
        if (!result) {
          missingPromptIndices.push(index);
        }
        return result;
      })
    );

    let llmOutput = {};
    if (missingPromptIndices.length > 0) {
      const results = await this._generateUncached(
        missingPromptIndices.map((i) => prompts[i]),
        parsedOptions,
        callbacks
      );
      await Promise.all(
        results.generations.map(async (generation, index) => {
            const promptIndex = missingPromptIndices[index];
            generations[promptIndex] = generation;
            return cache.update(prompts[promptIndex], llmStringKey, generation);
        })
      );
      llmOutput = results.llmOutput ?? {};
    }

    return { generations, llmOutput } as LLMResult;
  }

  async call(
    prompt: string,
    options?: string[] | this["CallOptions"],
    callbacks?: Callbacks
  ): Promise<string> {
    const { generations } = await this.generate(
      [prompt],
      options ?? {},
      callbacks
    );
    return generations[0][0].text;
  }

  async predict(
    text: string,
    options?: string[] | this["CallOptions"],
    callbacks?: Callbacks
  ): Promise<string> {
    return this.call(text, options, callbacks);
  }

  async predictMessages(
    messages: BaseChatMessage[],
    options?: string[] | this["CallOptions"],
    callbacks?: Callbacks
  ): Promise<BaseChatMessage> {
    const text = getBufferString(messages);
    const prediction = await this.call(text, options, callbacks);
    return new AIChatMessage(prediction);
  }

  _identifyingParams(): Record<string, any> {
    return {};
  }

  abstract _llmType(): string;

  serialize(): SerializedLLM {
    return {
      ...this._identifyingParams(),
      _type: this._llmType(),
      _model: this._modelType(),
    };
  }

  _modelType(): string {
    return "base_llm" as const;
  }
}

export abstract class LLM extends BaseLLM {
  abstract _call(
    prompt: string,
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<string>;

  async _generate(
    prompts: string[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<LLMResult> {
    const generations: Generation[][] = await Promise.all(
      prompts.map((prompt, promptIndex) =>
        this._call(prompt, { ...options, promptIndex }, runManager).then(
          (text) => [{ text }]
        )
      )
    );
    return { generations };
  }
}