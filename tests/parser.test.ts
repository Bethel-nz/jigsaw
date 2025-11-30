import { expect, test, describe } from 'bun:test';
import { Lexer } from '../src/lexer';
import { Parser } from '../src/parser';

describe('Parser - AST Node Types', () => {
  test('parses text nodes', () => {
    const tokens = new Lexer('Hello World').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.type).toBe('Program');
    expect(ast.body[0].type).toBe('Text');
    expect(ast.body[0].value).toBe('Hello World');
  });

  test('parses interpolation nodes', () => {
    const tokens = new Lexer('{{ name }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('Interpolation');
    expect(ast.body[0].value.type).toBe('Identifier');
  });

  test('parses if statement nodes', () => {
    const tokens = new Lexer('{% if show %}content{% endif %}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('IfStatement');
    expect(ast.body[0].condition.type).toBe('Identifier');
    expect(ast.body[0].consequent).toBeDefined();
  });

  test('parses if-else statement nodes', () => {
    const tokens = new Lexer(
      '{% if show %}yes{% else %}no{% endif %}'
    ).tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('IfStatement');
    expect(ast.body[0]).toBeDefined();
    expect(ast.body[0]).not.toBeNull();
  });

  test('parses for loop nodes', () => {
    const tokens = new Lexer(
      '{% for item in items %}{{ item }}{% endfor %}'
    ).tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('ForLoop');
    expect(ast.body[0].item).toBe('item');
  });

  test('parses component nodes', () => {
    const tokens = new Lexer('{{{ header }}}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('Component');
    expect(ast.body[0].name).toBe('header');
  });

  test('parses component nodes with props', () => {
    const tokens = new Lexer("{{{ 'card' | title: 'Hello' }}}").tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('Component');
    expect(ast.body[0].props).toBeDefined();
    expect(ast.body[0].props.title).toBeDefined();
  });

  test('parses island nodes', () => {
    const tokens = new Lexer(
      '{% island "nav" %}content{% endisland %}'
    ).tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('Island');
    expect(ast.body[0].name).toBe('nav');
  });

  test('parses transition nodes', () => {
    const tokens = new Lexer(
      '{% transition "fade" %}content{% endtransition %}'
    ).tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('Transition');
    expect(ast.body[0].name).toBe('fade');
  });

  test('parses meta directives', () => {
    const tokens = new Lexer('@meta {{ title: "Test" }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('Meta');
  });

  test('parses script directives', () => {
    const tokens = new Lexer('@script(src="/app.js")').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('Script');
  });
});

describe('Parser - Expressions', () => {
  test('parses literal values', () => {
    const tokens = new Lexer('{{ 42 }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].value.type).toBe('Literal');
    expect(ast.body[0].value.value).toBe(42);
  });

  test('parses string literals', () => {
    const tokens = new Lexer("{{ 'hello' }}").tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].value.type).toBe('Literal');
    expect(ast.body[0].value.value).toBe('hello');
  });

  test('parses boolean literals', () => {
    const tokens = new Lexer('{{ true }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].value.type).toBe('Literal');
    expect(ast.body[0].value.value).toBe(true);
  });

  test('parses binary expressions', () => {
    const tokens = new Lexer('{{ a + b }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].value.type).toBe('BinaryExpression');
    expect(ast.body[0].value.operator).toBe('+');
  });

  test('parses unary expressions', () => {
    const tokens = new Lexer('{{ !flag }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].value.type).toBe('UnaryExpression');
    expect(ast.body[0].value.operator).toBe('!');
  });

  test('parses member expressions', () => {
    const tokens = new Lexer('{{ user.name }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].value.type).toBe('MemberExpression');
    expect(ast.body[0].value.property.name).toBe('name');
  });

  test('parses call expressions (pipes)', () => {
    const tokens = new Lexer('{{ name | upper }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].value.type).toBe('CallExpression');
    expect(ast.body[0].value.callee).toBe('upper');
  });

  test('parses function calls', () => {
    const tokens = new Lexer('{{ fn(a, b) }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].value.type).toBe('FunctionCall');
    expect(ast.body[0].value.arguments.length).toBe(2);
  });

  test('parses object literals', () => {
    const tokens = new Lexer('{{ { key: value } }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].value.type).toBe('ObjectLiteral');
    expect(ast.body[0].value.properties).toBeDefined();
  });
});

describe('Parser - Operator Precedence', () => {
  test('respects arithmetic precedence (* before +)', () => {
    const tokens = new Lexer('{{ 1 + 2 * 3 }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const expr = ast.body[0].value;
    expect(expr.operator).toBe('+');
    expect(expr.right.operator).toBe('*');
  });

  test('respects comparison precedence (arithmetic before ==)', () => {
    const tokens = new Lexer('{{ a + b == c }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const expr = ast.body[0].value;
    expect(expr.operator).toBe('==');
    expect(expr.left.operator).toBe('+');
  });

  test('respects logical precedence (&& before ||)', () => {
    const tokens = new Lexer('{{ a || b && c }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const expr = ast.body[0].value;
    expect(expr.operator).toBe('||');
    expect(expr.right.operator).toBe('&&');
  });

  test('handles parentheses for grouping', () => {
    const tokens = new Lexer('{{ (a + b) * c }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const expr = ast.body[0].value;
    expect(expr.operator).toBe('*');
    expect(expr.left.operator).toBe('+');
  });
});

describe('Parser - Nested Structures', () => {
  test('parses nested if statements', () => {
    const tokens = new Lexer(
      '{% if a %}{% if b %}content{% endif %}{% endif %}'
    ).tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('IfStatement');
    expect(ast.body[0].consequent[0].type).toBe('IfStatement');
  });

  test('parses nested for loops', () => {
    const tokens = new Lexer(
      '{% for i in items %}{% for j in i %}{{ j }}{% endfor %}{% endfor %}'
    ).tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('ForLoop');
    expect(ast.body[0].body[0].type).toBe('ForLoop');
  });

  test('parses complex nested expressions', () => {
    const tokens = new Lexer('{{ user.profile.name | upper }}').tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body[0].value.type).toBe('CallExpression');
    const arg = ast.body[0].value.arguments[0];
    expect(arg.type).toBe('MemberExpression');
  });
});

describe('Parser - Error Handling', () => {
  test('handles unexpected tokens gracefully', () => {
    const tokens = new Lexer('{{ }}').tokenize();
    const parser = new Parser(tokens, '{{ }}', 'test');
    expect(() => parser.parse()).toThrow();
  });

  test('provides helpful error messages', () => {
    const tokens = new Lexer('{{ user.. }}').tokenize();
    const parser = new Parser(tokens, '{{ user.. }}', 'test');
    try {
      parser.parse();
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.message).toContain('IDENTIFIER');
      expect(error.line).toBeDefined();
      expect(error.column).toBeDefined();
    }
  });
});
