import { InputValues, PartialValues } from "../schema/index.js";
import { BasePromptTemplate, BasePromptTemplateInput, BaseStringPromptTemplate } from "./base.js";
import { TemplateFormat, parseTemplate, renderTemplate, checkValidTemplate } from "./template.js";

export interface PromptTemplateInput extends BasePromptTemplateInput {
  template: string;
  templateFormat?: TemplateFormat;
  validateTemplate?: boolean;
}

export class PromptTemplate
  extends BaseStringPromptTemplate
  implements PromptTemplateInput
{
  template: string;

  templateFormat: TemplateFormat = "f-string";

  validateTemplate = false;

  constructor(input: PromptTemplateInput) {
    super(input);
    Object.assign(this, input);

    if (this.validateTemplate) {
        let totalInputVariables = this.inputVariables;
        if (this.partialVariables) {
          totalInputVariables = totalInputVariables.concat(
            Object.keys(this.partialVariables)
          );
        }
        checkValidTemplate(
          this.template,
          this.templateFormat,
          totalInputVariables
        );
    }
  }

  _getPromptType(): "prompt" {
    return "prompt";
  }

  async format(values: InputValues): Promise<string> {
    const allValues = await this.mergePartialAndUserVariables(values);
    return renderTemplate(this.template, this.templateFormat, allValues);
  }

  static fromExamples(
    examples: string[],
    suffix: string,
    inputVariables: string[],
    exampleSeparator = "\n\n",
    prefix = ""
  ) {
    const template = [prefix, ...examples, suffix].join(exampleSeparator);
    return new PromptTemplate({
      inputVariables,
      template,
    });
  }

  static fromTemplate(
    template: string,
    {
      templateFormat = "f-string",
      ...rest
    }: Omit<PromptTemplateInput, "template" | "inputVariables"> = {}
  ) {
    const names = new Set<string>();
    parseTemplate(template, templateFormat).forEach((node) => {
      if (node.type === "variable") {
        names.add(node.name);
      }
    });

    return new PromptTemplate({
      inputVariables: [...names],
      templateFormat,
      template,
      ...rest,
    });
  }

  async partial(values: PartialValues): Promise<PromptTemplate> {
    const promptDict: PromptTemplateInput = { ...this };
    promptDict.inputVariables = this.inputVariables.filter(
      (iv) => !(iv in values)
    );
    promptDict.partialVariables = {
      ...(this.partialVariables ?? {}),
      ...values,
    };
    return new PromptTemplate(promptDict);
  }
}