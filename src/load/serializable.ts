import { SerializedFields, keyToJson, mapKeys } from "./map_keys.js";

export interface BaseSerialized<T extends string> {
  lc: number;
  type: T;
  id: string[];
}

export interface SerializedConstructor extends BaseSerialized<"constructor"> {
  kwargs: SerializedFields;
}

export interface SerializedSecret extends BaseSerialized<"secret"> {}

export interface SerializedNotImplemented extends BaseSerialized<"not_implemented"> {}

export type Serialized =
 | SerializedConstructor
 | SerializedSecret
 | SerializedNotImplemented;

function shallowCopy<T extends object>(obj: T): T {
  return Array.isArray(obj) ? ([...obj] as T) : ({ ...obj } as T);
}

function replaceSecrets(
  root: SerializedFields,
  secretsMap: { [key: string]: string }
): SerializedFields {
  const result = shallowCopy(root);
  for (const [path, secretId] of Object.entries(secretsMap)) {
    const [last, ...partsReverse] = path.split(".").reverse();
    let current: any = result;
    for (const part of partsReverse.reverse()) {
      if (current[part] == undefined) {
        break;
      }
      current[part] = shallowCopy(current[part]);
      current = current[part];
    }
    if (current[last] !== undefined) {
      current[last] = {
        lc: 1,
        type: "secret",
        id: [secretId],
      };
    }
  }
  return result;
}

export abstract class Serializable {
  lc_serializable = false;
  lc_kwargs: SerializedFields;
  abstract lc_namespace: string[];

  get lc_secrets(): { [key: string]: string } | undefined {
    return undefined;
  }

  get lc_attributes(): SerializedFields | undefined {
    return undefined;
  }

  get lc_aliases(): { [key: string]: string } | undefined {
    return undefined;
  }

  constructor(kwargs?: SerializedFields, ..._args: never[]) {
    this.lc_kwargs = kwargs || {};
  }

  toJSON(): Serialized {
    if (!this.lc_serializable) {
      return this.toJSONNotImplemented();
    }
    if (
      this.lc_kwargs instanceof Serializable ||
      typeof this.lc_kwargs !== "object" ||
      Array.isArray(this.lc_kwargs)
    ) {
      return this.toJSONNotImplemented();
    }

    const aliases: { [key: string]: string } = {};
    const secrets: { [key: string]: string } = {};
    const kwargs = Object.keys(this.lc_kwargs).reduce((acc, key) => {
      acc[key] = key in this ? this[key as keyof this] : this.lc_kwargs[key];
      return acc;
    }, {} as SerializedFields);

    for (
      let current = Object.getPrototypeOf(this);
      current;
      current = Object.getPrototypeOf(current)
    ) {
      Object.assign(aliases, Reflect.get(current, "lc_aliases", this));
      Object.assign(secrets, Reflect.get(current, "lc_secrets", this));
      Object.assign(kwargs, Reflect.get(current, "lc_attributes", this));
    }

    for (const key in secrets) {
      if (key in this && this[key as keyof this] !== undefined) {
        kwargs[key] = this[key as keyof this] || kwargs[key];
      }
    }

    return {
      lc: 1,
      type: "constructor",
      id: [...this.lc_namespace, this.constructor.name],
      kwargs: mapKeys(
        Object.keys(secrets).length ? replaceSecrets(kwargs, secrets) : kwargs,
        keyToJson,
        aliases
      ),
    };
  }

  toJSONNotImplemented(): SerializedNotImplemented {
    return {
      lc: 1,
      type: "not_implemented",
      id: [...this.lc_namespace, this.constructor.name],
    };
  }
}