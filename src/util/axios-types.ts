import type { AxiosRequestConfig } from "axios";
import type { EventSourceMessage } from "./event-source-parse.js";

export interface StreamingAxiosRequestConfig extends AxiosRequestConfig {
  responseType: "stream";

  onmessage?: (ev: EventSourceMessage) => void;
}

export type StreamingAxiosConfiguration =
  | StreamingAxiosRequestConfig
  | AxiosRequestConfig;