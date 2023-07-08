import { v4 as uuidv4 } from "uuid";
import { Serialized } from "../load/serializable.js";
import { AgentAction, AgentFinish, BaseChatMessage, ChainValues, LLMResult } from "../schema/index.js";
import { BaseCallbackHandler, CallbackHandlerMethods, NewTokenIndices } from "./base.js";
import { consumeCallback } from "./promises.js";
import { getBufferString } from "../memory/base.js";
import { getEnvironmentVariable } from "../util/env.js";
import { ConsoleCallbackHandler } from "./handlers/console.js";

type BaseCallbackManagerMethods = {
  [K in keyof CallbackHandlerMethods]?: (
    ...args: Parameters<Required<CallbackHandlerMethods>[K]>
  ) => Promise<unknown>;
};

export interface CallbackManagerOptions {
  verbose?: boolean;
  tracing?: boolean;
}

export type Callbacks =
 | CallbackManager
 | (BaseCallbackHandler | CallbackHandlerMethods)[];

export abstract class BaseCallbackManager {
  abstract addHandler(handler: BaseCallbackHandler): void;
  abstract removeHandler(handler: BaseCallbackHandler): void;
  abstract setHandlers(handlers: BaseCallbackHandler[]): void;
  setHandler(handler: BaseCallbackHandler): void {
    return this.setHandlers([handler]);
  }
}

class BaseRunManager {
  constructor(
    public readonly runId: string,
    protected readonly handlers: BaseCallbackHandler[],
    protected readonly inheritableHandlers: BaseCallbackHandler[],
    protected readonly tags: string[],
    protected readonly inheritableTags: string[],
    protected readonly _parentRunId?: string
  ) {}

