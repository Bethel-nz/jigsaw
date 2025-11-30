import { expect, test, describe } from "bun:test";
import { Lexer } from '../src/lexer';
import { Parser } from '../src/parser';
import { Compiler } from '../src/compiler';

describe("Compiler - Code Generation", () => {
  test("compiles text nodes", () => {
    const ast = new Parser(new Lexer("Hello").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('__append("Hello")');
  });

  test("compiles interpolation with HTML escaping", () => {
    const ast = new Parser(new Lexer("{{ name }}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('__escape');
    expect(code).toContain('__get(data, \'name\')');
  });

  test("compiles if statements", () => {
    const ast = new Parser(new Lexer("{% if show %}content{% endif %}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('if (');
    expect(code).toContain('__get(data, \'show\')');
  });

  test("compiles for loops with loop variables", () => {
    const ast = new Parser(new Lexer("{% for item in items %}{{ item }}{% endfor %}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('for (const item of');
    expect(code).toContain('item_index');
    expect(code).toContain('item_first');
    expect(code).toContain('item_last');
  });

  test("compiles components", () => {
    const ast = new Parser(new Lexer("{{{ header }}}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('helper.renderComponent');
    expect(code).toContain('header');
  });

  test("compiles components with props", () => {
    const ast = new Parser(new Lexer("{{{ 'card' | title: 'Test' }}}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('Object.assign');
    expect(code).toContain('title');
  });

  test("compiles static islands", () => {
    const ast = new Parser(new Lexer('{% island "nav" %}content{% endisland %}').tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('data-island="nav"');
    expect(code).toContain('data-island-static');
  });

  test("compiles transitions", () => {
    const ast = new Parser(new Lexer('{% transition "fade" %}content{% endtransition %}').tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('data-transition-type="fade"');
  });
});

describe("Compiler - Expression Compilation", () => {
  test("compiles binary expressions", () => {
    const ast = new Parser(new Lexer("{{ a + b }}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toMatch(/\+/);
  });

  test("compiles member access with safety", () => {
    const ast = new Parser(new Lexer("{{ user.name }}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('__get');
  });

  test("compiles pipe calls correctly", () => {
    const ast = new Parser(new Lexer("{{ name | upper }}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('pipes[\'upper\']');
  });

  test("compiles safe pipe without escaping", () => {
    const ast = new Parser(new Lexer("{{ html | safe }}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    // Safe pipe should NOT use __escape
    expect(code).not.toContain('__escape(__get(data, \'html\'))');
  });
});

describe("Compiler - Security Features", () => {
  test("generates __escape function", () => {
    const ast = new Parser(new Lexer("{{ name }}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('function __escape');
    expect(code).toContain('&amp;');
    expect(code).toContain('&lt;');
    expect(code).toContain('&gt;');
  });

  test("generates __get with prototype pollution prevention", () => {
    const ast = new Parser(new Lexer("{{ name }}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('function __get');
    expect(code).toContain('constructor');
    expect(code).toContain('__proto__');
    expect(code).toContain('prototype');
  });

  test("generates null/undefined handling", () => {
    const ast = new Parser(new Lexer("{{ name }}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('null');
    expect(code).toContain('undefined');
  });
});

describe("Compiler - Variable Scoping", () => {
  test("handles loop variable scoping correctly", () => {
    const ast = new Parser(new Lexer("{% for item in items %}{{ item }}{% endfor %}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    // Loop variable should be used directly, not via __get
    expect(code).toContain('__escape(item)');
  });

  test("distinguishes data properties from loop variables", () => {
    const ast = new Parser(new Lexer("{% for item in items %}{{ item }}{{ name }}{% endfor %}").tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    expect(code).toContain('__escape(item)'); // Loop var
    expect(code).toContain('__get(data, \'name\')'); // Data prop
  });
});

describe("Compiler - Generated Code Execution", () => {
  const executeTemplate = (template: string, data: any, pipes: any = {}, helper: any = {}) => {
    const ast = new Parser(new Lexer(template).tokenize()).parse();
    const compiler = new Compiler();
    const code = compiler.compile(ast);
    const fn = new Function('return ' + code)();
    return fn(data, pipes, helper, { meta: {}, scripts: [] });
  };

  test("executes text rendering", () => {
    const result = executeTemplate("Hello", {});
    expect(result).toBe("Hello");
  });

  test("executes variable interpolation", () => {
    const result = executeTemplate("{{ name }}", { name: "World" });
    expect(result).toBe("World");
  });

  test("executes HTML escaping", () => {
    const result = executeTemplate("{{ html }}", { html: "<script>alert('xss')</script>" });
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  test("executes if statements", () => {
    const result1 = executeTemplate("{% if show %}yes{% endif %}", { show: true });
    expect(result1).toContain("yes");
    
    const result2 = executeTemplate("{% if show %}yes{% endif %}", { show: false });
    expect(result2).not.toContain("yes");
  });

  test("executes for loops", () => {
    const result = executeTemplate("{% for item in items %}{{ item }}{% endfor %}", { items: [1, 2, 3] });
    expect(result).toContain("123");
  });

  test("executes pipe transformations", () => {
    const pipes = { upper: (str: string) => str.toUpperCase() };
    const result = executeTemplate("{{ name | upper }}", { name: "hello" }, pipes);
    expect(result).toBe("HELLO");
  });

  test("handles null and undefined gracefully", () => {
    const result1 = executeTemplate("{{ missing }}", {});
    expect(result1).toBe("");
    
    const result2 = executeTemplate("{{ nullable }}", { nullable: null });
    expect(result2).toBe("");
  });
});
