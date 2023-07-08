import { ChatCompletionRequestMessageFunctionCall } from "openai";
import { Serializable } from "../load/serializable.js";

export const RUN_KEY = "__run";

export type Example = Record<string, string>;

export type InputValues = Record<string, any>;

export type PartialValues = Record<
  string,
  string | (() => Promise<string>) | (() => string)
>;

export interface Generation {
  text: string;
  generationInfo?: Record<string, any>;
}

export type LLMResult = {
  generations: Generation[][];
  llmOutput?: Record<string, any>;
  [RUN_KEY]?: Record<string, any>;
}

export interface StoredMessageData {
  content: string;
  role: string | undefined;
  name: string | undefined;
  additional_kwargs?: Record<string, any>;
}

export interface StoredMessage {
  type: string;
  data: StoredMessageData;
}

export type MessageType = "human" | "ai" | "generic" | "system" | "function";

export abstract class BaseChatMessage {
  text: string;
  name?: string;
  additional_kwargs: {
    function_call?: ChatCompletionRequestMessageFunctionCall;
    [key: string]: unknown;
  } = {};
  abstract _getType(): MessageType;

  constructor(text: string, kwargs?: Record<string, unknown>) {
    this.text = text;
    this.additional_kwargs = kwargs || {};
  }

  toJSON(): StoredMessage {
    return {
      type: this._getType(),
      data: {
        content: this.text,
        role: "role" in this ? (this.role as string) : undefined,
        name: this.name,
        additional_kwargs: this.additional_kwargs,
      },
    };
  }
}

export class HumanChatMessage extends BaseChatMessage {
  _getType(): MessageType {
    return "human";
  }
}

export class AIChatMessage extends BaseChatMessage {
  _getType(): MessageType {
      return "ai";
  }
}

export class SystemChatMessage extends BaseChatMessage {
    _getType(): MessageType {
        return "system";
    }
}

export class FunctionChatMessage extends BaseChatMessage {
  constructor(text: string, name: string) {
    super(text);
    this.name = name;
  }

  _getType(): MessageType {
      return "function";
  }
}

export class ChatMessage extends BaseChatMessage {
  role: string;

  constructor(text: string, role: string) {
    super(text);
    this.role = role;
  }

  _getType(): MessageType {
      return "generic";
  }
}

export interface ChatGeneration extends Generation {
  message: BaseChatMessage;
}

export interface ChatResult {
  generations: ChatGeneration[];
  llmOutput?: Record<string, any>;
}

export abstract class BasePromptValue extends Serializable {
  abstract toString(): string;
  abstract toChatMessages(): BaseChatMessage[];
}

export type AgentAction = {
  tool: string;
  toolInput: string;
  log: string;
}

export type AgentFinish = {
  returnValues: Record<string, any>;
  log: string;
}

export type AgentStep = {
  action: AgentAction;
  observation: string;
};

export type ChainValues = Record<string, any>;

export abstract class BaseRetriever {
  abstract getRelevantDocuments(query: string): Promise<Document[]>;
}

export abstract class BaseChatMessageHistory extends Serializable {
  public abstract getMessages(): Promise<BaseChatMessage[]>;
  public abstract addUserMessage(message: string): Promise<void>;
  public abstract addAIChatMessage(message: string): Promise<void>;
  public abstract clear(): Promise<void>;
}

export abstract class BaseListChatMessageHistory extends Serializable {
  protected abstract addMessage(message: BaseChatMessage): Promise<void>;

  public addUserMessage(message: string): Promise<void> {
    return this.addMessage(new HumanChatMessage(message));
  }

  public addAIChatMessage(message: string): Promise<void> {
    return this.addMessage(new AIChatMessage(message));
  }
}

export abstract class BaseCache<T = Generation[]> {
  abstract lookup(prompt: string, llmKey: string): Promise<T | null>;
  abstract update(prompt: string, llmKey: string, value: T): Promise<void>;
}

export abstract class BaseFileStore extends Serializable {
  abstract readFile(path: string): Promise<string>;
  abstract writeFile(path: string, contents: string): Promise<void>;
}

export abstract class BaseEntityStore extends Serializable {
  abstract get(key: string, defaultValue?: string): Promise<string | undefined>;
  abstract set(key: string, value?: string): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract exist(key: string): Promise<boolean>;
  abstract clear(): Promise<void>;
}

export abstract class Docstore {
  abstract search(search: string): Promise<Document>;
  abstract add(texts: Record<string, Document>): Promise<void>;
}
