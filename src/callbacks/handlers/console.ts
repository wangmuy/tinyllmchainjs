import { Run, BaseTracer } from "./tracer.js";

function wrap(text: string) {
  return `${text}`;
}

export class ConsoleCallbackHandler extends BaseTracer {
  name = "console_callback_handler" as const;

  protected persistRun(_run: Run) {
    return Promise.resolve();
  }

  getParents(run: Run) {
    const parents: Run[] = [];
    let currentRun = run;
    while (currentRun.parent_run_id) {
      const parent = this.runMap.get(currentRun.parent_run_id);
      if (parent) {
        parents.push(parent);
        currentRun = parent;
      } else {
        break;
      }
    }
    return parents;
  }

  getBreadcrumbs(run: Run) {
    const parents = this.getParents(run).reverse();
    const string = [...parents, run]
      .map((parent, i, arr) => {
        const name = `${parent.execution_order}:${parent.run_type}:${parent.name}`;
        return i === arr.length - 1 ? wrap(name) : name;
      })
      .join(" > ");
    return wrap(string);
  }
}