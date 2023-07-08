import { BaseLLM, BaseLLMParams } from "./base.js";
import { OpenAIInput, OpenAICallOptions } from "../types/openai-types.js";
import { getEnvironmentVariable } from "../util/env.js";
import { CallbackManagerForLLMRun } from "../callbacks/manager.js";
import { LLMResult } from "../schema/index.js";
import { chunkArray } from "../util/chunk.js";
import { calculateMaxTokens } from "../base_language/count_tokens.js";
import fetchAdapter from "../util/axios-fetch-adapter.js";
import { StreamingAxiosConfiguration } from "../util/axios-types.js";
import { isNode } from "../util/env.js";
import { OpenAIChat } from "./openai-chat.js";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
  Configuration,
  ConfigurationParameters,
  CreateCompletionRequest,
  CreateCompletionResponse,
  CreateCompletionResponseChoicesInner,
  OpenAIApi,
} from "openai";
import { TiktokenModel } from "js-tiktoken/lite";

interface TokenUsage {
  completionTokens?: number;
  promptTokens?: number;
  totalTokens?: number;
}

export class OpenAI extends BaseLLM implements OpenAIInput {
  declare CallOptions: OpenAICallOptions;

  get callKeys(): (keyof OpenAICallOptions)[] {
    return ["stop", "signal", "timeout", "options"];
  }

  lc_serializable = true;

  get lc_secrets(): { [key: string]: string } | undefined {
    return {
      openAIApiKey: "OPENAI_API_KEY",
    };
  }

  get lc_aliases(): Record<string, string> {
    return {
      modelName: "model",
      openAIApiKey: "openai_api_key",
    };
  }

  temperature = 0.7;

  maxTokens = 256;

  topP = 1;

  frequencyPenalty = 0;

  presencePenalty = 0;

  n = 1;

  bestOf?: number;

  logitBias?: Record<string, number>;

  modelName = "text-davinci-003";

  modelKwargs?: OpenAIInput["modelKwargs"];

  batchSize = 20;

  timeout?: number;

  stop?: string[];

  streaming = false;

  openAIApiKey?: string;

  private client: OpenAIApi;

  private clientConfig: ConfigurationParameters;

  constructor(
    fields?: Partial<OpenAIInput> &
      BaseLLMParams & {
        configuration?: ConfigurationParameters;
      },
    configuration?: ConfigurationParameters
  ) {
    if (
      fields?.modelName?.startsWith("gpt-3.5-turbo") ||
      fields?.modelName?.startsWith("gpt-4") ||
      fields?.modelName?.startsWith("gpt4-32k")
    ) {
      return new OpenAIChat(fields, configuration) as any as OpenAI;
    }
    super(fields ?? {});

    this.openAIApiKey =
      fields?.openAIApiKey ?? getEnvironmentVariable("OPENAI_API_KEY");

    this.modelName = fields?.modelName ?? this.modelName;
    this.modelKwargs = fields?.modelKwargs ?? {};
    this.batchSize = fields?.batchSize ?? this.batchSize;
    this.timeout = fields?.timeout;

    this.temperature = fields?.temperature ?? this.temperature;
    this.maxTokens = fields?.maxTokens ?? this.maxTokens;
    this.topP = fields?.topP ?? this.topP;
    this.frequencyPenalty = fields?.frequencyPenalty ?? this.frequencyPenalty;
    this.presencePenalty = fields?.presencePenalty ?? this.presencePenalty;
    this.n = fields?.n ?? this.n;
    this.bestOf = fields?.bestOf ?? this.bestOf;
    this.logitBias = fields?.logitBias;
    this.stop = fields?.stop;

    this.streaming = fields?.streaming ?? false;

    if (this.streaming && this.bestOf && this.bestOf > 1) {
      throw new Error("Cannot stream results when bestOf > 1");
    }

    this.clientConfig = {
      apiKey: this.openAIApiKey,
      ...configuration,
      ...fields?.configuration,
    };
  }

  invocationParams(
    options?: this["ParsedCallOptions"]
  ): CreateCompletionRequest {
    return {
      model: this.modelName,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      top_p: this.topP,
      frequency_penalty: this.frequencyPenalty,
      presence_penalty: this.presencePenalty,
      n: this.n,
      best_of: this.bestOf,
      logit_bias: this.logitBias,
      stop: options?.stop ?? this.stop,
      stream: this.streaming,
      ...this.modelKwargs,
    };
  }

  _identifyingParams() {
    return {
      model_name: this.modelName,
      ...this.invocationParams(),
      ...this.clientConfig,
    };
  }

  identifyingParams() {
    return this._identifyingParams();
  }

