export enum TokenType {
  TEXT,
  OPEN_TAG, // {{
  CLOSE_TAG, // }}
  OPEN_BLOCK, // {%
  CLOSE_BLOCK, // %}
  OPEN_COMPONENT, // {{{
  CLOSE_COMPONENT, // }}}
  KEYWORD, // if, else, for, endif, endfor, in
  IDENTIFIER,
  STRING,
  DOT, // .
  PIPE, // |
  OPERATOR, // +, -, *, /, >, <, ==, !=, &&, ||
  LPAREN, // (
  RPAREN, // )
  COMMA, // ,
  NUMBER,
  META, // @meta
  SCRIPT_DIRECTIVE, // @script(...)
  FN_DEFINITION, // @fn name(args) { ... }
  LBRACE, // {
  RBRACE, // }
  LBRACKET, // [
  RBRACKET, // ]
  COLON, // :
  EOF,
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export class Lexer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(input: string) {
    this.input = input;
  }

  private inCodeMode = false;

  tokenize(): Token[] {
    const tokens: Token[] = [];
    let token = this.nextToken();
    while (token.type !== TokenType.EOF) {
      tokens.push(token);
      token = this.nextToken();
    }
    tokens.push(token); // Push EOF
    return tokens;
  }

  private nextToken(): Token {
    if (this.position >= this.input.length) {
      return this.createToken(TokenType.EOF, '');
    }

    // Handle Comments {# ... #} FIRST
    if (this.input.startsWith('{#', this.position)) {
      this.position += 2;
      while (
        this.position < this.input.length &&
        !this.input.startsWith('#}', this.position)
      ) {
        this.advance();
      }
      this.advance(2);
      return this.nextToken();
    }

    if (this.inCodeMode) {
      this.skipWhitespace();

      if (this.position >= this.input.length) {
        return this.createToken(TokenType.EOF, '');
      }

      if (this.input.startsWith('}}}', this.position)) {
        this.inCodeMode = false;
        return this.consumeTag(TokenType.CLOSE_COMPONENT, '}}}');
      }
      if (this.input.startsWith('}}', this.position)) {
        this.inCodeMode = false;
        return this.consumeTag(TokenType.CLOSE_TAG, '}}');
      }
      if (this.input.startsWith('%}', this.position)) {
        this.inCodeMode = false;
        return this.consumeTag(TokenType.CLOSE_BLOCK, '%}');
      }

      // Handle Strings
      if (
        this.input[this.position] === '"' ||
        this.input[this.position] === "'"
      ) {
        return this.readString();
      }

      // Handle Numbers
      if (this.isDigit(this.input[this.position])) {
        return this.readNumber();
      }

      // Handle Identifiers and Keywords
      if (this.isAlpha(this.input[this.position])) {
        return this.readIdentifier();
      }

      // Handle Dot
      if (this.input[this.position] === '.') {
        const startColumn = this.column;
        this.advance();
        return this.createToken(TokenType.DOT, '.', this.line, startColumn);
      }

      // Handle Pipe |>
      if (this.input.startsWith('|>', this.position)) {
        const startColumn = this.column;
        this.advance(2);
        return this.createToken(TokenType.PIPE, '|>', this.line, startColumn);
      }

      // Handle OR Operator ||
      if (this.input.startsWith('||', this.position)) {
        const startColumn = this.column;
        this.advance(2);
        return this.createToken(
          TokenType.OPERATOR,
          '||',
          this.line,
          startColumn,
        );
      }

      // Handle Single Pipe |
      if (this.input[this.position] === '|') {
        const startColumn = this.column;
        this.advance();
        return this.createToken(TokenType.PIPE, '|', this.line, startColumn);
      }

      // Handle Parentheses
      if (this.input[this.position] === '(') {
        const startColumn = this.column;
        this.advance();
        return this.createToken(TokenType.LPAREN, '(', this.line, startColumn);
      }
      if (this.input[this.position] === ')') {
        const startColumn = this.column;
        this.advance();
        return this.createToken(TokenType.RPAREN, ')', this.line, startColumn);
      }

      // Handle Brackets
      if (this.input[this.position] === '[') {
        const startColumn = this.column;
        this.advance();
        return this.createToken(
          TokenType.LBRACKET,
          '[',
          this.line,
          startColumn,
        );
      }
      if (this.input[this.position] === ']') {
        const startColumn = this.column;
        this.advance();
        return this.createToken(
          TokenType.RBRACKET,
          ']',
          this.line,
          startColumn,
        );
      }

      // Handle Braces
      if (this.input[this.position] === '{') {
        const startColumn = this.column;
        this.advance();
        return this.createToken(TokenType.LBRACE, '{', this.line, startColumn);
      }
      if (this.input[this.position] === '}') {
        const startColumn = this.column;
        this.advance();
        return this.createToken(TokenType.RBRACE, '}', this.line, startColumn);
      }

      // Handle Colon
      if (this.input[this.position] === ':') {
        const startColumn = this.column;
        this.advance();
        return this.createToken(TokenType.COLON, ':', this.line, startColumn);
      }

      // Handle Comma
      if (this.input[this.position] === ',') {
        const startColumn = this.column;
        this.advance();
        return this.createToken(TokenType.COMMA, ',', this.line, startColumn);
      }

      // Handle Operators
      if (this.input.startsWith('==', this.position)) {
        const startColumn = this.column;
        this.advance(2);
        return this.createToken(
          TokenType.OPERATOR,
          '==',
          this.line,
          startColumn,
        );
      }
      if (this.input.startsWith('!=', this.position)) {
        const startColumn = this.column;
        this.advance(2);
        return this.createToken(
          TokenType.OPERATOR,
          '!=',
          this.line,
          startColumn,
        );
      }
      if (this.input.startsWith('&&', this.position)) {
        const startColumn = this.column;
        this.advance(2);
        return this.createToken(
          TokenType.OPERATOR,
          '&&',
          this.line,
          startColumn,
        );
      }
      if (this.input.startsWith('>=', this.position)) {
        const startColumn = this.column;
        this.advance(2);
        return this.createToken(
          TokenType.OPERATOR,
          '>=',
          this.line,
          startColumn,
        );
      }
      if (this.input.startsWith('<=', this.position)) {
        const startColumn = this.column;
        this.advance(2);
        return this.createToken(
          TokenType.OPERATOR,
          '<=',
          this.line,
          startColumn,
        );
      }

      if ('+-*/><!='.includes(this.input[this.position])) {
        const char = this.input[this.position];
        const startColumn = this.column;
        this.advance();
        return this.createToken(
          TokenType.OPERATOR,
          char,
          this.line,
          startColumn,
        );
      }

      const char = this.input[this.position];
      const startColumn = this.column;
      this.advance();
      return this.createToken(TokenType.TEXT, char, this.line, startColumn);
    } else {
      // TEXT MODE
      // Check for @meta and @script directives
      if (this.input.startsWith('@meta', this.position)) {
        return this.readMetaDirective();
      }
      if (this.input.startsWith('@script', this.position)) {
        return this.readScriptDirective();
      }
      if (this.input.startsWith('@fn', this.position)) {
        return this.readFnDirective();
      }

      // Find the nearest open tag
      const nextOpenComponent = this.input.indexOf('{{{', this.position);
      const nextOpenTag = this.input.indexOf('{{', this.position);
      const nextOpenBlock = this.input.indexOf('{%', this.position);
      const nextComment = this.input.indexOf('{#', this.position);
      const nextMeta = this.input.indexOf('@meta', this.position);
      const nextScript = this.input.indexOf('@script', this.position);
      const nextFn = this.input.indexOf('@fn', this.position);

      let nextIndex = this.input.length;
      let tagType: TokenType | null = null;
      let tagStr = '';

      if (nextOpenComponent !== -1 && nextOpenComponent < nextIndex) {
        nextIndex = nextOpenComponent;
        tagType = TokenType.OPEN_COMPONENT;
        tagStr = '{{{';
      }

      if (nextOpenTag !== -1 && nextOpenTag < nextIndex) {
        if (nextOpenComponent !== nextOpenTag) {
          nextIndex = nextOpenTag;
          tagType = TokenType.OPEN_TAG;
          tagStr = '{{';
        }
      }

      if (nextOpenBlock !== -1 && nextOpenBlock < nextIndex) {
        nextIndex = nextOpenBlock;
        tagType = TokenType.OPEN_BLOCK;
        tagStr = '{%';
      }

      if (nextComment !== -1 && nextComment < nextIndex) {
        nextIndex = nextComment;
      }

      // Also stop at @meta, @script, @fn
      if (nextMeta !== -1 && nextMeta < nextIndex) nextIndex = nextMeta;
      if (nextScript !== -1 && nextScript < nextIndex) nextIndex = nextScript;
      if (nextFn !== -1 && nextFn < nextIndex) nextIndex = nextFn;

      if (nextIndex > this.position) {
        return this.readText(nextIndex);
      }

      if (tagType !== null) {
        this.inCodeMode = true;
        return this.consumeTag(tagType, tagStr);
      }

      // Should be handled by @meta/@script/@fn checks above, but just in case
      if (this.input.startsWith('@meta', this.position))
        return this.readMetaDirective();
      if (this.input.startsWith('@script', this.position))
        return this.readScriptDirective();
      if (this.input.startsWith('@fn', this.position))
        return this.readFnDirective();

      return this.readText(this.input.length);
    }
  }

