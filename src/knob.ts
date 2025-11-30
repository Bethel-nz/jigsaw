import { Lexer } from './lexer';
import { Parser } from './parser';
import { Compiler } from './compiler';
import { TemplateData } from './types';
import JigSaw from './jigsaw';
import { PersistentCache } from './cache';

export default class Knob {
  private template: string;
  private templateName?: string;
  private static compiledCache: Map<string, Function> = new Map();
  private static persistentCache = new PersistentCache();
  
  // Background cache warming - loads asynchronously without blocking
  private static cacheWarmingPromises = new Map<string, Promise<Function | null>>();

  constructor(template: string, templateName?: string) {
    this.template = template;
    this.templateName = templateName;
  }

  private compile(): string {
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
    // Merge context from child RenderResults in data
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
      }
    };

    // Check memory cache first (fastest)
    let compiledFn = Knob.compiledCache.get(this.template);
    
    if (!compiledFn) {
      const cacheKey = `${this.templateName || 'anon'}:${this.template}`;
      
      // Check if we're already warming this cache in background
      const warmingPromise = Knob.cacheWarmingPromises.get(cacheKey);
      if (warmingPromise) {
        // Try to get it if it's ready (non-blocking check)
        warmingPromise.then(fn => {
          if (fn) {
            Knob.compiledCache.set(this.template, fn);
          }
        }).catch(() => {}); // Ignore errors, we'll compile anyway
      }
      
      // Still not in memory? Compile now (fallback)
      if (!compiledFn) {
        const code = this.compile();
        
        try {
          const factory = new Function('return ' + code);
          compiledFn = factory();
          Knob.compiledCache.set(this.template, compiledFn!);
          
          // Save to persistent cache in background (fire and forget)
          Knob.persistentCache.set(cacheKey, code).catch(() => {});
        } catch (e) {
          console.error("Error executing compiled template:", e);
          console.log("Generated Code:", code);
          throw e;
        }
      }
      
      // Start warming cache for next time (background, non-blocking)
      if (!Knob.cacheWarmingPromises.has(cacheKey)) {
        const warmPromise = Knob.persistentCache.get(cacheKey);
        Knob.cacheWarmingPromises.set(cacheKey, warmPromise);
        
        // Clean up the promise after it resolves
        warmPromise.finally(() => {
          setTimeout(() => Knob.cacheWarmingPromises.delete(cacheKey), 1000);
        });
      }
    }
    
    if (!compiledFn) {
      throw new Error('Failed to compile template');
    }
    
    return compiledFn(data, JigSaw.getPipes(), helper, context || { meta: {}, scripts: [] });
  }
  
  // Warm cache on server start (call this in JigSaw.serve())
  static async warmCache(templates: Map<string, string>) {
    const promises: Promise<any>[] = [];
    
    for (const [name, template] of templates.entries()) {
      const cacheKey = `${name}:${template}`;
      const cached = await Knob.persistentCache.get(cacheKey);
      
      if (cached) {
        Knob.compiledCache.set(template, cached);
      }
    }
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
