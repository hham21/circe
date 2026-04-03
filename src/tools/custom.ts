export interface CirceToolFn extends Function {
  _circeTool: true;
  _circeToolName: string;
}

export function tool<T extends (...args: any[]) => any>(fn: T): T & CirceToolFn {
  const wrapper = ((...args: any[]) => fn(...args)) as T & CirceToolFn;
  wrapper._circeTool = true;
  wrapper._circeToolName = fn.name;
  return wrapper;
}
