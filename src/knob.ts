import { Lexer } from './lexer';
import { Parser } from './parser';
import { Compiler, CompiledTemplate } from './compiler';
import { TemplateData } from './types';
import JigSaw from './jigsaw';
import { PersistentCache } from './cache';

export default class Knob {
  private template: string;
  private templateName?: string;
  private handlers: Map<string, string> = new Map();
  private static compiledCache: Map<
    string,
    { fn: Function; handlers: Map<string, string> }
  > = new Map();
  private static persistentCache = new PersistentCache();

  // Background cache warming - loads asynchronously without blocking
  private static cacheWarmingPromises = new Map<
    string,
    Promise<Function | null>
  >();

  constructor(template: string, templateName?: string) {
    this.template = template;
    this.templateName = templateName;
  }

  private compile(): CompiledTemplate {
    const lexer = new Lexer(this.template);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, this.template, this.templateName);
    const ast = parser.parse();
    const compiler = new Compiler();
    return compiler.compile(ast);
  }

  public getAST() {
    const lexer = new Lexer(this.template);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, this.template, this.templateName);
    return parser.parse();
  }

  render(data: TemplateData, context?: any): string {
    // Merge context from child RenderResults in data (meta + scripts)
    if (context) {
      Object.values(data).forEach((val: any) => {
        if (val && typeof val === 'object' && val.meta && val.scripts) {
          Object.assign(context.meta, val.meta);
          if (Array.isArray(val.scripts)) {
            context.scripts.push(...val.scripts);
          }
        }
      });
    }

    const helper = {
      renderComponent: (name: string, componentData: any) => {
        const componentTemplate = JigSaw.getComponent(name);
        if (!componentTemplate) {
          throw new Error(`Component "${name}" not found`);
        }
        const knob = new Knob(componentTemplate, `component:${name}`);
        return knob.render(componentData, context);
      },
    };

    // Check memory cache first (fastest)
    let cached = Knob.compiledCache.get(this.template);
    let compiledFn;

    if (cached) {
      compiledFn = cached.fn;
      this.handlers = new Map(cached.handlers); // Clone so merging doesn't pollute cache
    } else {
      const cacheKey = `${this.templateName || 'anon'}:${this.template}`;

      // Still not in memory? Compile now (fallback)
      if (!compiledFn) {
        const compiled = this.compile();
        const code = compiled.code;
        this.handlers = compiled.handlers;

        try {
          const factory = new Function('return ' + code);
          compiledFn = factory();
          Knob.compiledCache.set(this.template, {
            fn: compiledFn!,
            handlers: new Map(this.handlers), // Cache a clean copy
          });
        } catch (e) {
          console.error('Error executing compiled template:', e);
          console.log('Generated Code:', code);
          throw e;
        }
      }
    }

    // NOW merge child handlers (after this.handlers is set from cache/compilation)
    Object.values(data).forEach((val: any) => {
      if (
        val &&
        typeof val === 'object' &&
        val.handlers &&
        val.handlers instanceof Map
      ) {
        for (const [id, code] of val.handlers) {
          this.handlers.set(id, code);
        }
      }
    });

    if (!compiledFn) {
      throw new Error('Failed to compile template');
    }

    return compiledFn(
      data,
      JigSaw.getPipes(),
      helper,
      context || { meta: {}, scripts: [] },
    );
  }

  public getHandlers(): Map<string, string> {
    return this.handlers;
  }

  // Warm cache on server start (call this in JigSaw.serve())
  static async warmCache(templates: Map<string, string>) {
    // Disabled for now due to structure change
  }

  // Clear cache (useful for development/testing)
  static clearCache() {
    Knob.compiledCache.clear();
    Knob.cacheWarmingPromises.clear();
  }

  // Clear persistent cache
  static async clearPersistentCache() {
    await Knob.persistentCache.clearAll();
  }
}
