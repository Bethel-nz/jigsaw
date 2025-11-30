import { expect, test, describe } from 'bun:test';
import { Lexer, TokenType } from '../src/lexer';

describe('Lexer - Token Generation', () => {
  test('tokenizes text content', () => {
    const lexer = new Lexer('Hello World');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.TEXT);
    expect(tokens[0].value).toBe('Hello World');
  });

  test('tokenizes variable interpolation {{ }}', () => {
    const lexer = new Lexer('{{ name }}');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.OPEN_TAG);
    expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[1].value).toBe('name');
    expect(tokens[2].type).toBe(TokenType.CLOSE_TAG);
  });

  test('tokenizes component tags {{{ }}}', () => {
    const lexer = new Lexer('{{{ header }}}');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.OPEN_COMPONENT);
    expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[1].value).toBe('header');
    expect(tokens[2].type).toBe(TokenType.CLOSE_COMPONENT);
  });

  test('tokenizes block tags {% %}', () => {
    const lexer = new Lexer('{% if condition %}');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.OPEN_BLOCK);
    expect(tokens[1].type).toBe(TokenType.KEYWORD);
    expect(tokens[1].value).toBe('if');
    expect(tokens[2].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[3].type).toBe(TokenType.CLOSE_BLOCK);
  });

  test('tokenizes string literals', () => {
    const lexer = new Lexer("{{ 'hello' }}");
    const tokens = lexer.tokenize();
    expect(tokens[1].type).toBe(TokenType.STRING);
    expect(tokens[1].value).toBe('hello');
  });

  test('tokenizes numbers', () => {
    const lexer = new Lexer('{{ 42 }}');
    const tokens = lexer.tokenize();
    expect(tokens[1].type).toBe(TokenType.NUMBER);
    expect(tokens[1].value).toBe('42');
  });

  test('tokenizes operators', () => {
    const lexer = new Lexer('{{ a + b }}');
    const tokens = lexer.tokenize();
    expect(tokens[2].type).toBe(TokenType.OPERATOR);
    expect(tokens[2].value).toBe('+');
  });

  test('tokenizes dot notation', () => {
    const lexer = new Lexer('{{ user.name }}');
    const tokens = lexer.tokenize();
    expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[2].type).toBe(TokenType.DOT);
    expect(tokens[3].type).toBe(TokenType.IDENTIFIER);
  });

  test('tokenizes pipe operator', () => {
    const lexer = new Lexer('{{ name | upper }}');
    const tokens = lexer.tokenize();
    expect(tokens[2].type).toBe(TokenType.PIPE);
  });

  test('tokenizes parentheses', () => {
    const lexer = new Lexer('{{ (a + b) }}');
    const tokens = lexer.tokenize();
    expect(tokens[1].type).toBe(TokenType.LPAREN);
    expect(tokens[5].type).toBe(TokenType.RPAREN);
  });

  test('tokenizes object literals', () => {
    const lexer = new Lexer('{{ { key: value } }}');
    const tokens = lexer.tokenize();
    expect(tokens[1].type).toBe(TokenType.LBRACE);
    expect(tokens[3].type).toBe(TokenType.COLON);
    expect(tokens[5].type).toBe(TokenType.RBRACE);
  });
});

describe('Lexer - Keywords', () => {
  const keywords = [
    'if',
    'else',
    'endif',
    'for',
    'endfor',
    'in',
    'island',
    'endisland',
    'transition',
    'endtransition',
  ];

  keywords.forEach((keyword) => {
    test(`recognizes keyword: ${keyword}`, () => {
      const lexer = new Lexer(`{% ${keyword} %}`);
      const tokens = lexer.tokenize();
      expect(tokens[1].type).toBe(TokenType.KEYWORD);
      expect(tokens[1].value).toBe(keyword);
    });
  });
});

describe('Lexer - Operators', () => {
  const operators = [
    { op: '+', name: 'addition' },
    { op: '-', name: 'subtraction' },
    { op: '*', name: 'multiplication' },
    { op: '/', name: 'division' },
    { op: '==', name: 'equality' },
    { op: '!=', name: 'inequality' },
    { op: '<', name: 'less than' },
    { op: '>', name: 'greater than' },
    { op: '<=', name: 'less than or equal' },
    { op: '>=', name: 'greater than or equal' },
    { op: '&&', name: 'logical and' },
    { op: '||', name: 'logical or' },
    { op: '!', name: 'logical not' },
  ];

  operators.forEach(({ op, name }) => {
    test(`tokenizes ${name} operator (${op})`, () => {
      const lexer = new Lexer(`{{ a ${op} b }}`);
      const tokens = lexer.tokenize();
      const operatorToken = tokens.find((t) => t.type === TokenType.OPERATOR);
      expect(operatorToken).toBeDefined();
      expect(operatorToken?.value).toBe(op);
    });
  });
});

describe('Lexer - Meta and Script Directives', () => {
  test('tokenizes @meta directive', () => {
    const lexer = new Lexer('@meta {{ title: "Test" }}');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.META);
  });

  test('tokenizes @script directive', () => {
    const lexer = new Lexer('@script(src="/app.js")');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.SCRIPT_DIRECTIVE);
  });
});

describe('Lexer - Line and Column Tracking', () => {
  test('tracks line numbers correctly', () => {
    const lexer = new Lexer('Line 1\n{{ var }}\nLine 3');
    const tokens = lexer.tokenize();
    const varToken = tokens.find((t) => t.value === 'var');
    expect(varToken?.line).toBe(2);
  });

  test('tracks column numbers correctly', () => {
    const lexer = new Lexer('{{ name }}');
    const tokens = lexer.tokenize();
    expect(tokens[0].column).toBe(1); // OPEN_TAG at column 1
    expect(tokens[1].column).toBe(4); // IDENTIFIER starts after '{{ '
  });
});

describe('Lexer - Edge Cases', () => {
  test('handles empty input', () => {
    const lexer = new Lexer('');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.EOF);
  });

  test('handles whitespace-only input', () => {
    const lexer = new Lexer('   \n  \t  ');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.TEXT);
  });

  test('handles nested braces', () => {
    const lexer = new Lexer('{{ { a: { b: c } } }}');
    const tokens = lexer.tokenize();
    const braceTokens = tokens.filter(
      (t) => t.type === TokenType.LBRACE || t.type === TokenType.RBRACE
    );
    expect(braceTokens.length).toBe(4); // 2 opening, 2 closing
  });

  test('handles mixed content', () => {
    const lexer = new Lexer('Text {{ var }} more text {% if x %} block');
    const tokens = lexer.tokenize();
    expect(tokens.filter((t) => t.type === TokenType.TEXT).length).toBe(3);
    expect(
      tokens.filter((t) => t.type === TokenType.IDENTIFIER).length
    ).toBeGreaterThan(0);
  });

  test('handles escaped quotes in strings', () => {
    const lexer = new Lexer(`{{ 'it\\'s working' }}`);
    const tokens = lexer.tokenize();
    const stringToken = tokens.find((t) => t.type === TokenType.STRING);
    expect(stringToken?.value).toContain('it');
  });
});