  async handleText(text: string): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          try {
            await handler.handleText?.(text, this.runId, this._parentRunId);
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleText: ${err}`
            );
          }
        }, handler.awaitHandlers)
      )
    );
  }
}

export class CallbackManagerForLLMRun
extends BaseRunManager
implements BaseCallbackManagerMethods
{
  async handleLLMNewToken(
    token: string,
    idx: NewTokenIndices = { prompt: 0, completion: 0 }
  ): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreLLM) {
            try {
              await handler.handleLLMNewToken?.(
                token,
                idx,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleLLMNewToken: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }

  async handleLLMError(err: Error | unknown): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreLLM) {
            try {
              await handler.handleLLMError?.(
                err,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleLLMError: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }

  async handleLLMEnd(output: LLMResult): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreLLM) {
            try {
              await handler.handleLLMEnd?.(
                output,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleLLMEnd: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }
}

export class CallbackManagerForChainRun
  extends BaseRunManager
  implements BaseCallbackManagerMethods
{
  getChild(tag?: string): CallbackManager {
    const manager = new CallbackManager(this.runId);
    manager.setHandlers(this.inheritableHandlers);
    manager.addTags(this.inheritableTags);
    if (tag) {
      manager.addTags([tag], false);
    }
    return manager;
  }

  async handleChainError(err: Error | unknown): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreChain) {
            try {
              await handler.handleChainError?.(
                err,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleChainError: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }

  async handleChainEnd(output: ChainValues): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreChain) {
            try {
              await handler.handleChainEnd?.(
                output,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleChainEnd: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }

  async handleAgentAction(action: AgentAction): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreAgent) {
            try {
              await handler.handleAgentAction?.(
                action,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleAgentAction: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }

  async handleAgentEnd(action: AgentFinish): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreAgent) {
            try {
                await handler.handleAgentEnd?.(
                  action,
                  this.runId,
                  this._parentRunId
                );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleAgentEnd: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }
}

export class CallbackManagerForToolRun
  extends BaseRunManager
  implements BaseCallbackManagerMethods
{
  getChild(tag?: string): CallbackManager {
    const manager = new CallbackManager(this.runId);
    manager.setHandlers(this.inheritableHandlers);
    manager.addTags(this.inheritableTags)
    if (tag) {
      manager.addTags([tag], false);
    }
    return manager;
  }

  async handleToolError(err: Error | unknown): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) => {
        consumeCallback(async () => {
          if (!handler.ignoreAgent) {
            try {
              await handler.handleToolError?.(
                err,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleToolError: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      })
    );
  }

  async handleToolEnd(output: string): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreAgent) {
            try {
              await handler.handleToolEnd?.(
                output,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleToolEnd: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }
}

 export class CallbackManager
   extends BaseCallbackManager
   implements BaseCallbackManagerMethods
{
  handlers: BaseCallbackHandler[];

  inheritableHandlers: BaseCallbackHandler[];

  tags: string[] = [];

  inheritableTags: string[] = [];

  name = "callback_manager";

  private readonly _parentRunId?: string;

  constructor(parentRunId?: string) {
    super();
    this.handlers = [];
    this.inheritableHandlers = [];
    this._parentRunId = parentRunId;
  }

  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    _runId: string | undefined = undefined,
    _parenRunId: string | undefined = undefined,
    extraParams: Record<string, unknown> | undefined = undefined,
  ): Promise<CallbackManagerForLLMRun[]> {
    return Promise.all(
      prompts.map(async (prompt) => {
        const runId = uuidv4();

        await Promise.all(
          this.handlers.map((handler) =>
            consumeCallback(async() => {
              if (!handler.ignoreLLM) {
                try {
                  await handler.handleLLMStart?.(
                    llm,
                    [prompt],
                    runId,
                    this._parentRunId,
                    extraParams,
                    this.tags
                  );
                } catch (err) {
                  console.error(
                    `Error in handler ${handler.constructor.name}, handleLLMStart: ${err}`
                  );
                }
              }
            }, handler.awaitHandlers)
          )
        );

        return new CallbackManagerForLLMRun(
          runId,
          this.handlers,
          this.inheritableHandlers,
          this.tags,
          this.inheritableTags,
          this._parentRunId
        );
      })
    );
  }

  async handleChatModelStart(
    llm: Serialized,
    messages: BaseChatMessage[][],
    _runId: string | undefined = undefined,
    _parentRunId: string | undefined = undefined,
    extraParams: Record<string, unknown> | undefined = undefined,
  ): Promise<CallbackManagerForLLMRun[]> {
    return Promise.all(
      messages.map(async (messageGroup) => {
        const runId = uuidv4();

        await Promise.all(
          this.handlers.map((handler) =>
            consumeCallback(async () => {
              if (!handler.ignoreLLM) {
                try {
                  if (handler.handleChatModelStart) {
                    await handler.handleChatModelStart?.(
                      llm,
                      [messageGroup],
                      runId,
                      this._parentRunId,
                      extraParams,
                      this.tags
                    );
                  } else if (handler.handleLLMStart) {
                    const messageString = getBufferString(messageGroup);
                    await handler.handleLLMStart?.(
                      llm,
                      [messageString],
                      runId,
                      this._parentRunId,
                      extraParams,
                      this.tags
                    );
                  }
                } catch (err) {
                    console.error(
                      `Error in handler ${handler.constructor.name}, handleLLMStart: ${err}`
                    );
                }
              }
            }, handler.awaitHandlers)
          )
        );

        return new CallbackManagerForLLMRun(
          runId,
          this.handlers,
          this.inheritableHandlers,
          this.tags,
          this.inheritableTags,
          this._parentRunId
        );
      })
    );
  }

  async handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId = uuidv4()
  ): Promise<CallbackManagerForChainRun> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreChain) {
            try {
              await handler.handleChainStart?.(
                chain,
                inputs,
                runId,
                this._parentRunId,
                this.tags
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleChainStart: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
    return new CallbackManagerForChainRun(
      runId,
      this.handlers,
      this.inheritableHandlers,
      this.tags,
      this.inheritableTags,
      this._parentRunId
    );
  }

  async handleToolStart(
    tool: Serialized,
    input: string,
    runId = uuidv4()
  ): Promise<CallbackManagerForToolRun> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreAgent) {
            try {
              await handler.handleToolStart?.(
                tool,
                input,
                runId,
                this._parentRunId,
                this.tags
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleToolStart: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
    return new CallbackManagerForToolRun(
      runId,
      this.handlers,
      this.inheritableHandlers,
      this.tags,
      this.inheritableTags,
      this._parentRunId
    )
  }

  addHandler(handler: BaseCallbackHandler, inherit = true): void {
    this.handlers.push(handler);
    if (inherit) {
        this.inheritableHandlers.push(handler);
    }
  }

  removeHandler(handler: BaseCallbackHandler): void {
    this.handlers = this.handlers.filter((_handler) => _handler !== handler);
    this.inheritableHandlers = this.inheritableHandlers.filter(
      (_handler) => _handler !== handler
    );
  }

  setHandlers(handlers: BaseCallbackHandler[], inherit = true): void {
    this.handlers = []
    this.inheritableHandlers = []
    for (const handler of handlers) {
      this.addHandler(handler, inherit)
    }
  }

  addTags(tags: string[], inherit = true): void {
    this.removeTags(tags);
    this.tags.push(...tags);
    if (inherit) {
      this.inheritableTags.push(...tags);
    }
  }

  removeTags(tags: string[]): void {
    this.tags = this.tags.filter((tag) => !tags.includes(tag));
    this.inheritableTags = this.inheritableTags.filter(
      (tag) => !tags.includes(tag)
    );
  }

  copy(
    additionalHandlers: BaseCallbackHandler[] = [],
    inherit = true
  ): CallbackManager {
    const manager = new CallbackManager(this._parentRunId);
    for (const handler of this.handlers) {
      const inheritable = this.inheritableHandlers.includes(handler);
      manager.addHandler(handler, inheritable);
    }
    for (const tag of this.tags) {
      const inheritable = this.inheritableTags.includes(tag);
      manager.addTags([tag], inheritable);
    }
    for (const handler of additionalHandlers) {
      if (
        manager.handlers
          .filter((h) => h.name === "console_callback_handler")
          .some((h) => h.name === handler.name)
      ) {
        continue;
      }
      manager.addHandler(handler, inherit);
    }
    return manager;
  }

  static async configure(
    inheritableHandlers?: Callbacks,
    localHandlers?: Callbacks,
    inheritableTags?: string[],
    localTags?: string[],
    options?: CallbackManagerOptions
  ): Promise<CallbackManager | undefined> {
    let callbackManager: CallbackManager | undefined;
    if (inheritableHandlers || localHandlers) {
      if (Array.isArray(inheritableHandlers) || !inheritableHandlers) {
        callbackManager = new CallbackManager();
        callbackManager.setHandlers(
          inheritableHandlers?.map(ensureHandler) ?? [],
          true
        );
      } else {
        callbackManager = inheritableHandlers;
      }
      callbackManager = callbackManager.copy(
        Array.isArray(localHandlers)
          ? localHandlers.map(ensureHandler)
          : localHandlers?.handlers,
        false
      );
    }

    const verboseEnabled =
      getEnvironmentVariable("LANGCHAIN_VERBOSE") || options?.verbose;
    const tracingV2Enabled =
      getEnvironmentVariable("LANGCHAIN_TRACING_V2") ?? false;
    const tracingEnabled =
      tracingV2Enabled ||
      (getEnvironmentVariable("LANGCHAIN_TRACING") ?? false);
    if (verboseEnabled || tracingEnabled) {
      if (!callbackManager) {
        callbackManager = new CallbackManager();
      }
      if (
        verboseEnabled &&
        !callbackManager.handlers.some(
          (handler) => handler.name === ConsoleCallbackHandler.prototype.name
        )
      ) {
        const consoleHandler = new ConsoleCallbackHandler();
        callbackManager.addHandler(consoleHandler, true);
      }
    }
    if (inheritableTags || localTags) {
      if (callbackManager) {
        callbackManager.addTags(inheritableTags ?? []);
        callbackManager.addTags(localTags ?? [], false);
      }
    }
    return callbackManager;
  }
}

function ensureHandler(
  handler: BaseCallbackHandler | CallbackHandlerMethods
): BaseCallbackHandler {
  if ("name" in handler) {
    return handler;
  }
  return BaseCallbackHandler.fromMethods(handler);
}