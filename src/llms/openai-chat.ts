import { OpenAICallOptions, OpenAIChatInput } from "../types/openai-types.js";
import { getEnvironmentVariable } from "../util/env.js";
import { BaseLLMParams, LLM } from "./base.js";
import { CallbackManagerForLLMRun } from "../callbacks/manager.js";
import fetchAdapter from "../util/axios-fetch-adapter.js";
import { StreamingAxiosConfiguration } from "../util/axios-types.js";
import { isNode } from "../util/env.js";
// import { HttpsProxyAgent } from "https-proxy-agent";
import {
    Configuration,
    OpenAIApi,
    ChatCompletionRequestMessage,
    CreateChatCompletionRequest,
    ConfigurationParameters,
    ChatCompletionResponseMessageRoleEnum,
    CreateChatCompletionResponse,
  } from "openai";

export interface OpenAIChatCallOptions extends OpenAICallOptions {
  promptIndex?: number;
}

export class OpenAIChat
  extends LLM
  implements OpenAIChatInput
{
  declare CallOptions: OpenAIChatCallOptions;

  get callKeys(): (keyof OpenAIChatCallOptions)[] {
    return ["stop", "signal", "timeout", "options", "promptIndex"];
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

  temperature = 1;

  topP = 1;

  frequencyPenalty = 0;

  presencePenalty = 0;

  n = 1;

  logitBias?: Record<string, number>;

  maxTokens?: number;

  modelName = "gpt-3.5-turbo";

  prefixMessages?: ChatCompletionRequestMessage[];

  modelKwargs?: OpenAIChatInput["modelKwargs"];

  timeout?: number;

  stop?: string[];

  streaming = false;

  openAIApiKey?: string;

  private client: OpenAIApi;

  private clientConfig: ConfigurationParameters;

  constructor(
    fields?: Partial<OpenAIChatInput> &
      BaseLLMParams & {
        configuration?: ConfigurationParameters;
      },
    configuration?: ConfigurationParameters
  ) {
    super(fields ?? {});

    this.openAIApiKey =
      fields?.openAIApiKey ?? getEnvironmentVariable("OPENAI_API_KEY");

    if (!this.openAIApiKey) {
      throw new Error("OpenAI API key not found");
    }

    this.modelName = fields?.modelName ?? this.modelName;
    this.prefixMessages = fields?.prefixMessages ?? this.prefixMessages;
    this.modelKwargs = fields?.modelKwargs ?? {};
    this.timeout = fields?.timeout;

    this.temperature = fields?.temperature ?? this.temperature;
    this.topP = fields?.topP ?? this.topP;
    this.frequencyPenalty = fields?.frequencyPenalty ?? this.frequencyPenalty;
    this.presencePenalty = fields?.presencePenalty ?? this.presencePenalty;
    this.n = fields?.n ?? this.n;
    this.logitBias = fields?.logitBias;
    this.maxTokens = fields?.maxTokens;
    this.stop = fields?.stop;

    this.streaming = fields?.streaming ?? false;

    if (this.n > 1) {
      throw new Error(
        "Cannot use n > 1 in OpenAIChat LLM. Use ChatOpenAI Chat Model instead."
      );
    }

    this.clientConfig = {
      apiKey: this.openAIApiKey,
      ...configuration,
      ...fields?.configuration,
    };
  }

  invocationParams(
    options?: this["ParsedCallOptions"]
  ): Omit<CreateChatCompletionRequest, "messages"> {
    return {
      model: this.modelName,
      temperature: this.temperature,
      top_p: this.topP,
      frequency_penalty: this.frequencyPenalty,
      presence_penalty: this.presencePenalty,
      n: this.n,
      logit_bias: this.logitBias,
      max_tokens: this.maxTokens === -1 ? undefined : this.maxTokens,
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
    return {
      model_name: this.modelName,
      ...this.invocationParams(),
      ...this.clientConfig,
    };
  }

  private formatMessages(prompt: string): ChatCompletionRequestMessage[] {
    const message: ChatCompletionRequestMessage = {
      role: "user",
      content: prompt,
    };
    return this.prefixMessages ? [...this.prefixMessages, message] : [message];
  }

  async _call(
    prompt: string,
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    const params = this.invocationParams(options);

    const data = params.stream
      ? await new Promise<CreateChatCompletionResponse>((resolve, reject) => {
          let response: CreateChatCompletionResponse;
          let rejected = false;
          let resolved = false;
          this.completionWithRetry(
            {
              ...params,
              messages: this.formatMessages(prompt),
            },
            {
              signal: options.signal,
              ...options.options,
              adapter: fetchAdapter, // default adapter doesn't do streaming
              responseType: "stream",
              onmessage: (event) => {
                if (event.data?.trim?.() === "[DONE]") {
                  if (resolved || rejected) {
                    return;
                  }
                  resolved = true;
                  resolve(response);
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

                  const message = data as {
                    id: string;
                    object: string;
                    created: number;
                    model: string;
                    choices: Array<{
                      index: number;
                      finish_reason: string | null;
                      delta: { content?: string; role?: string };
                    }>;
                  };

                  // on the first message set the response properties
                  if (!response) {
                    response = {
                      id: message.id,
                      object: message.object,
                      created: message.created,
                      model: message.model,
                      choices: [],
                    };
                  }

                  // on all messages, update choice
                  for (const part of message.choices) {
                    if (part != null) {
                      let choice = response.choices.find(
                        (c) => c.index === part.index
                      );

                      if (!choice) {
                        choice = {
                          index: part.index,
                          finish_reason: part.finish_reason ?? undefined,
                        };
                        response.choices.push(choice);
                      }

                      if (!choice.message) {
                        choice.message = {
                          role: part.delta
                            ?.role as ChatCompletionResponseMessageRoleEnum,
                          content: part.delta?.content ?? "",
                        };
                      }

                      choice.message.content += part.delta?.content ?? "";
                      // eslint-disable-next-line no-void
                      void runManager?.handleLLMNewToken(
                        part.delta?.content ?? "",
                        {
                          prompt: options.promptIndex ?? 0,
                          completion: part.index,
                        }
                      );
                    }
                  }

                  // when all messages are finished, resolve
                  if (
                    !resolved &&
                    !rejected &&
                    message.choices.every((c) => c.finish_reason != null)
                  ) {
                    resolved = true;
                    resolve(response);
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
            messages: this.formatMessages(prompt),
          },
          {
            signal: options.signal,
            ...options.options,
          }
        );

    return data.choices[0].message?.content ?? "";
  }

  async completionWithRetry(
    request: CreateChatCompletionRequest,
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
    // const proxy = new HttpsProxyAgent("http://127.0.0.1:1091")
    const axiosOptions = {
      adapter: isNode() ? undefined : fetchAdapter,
      ...this.clientConfig.baseOptions,
      ...options,
      // proxy: false, httpAgent: proxy, httpsAgent: proxy
    } as StreamingAxiosConfiguration;
    // console.log(`axiosdebug openai-chat clientConfig=${JSON.stringify(axiosOptions)}`)

    return this.caller
      .call(
        this.client.createChatCompletion.bind(this.client),
        request,
        axiosOptions
      )
      .then((res) => res.data);
  }

  _llmType() {
    return "openai";
  }
}