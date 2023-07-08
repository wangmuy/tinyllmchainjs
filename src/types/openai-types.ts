import { AxiosRequestConfig } from "axios";
import { ChatCompletionRequestMessage } from "openai";
import { BaseLanguageModelCallOptions } from "../base_language/index.js";

export declare interface OpenAIBaseInput {
  temperature: number;
  maxTokens?: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  n: number;
  logitBias?: Record<string, number>;
  streaming: boolean;
  modelName: string;
  modelKwargs?: Record<string, any>;
  stop?: string[];
  timeout?: number;
  openAIApiKey?: string;
}

export interface OpenAICallOptions extends BaseLanguageModelCallOptions {
  signal?: AbortSignal;
  options?: AxiosRequestConfig;
}

export declare interface OpenAIInput extends OpenAIBaseInput {
  bestOf?: number;
  batchSize: number;
}

export interface OpenAIChatInput extends OpenAIBaseInput {
  prefixMessages?: ChatCompletionRequestMessage[];
}