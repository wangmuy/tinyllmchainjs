import { BaseLangChain, BaseLangChainParams } from "../base_language/index.js";
import { CallbackManager, CallbackManagerForChainRun, Callbacks } from "../callbacks/manager.js";
import { BaseMemory } from "../memory/base.js";
import { ChainValues, RUN_KEY } from "../schema/index.js";

export type LoadValues = Record<string, any>;

export interface ChainInputs extends BaseLangChainParams {
  memory?: BaseMemory;
  callbackManager?: CallbackManager;
}

export abstract class BaseChain extends BaseLangChain implements ChainInputs {
  declare memory?: BaseMemory;

  get lc_namespace(): string[] {
    return ["langchain", "chains", this._chainType()];
  }

  constructor(
    fields?: BaseMemory | ChainInputs,
    verbose?: boolean,
    callbacks?: Callbacks
  ) {
    if (
      arguments.length === 1 &&
      typeof fields === "object" &&
      !("saveContext" in fields)
    ) {
      const { memory, callbackManager, ...rest } = fields;
      super({ ...rest, callbacks: callbackManager ?? rest.callbacks });
      this.memory = memory;
    } else {
      super({ verbose, callbacks });
      this.memory = fields as BaseMemory;
    }
  }

  _selectMemoryInputs(values: ChainValues): ChainValues {
    const valuesForMemory = { ...values };
    if ("signal" in valuesForMemory) {
      delete valuesForMemory.signal;
    }
    return valuesForMemory;
  }

  abstract _call(
    values: ChainValues,
    runManager?: CallbackManagerForChainRun
  ): Promise<ChainValues>;

  abstract _chainType(): string;

  abstract get inputKeys(): string[];

  abstract get outputKeys(): string[];

  async run(
    input: any,
    callbacks?: Callbacks
  ): Promise<string> {
    const inputKeys = this.inputKeys.filter(
      (k) => !this.memory?.memoryKeys.includes(k) ?? true
    );
    const isKeylessInput = inputKeys.length <= 1;
    if (!isKeylessInput) {
      throw new Error(
        `Chain ${this._chainType()} expects multiple inputs, cannot use 'run' `
      );
    }
    const values = inputKeys.length ? { [inputKeys[0]]: input } : {};
    const returnValues = await this.call(values, callbacks);
    const keys = Object.keys(returnValues);

    if (keys.length === 1) {
      return returnValues[keys[0]];
    }
    throw new Error(
      "return values have multiple keys `run` only supported when one key currently"
    );
  }

  async call(
    values: ChainValues & { signal?: AbortSignal },
    callbacks?: Callbacks,
    tags?: string[]
  ): Promise<ChainValues> {
    const fullValues = { ...values } as typeof values;
    if (!(this.memory == null)) {
        const newValues = await this.memory.loadMemoryVariables(
          this._selectMemoryInputs(values)
        );
        for (const [key, value] of Object.entries(newValues)) {
          fullValues[key] = value;
        }
    }
    const callbackManager_ = await CallbackManager.configure(
      callbacks,
      this.callbacks,
      tags,
      this.tags,
      { verbose: this.verbose }
    );
    const runManager = await callbackManager_?.handleChainStart(
      this.toJSON(),
      fullValues
    );
    let outputValues;
    try {
      outputValues = (await Promise.race([
        this._call(fullValues, runManager),
        new Promise((_, reject) => {
          values.signal?.addEventListener("abort", () => {
            reject(new Error("AbortError"));
          });
        }),
      ])) as ChainValues;
    } catch (e) {
      await runManager?.handleChainError(e);
      throw e;
    }
    if (!(this.memory == null)) {
      await this.memory.saveContext(
        this._selectMemoryInputs(values),
        outputValues
      );
    }
    await runManager?.handleChainEnd(outputValues);
    Object.defineProperty(outputValues, RUN_KEY, {
      value: runManager ? { runId: runManager?.runId } : undefined,
      configurable: true,
    });
    return outputValues;
  }

  async apply(
    inputs: ChainValues[],
    callbacks?: Callbacks[]
  ): Promise<ChainValues[]> {
    return Promise.all(
      inputs.map(async (i, idx) => this.call(i, callbacks?.[idx]))
    );
  }
}