  private readMetaDirective(): Token {
    // Just return the META token, don't consume the content
    const startColumn = this.column;
    this.advance(5); // Skip @meta
    this.skipWhitespace();
    return this.createToken(TokenType.META, '@meta', this.line, startColumn);
  }

  private readScriptDirective(): Token {
    // @script(...)
    const start = this.position;
    this.advance(7); // Skip @script

    if (this.input[this.position] === '(') {
      this.advance(); // Skip (
      const contentStart = this.position;
      const endParen = this.input.indexOf(')', this.position);
      if (endParen !== -1) {
        const content = this.input.slice(contentStart, endParen);
        this.position = endParen;
        this.advance(); // Skip )
        return this.createToken(TokenType.SCRIPT_DIRECTIVE, content.trim());
      }
    }

    return this.createToken(TokenType.TEXT, '@script');
  }

  private readFnDirective(): Token {
    // @fn name(args) { body }
    const startColumn = this.column;
    this.advance(3); // Skip @fn
    this.skipWhitespace();

    // 1. Parse Name
    const nameStart = this.position;
    while (
      this.position < this.input.length &&
      (this.isAlphaNumeric(this.input[this.position]) ||
        this.input[this.position] === '_')
    ) {
      this.advance();
    }
    const name = this.input.slice(nameStart, this.position);
    this.skipWhitespace();

    // 2. Parse Args
    let args = '';
    if (this.input[this.position] === '(') {
      this.advance(); // Skip (
      const argsStart = this.position;
      while (
        this.position < this.input.length &&
        this.input[this.position] !== ')'
      ) {
        this.advance();
      }
      args = this.input.slice(argsStart, this.position);
      this.advance(); // Skip )
    }
    this.skipWhitespace();

    // 3. Parse Body
    if (this.input[this.position] === '{') {
      const bodyStart = this.position + 1; // Skip {
      this.advance();

      let braceCount = 1;
      while (this.position < this.input.length && braceCount > 0) {
        if (this.input[this.position] === '{') braceCount++;
        if (this.input[this.position] === '}') braceCount--;
        this.advance();
      }

      // The last advance skipped the closing }, so bodyEnd should be position - 1
      const body = this.input.slice(bodyStart, this.position - 1);

      const value = JSON.stringify({ name, args, body });
      return this.createToken(
        TokenType.FN_DEFINITION,
        value,
        this.line,
        startColumn,
      );
    }

    // Fallback if syntax is wrong
    return this.createToken(TokenType.TEXT, '@fn');
  }

