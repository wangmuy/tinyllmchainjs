import { BaseCallbackHandler, BaseCallbackHandlerInput } from "../base.js";

export type RunType = "llm" | "chain" | "tool";

export interface BaseRun {
  name: string;
  parent_run_id: string;
  run_type: RunType;
}

export interface Run extends BaseRun {
  id: string;
  start_time: number;
  execution_order: number;
  child_runs: this[];
  child_execution_order: number;
  events: Array<{
    name: string;
    time: number;
    kwargs?: Record<string, unknown>;
  }>;
}

export abstract class BaseTracer extends BaseCallbackHandler {
  protected runMap: Map<string, Run> = new Map();

  constructor(_fields?: BaseCallbackHandlerInput) {
    super(...arguments);
  }
}