import { SerializedFields } from "../load/map_keys.js";
import { Serializable } from "../load/serializable.js";
import {
  BaseChatMessage,
  BasePromptValue,
  Example,
  HumanChatMessage,
  InputValues,
  PartialValues,
} from "../schema/index.js";
import { BaseOutputParser } from "../schema/output_parser.js";

export class StringPromptValue extends BasePromptValue {
  lc_namespace = ["langchain", "prompts", "base"];

  value: string;

  constructor(value: string) {
    super(...arguments);
    this.value = value;
  }

  toString() {
    return this.value;
  }

  toChatMessages() {
    return [new HumanChatMessage(this.value)];
  }
}

export interface BasePromptTemplateInput {
  inputVariables: string[];
  outputParser?: BaseOutputParser;
  partialVariables?: PartialValues;
}

export abstract class BasePromptTemplate
  extends Serializable
  implements BasePromptTemplateInput
{
  declare PromptValueReturnType: BasePromptValue;

  lc_serializable = true;

  lc_namespace = ["langchain", "prompts", this._getPromptType()];

  get lc_attributes(): SerializedFields | undefined {
    return {
      partialVariables: undefined,
    };
  }

  inputVariables: string[];

  outputParser?: BaseOutputParser;

  partialVariables: InputValues = {};

  constructor(input: BasePromptTemplateInput) {
    super(input);
    const { inputVariables } = input;
    if (inputVariables.includes("stop")) {
      throw new Error(
        `Cannot have an input variable named 'stop', as it is used internally, please rename.`
      );
    }
    Object.assign(this, input);
  }

  abstract partial(values: PartialValues): Promise<BasePromptTemplate>;

  async mergePartialAndUserVariables(
    userVariables: InputValues
  ): Promise<InputValues> {
    const partialVariables = this.partialVariables ?? {};
    const partialValues: InputValues = {};

    for (const [key, value] of Object.entries(partialValues)) {
      if (typeof value === "string") {
        partialValues[key] = value;
      } else {
        partialValues[key] = await value();
      }
    }

    const allKwargs = { ...partialValues, ...userVariables };
    return allKwargs;
  }

  abstract format(values: InputValues): Promise<string>;

  abstract formatPromptValue(values: InputValues): Promise<BasePromptValue>;

  abstract _getPromptType(): string;
}

export abstract class BaseStringPromptTemplate extends BasePromptTemplate {
  async formatPromptValue(values: InputValues): Promise<StringPromptValue> {
    const formattedPrompt = await this.format(values);
    return new StringPromptValue(formattedPrompt);
  }
}