  private consumeTag(type: TokenType, value: string): Token {
    const startColumn = this.column;
    this.advance(value.length);
    return this.createToken(type, value, this.line, startColumn);
  }

  private readText(limit?: number): Token {
    const start = this.position;
    const startColumn = this.column;
    let end = limit || this.input.length;

    const value = this.input.slice(start, end);
    this.advance(value.length);
    return this.createToken(TokenType.TEXT, value, this.line, startColumn);
  }

  private readString(): Token {
    const startColumn = this.column;
    const quote = this.input[this.position];
    this.advance(); // Skip quote
    const start = this.position;

    while (
      this.position < this.input.length &&
      this.input[this.position] !== quote
    ) {
      if (this.input[this.position] === '\\') {
        this.advance(); // Skip escape char
      }
      this.advance();
    }

    const value = this.input.slice(start, this.position);
    this.advance(); // Skip closing quote
    return this.createToken(TokenType.STRING, value, this.line, startColumn);
  }

  private readIdentifier(): Token {
    const start = this.position;
    const startColumn = this.column;
    while (
      this.position < this.input.length &&
      (this.isAlphaNumeric(this.input[this.position]) ||
        this.input[this.position] === '_')
    ) {
      this.advance();
    }

    const value = this.input.slice(start, this.position);
    const type = this.getKeywordType(value) || TokenType.IDENTIFIER;
    return this.createToken(type, value, this.line, startColumn);
  }

  private getKeywordType(text: string): TokenType | null {
    const keywords = [
      'if',
      'else',
      'for',
      'endif',
      'endfor',
      'in',
      'island',
      'endisland',
      'transition',
      'endtransition',
    ];
    // console.log(`Checking keyword: "${text}"`);
    if (keywords.includes(text)) {
      return TokenType.KEYWORD;
    }
    return null;
  }

  private readNumber(): Token {
    const start = this.position;
    const startColumn = this.column;
    while (
      this.position < this.input.length &&
      this.isDigit(this.input[this.position])
    ) {
      this.advance();
    }
    if (
      this.position < this.input.length &&
      this.input[this.position] === '.'
    ) {
      this.advance();
      while (
        this.position < this.input.length &&
        this.isDigit(this.input[this.position])
      ) {
        this.advance();
      }
    }

    const value = this.input.slice(start, this.position);
    return this.createToken(TokenType.NUMBER, value, this.line, startColumn);
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  private skipWhitespace() {
    while (
      this.position < this.input.length &&
      /\s/.test(this.input[this.position])
    ) {
      this.advance();
    }
  }

  private isAlpha(char: string): boolean {
    return /[a-zA-Z]/.test(char);
  }

  private isAlphaNumeric(char: string): boolean {
    return /[a-zA-Z0-9]/.test(char);
  }

  private advance(steps: number = 1) {
    for (let i = 0; i < steps; i++) {
      if (this.position < this.input.length) {
        if (this.input[this.position] === '\n') {
          this.line++;
          this.column = 1;
        } else {
          this.column++;
        }
        this.position++;
      }
    }
  }

  private createToken(
    type: TokenType,
    value: string,
    line?: number,
    column?: number,
  ): Token {
    return {
      type,
      value,
      line: line || this.line,
      column: column || this.column,
    };
  }
}