  async _generate(
    prompts: string[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<LLMResult> {
    const subPrompts = chunkArray(prompts, this.batchSize);
    const choices: CreateCompletionResponseChoicesInner[] = [];
    const tokenUsage: TokenUsage = {};

    const params = this.invocationParams(options);

    if (params.max_tokens === -1) {
      if (prompts.length != 1) {
        throw new Error(
          "max_tokens set to -1 not supported for multiple inputs"
        );
      }
      params.max_tokens = await calculateMaxTokens({
        prompt: prompts[0],
        modelName: this.modelName as TiktokenModel,
      });
    }

    for (let i = 0; i < subPrompts.length; i += 1) {
      const data = params.stream
        ? await new Promise<CreateCompletionResponse>((resolve, reject) => {
            const choices: CreateCompletionResponseChoicesInner[] = [];
            let response: Omit<CreateCompletionResponse, "choices">;
            let rejected = false;
            let resolved = false;
            this.completionWithRetry(
              {
                ...params,
                prompt: subPrompts[i],
              },
              {
                signal: options.signal,
                ...options.options,
                adapter: fetchAdapter,
                responseType: "stream",
                onmessage: (event) => {
                  if (event.data?.trim?.() === "[DONE]") {
                    if (resolved || rejected) {
                      return;
                    }
                    resolved = true;
                    resolve({
                      ...response,
                      choices,
                    });
                  } else {
                    const data = JSON.parse(event.data);

                    if (data?.error) {
                      if (rejected) {
                        return;
                      }
                      rejected = true;
                      reject(data.error);
                      return;
                    }

                    const message = data as Omit<
                      CreateCompletionResponse,
                      "usage"
                    >;

                    if (!response) {
                      response = {
                        id: message.id,
                        object: message.object,
                        created: message.created,
                        model: message.model,
                      };
                    }

                    for (const part of message.choices) {
                      if (part != null && part.index != null) {
                        if (!choices[part.index]) choices[part.index] = {};
                        const choice = choices[part.index];
                        choice.text = (choice.text ?? "") + (part.text ?? "");
                        choice.finish_reason = part.finish_reason;
                        choice.logprobs = part.logprobs;
                        void runManager?.handleLLMNewToken(part.text ?? "", {
                          prompt: Math.floor(part.index / this.n),
                          completion: part.index % this.n,
                        });
                      }
                    }

                    if (
                      !resolved &&
                      !rejected &&
                      choices.every((c) => c.finish_reason != null)
                    ) {
                      resolved = true;
                      resolve({
                        ...response,
                        choices,
                      });
                    }
                  }
                },
              }
            ).catch((error) => {
              if (!rejected) {
                rejected = true;
                reject(error);
              }
            });
        })
      : await this.completionWithRetry(
          {
            ...params,
            prompt: subPrompts[i],
          },
          {
            signal: options.signal,
            ...options.options,
          }
        );
    
      choices.push(...data.choices);

      const {
        completion_tokens: completionTokens,
        prompt_tokens: promptTokens,
        total_tokens: totalTokens,
      } = data.usage ?? {};

      if (completionTokens) {
        tokenUsage.completionTokens =
          (tokenUsage.completionTokens ?? 0) + completionTokens;
      }

      if (promptTokens) {
        tokenUsage.promptTokens = (tokenUsage.promptTokens ?? 0) + promptTokens;
      }

      if (totalTokens) {
        tokenUsage.totalTokens = (tokenUsage.totalTokens ?? 0) + totalTokens;
      }
    }

    const generations = chunkArray(choices, this.n).map((promptChoices) =>
      promptChoices.map((choice) => ({
        text: choice.text ?? "",
        generationInfo: {
          finishReason: choice.finish_reason,
          logprobs: choice.logprobs,
        },
      }))
    );
    return {
      generations,
      llmOutput: { tokenUsage },
    };
  }

  async completionWithRetry(
    request: CreateCompletionRequest,
    options?: StreamingAxiosConfiguration
  ) {
    if (!this.client) {
      const endpoint = this.clientConfig.basePath;
      const clientConfig = new Configuration({
        ...this.clientConfig,
        basePath: endpoint,
        baseOptions: {
          timeout: this.timeout,
          ...this.clientConfig.baseOptions,
        },
      });
      this.client = new OpenAIApi(clientConfig);
    }
    const proxy = new HttpsProxyAgent("http://127.0.0.1:1091")
    const axiosOptions = {
      adapter: isNode() ? undefined : fetchAdapter,
      ...this.clientConfig.baseOptions,
      ...options,
      proxy: false, httpAgent: proxy, httpsAgent: proxy
    } as StreamingAxiosConfiguration;
    console.log(`axiosdebug openai clientConfig=${JSON.stringify(axiosOptions)}`)
    return this.caller
      .call(
        this.client.createCompletion.bind(this.client),
        request,
        axiosOptions
      )
      .then((res) => res.data);
  }

  _llmType() {
    return "openai";
  }
}