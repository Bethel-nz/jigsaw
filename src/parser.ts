import { Token, TokenType } from './lexer';
import { TemplateError } from './errors';

export type ASTNode =
  | Program
  | Text
  | Interpolation
  | IfStatement
  | ForLoop
  | Island
  | Transition
  | Component
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | FunctionCall
  | Literal
  | Identifier
  | Identifier
  | MemberExpression
  | Meta
  | Script
  | FnDefinition
  | ClosingComponent
  | ObjectLiteral
  | ArrayLiteral;

export interface ObjectLiteral {
  type: 'ObjectLiteral';
  properties: { key: string; value: ASTNode }[];
}

export interface ArrayLiteral {
  type: 'ArrayLiteral';
  elements: ASTNode[];
}

export interface Program {
  type: 'Program';
  body: ASTNode[];
}

export interface Meta {
  type: 'Meta';
  properties: { key: string; value: ASTNode }[];
}

export interface Script {
  type: 'Script';
  content: string;
}

export interface FnDefinition {
  type: 'FnDefinition';
  name: string;
  args: string;
  body: string;
}

export interface Text {
  type: 'Text';
  value: string;
}

export interface Interpolation {
  type: 'Interpolation';
  value: ASTNode;
}

export interface IfStatement {
  type: 'IfStatement';
  condition: ASTNode;
  consequent: ASTNode[];
  alternate: ASTNode[] | null;
}

export interface ForLoop {
  type: 'ForLoop';
  item: string;
  collection: ASTNode;
  body: ASTNode[];
}

export interface Island {
  type: 'Island';
  name: string;
  body: ASTNode[];
}

export interface Transition {
  type: 'Transition';
  name: string;
  body: ASTNode[];
}

export interface Component {
  type: 'Component';
  name: string;
  isStatic?: boolean;
  props?: Record<string, ASTNode>;
  body?: ASTNode[];
}

export interface ClosingComponent {
  type: 'ClosingComponent';
  name: string;
}

export interface BinaryExpression {
  type: 'BinaryExpression';
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryExpression {
  type: 'UnaryExpression';
  operator: string;
  argument: ASTNode;
}

export interface CallExpression {
  type: 'CallExpression';
  callee: string;
  arguments: ASTNode[];
}

export interface FunctionCall {
  type: 'FunctionCall';
  callee: ASTNode;
  arguments: ASTNode[];
}

export interface Literal {
  type: 'Literal';
  value: string | number | boolean;
}

export interface Identifier {
  type: 'Identifier';
  name: string;
}

export interface MemberExpression {
  type: 'MemberExpression';
  object: ASTNode;
  property: Identifier;
}

export class Parser {
  private tokens: Token[];
  private position: number = 0;
  private templateSource?: string;
  private templateName?: string;
  private openTags: Array<{ type: string; name: string; line: number }> = [];

  constructor(tokens: Token[], templateSource?: string, templateName?: string) {
    this.tokens = tokens;
    this.templateSource = templateSource;
    this.templateName = templateName;
  }

  parse(): Program {
    const body: ASTNode[] = [];
    while (
      this.position < this.tokens.length &&
      this.currentToken().type !== TokenType.EOF
    ) {
      const node = this.parseNode();
      if (node) {
        if (node.type === 'ClosingComponent') {
          throw new TemplateError(
            `Unexpected closing tag: {{{ /${node.name} }}}`,
            this.currentToken().line,
            this.currentToken().column,
            this.templateName,
            this.templateSource,
          );
        }
        body.push(node);
      }
    }

    // Check for unclosed tags at EOF
    this.checkUnclosedTags();

    return { type: 'Program', body };
  }

  private checkUnclosedTags(): void {
    if (this.openTags.length > 0) {
      const firstUnclosed = this.openTags[0];
      const allTags = this.openTags
        .map((t) => `${t.type} "${t.name}"`)
        .join(', ');

      throw new TemplateError(
        `Unclosed tag${this.openTags.length > 1 ? 's' : ''}: ${allTags}. Did you forget to close ${this.openTags.length > 1 ? 'them' : 'it'}?`,
        firstUnclosed.line,
        1,
        this.templateName,
        this.templateSource,
      );
    }
  }

  private parseNode(): ASTNode | ClosingComponent | null {
    const token = this.currentToken();

    switch (token.type) {
      case TokenType.TEXT:
        return this.parseText();
      case TokenType.OPEN_TAG:
        return this.parseInterpolation();
      case TokenType.OPEN_COMPONENT:
        return this.parseComponent();
      case TokenType.OPEN_BLOCK:
        return this.parseBlock();
      case TokenType.META:
        return this.parseMeta();
      case TokenType.SCRIPT_DIRECTIVE:
        return this.parseScript();
      case TokenType.FN_DEFINITION:
        return this.parseFnDefinition();
      default:
        this.advance();
        return null;
    }
  }

  private parseMeta(): Meta {
    this.consume(TokenType.META);
    this.consume(TokenType.OPEN_TAG);

    const properties = this.parseObjectProperties(TokenType.CLOSE_TAG);

    this.consume(TokenType.CLOSE_TAG);
    return { type: 'Meta', properties };
  }

  private parseScript(): Script {
    const token = this.consume(TokenType.SCRIPT_DIRECTIVE);
    return { type: 'Script', content: token.value };
  }

  private parseFnDefinition(): FnDefinition {
    const token = this.consume(TokenType.FN_DEFINITION);
    const { name, args, body } = JSON.parse(token.value);
    return { type: 'FnDefinition', name, args, body };
  }

  private parseText(): Text {
    const token = this.consume(TokenType.TEXT);
    return { type: 'Text', value: token.value };
  }

  private parseInterpolation(): Interpolation {
    this.consume(TokenType.OPEN_TAG);
    const value = this.parseExpression();
    this.consume(TokenType.CLOSE_TAG);
    return { type: 'Interpolation', value };
  }

  private parseComponent(): Component | ClosingComponent {
    this.consume(TokenType.OPEN_COMPONENT);

    // Check for Closing Component: {{{ /name }}}
    if (
      this.currentToken().type === TokenType.OPERATOR &&
      this.currentToken().value === '/'
    ) {
      this.consume(TokenType.OPERATOR);
      const name = this.consume(TokenType.IDENTIFIER).value;
      this.consume(TokenType.CLOSE_COMPONENT);
      return { type: 'ClosingComponent', name };
    }

    let nameToken = this.currentToken();
    let isStatic = false;
    let componentName = '';

    // Check for bracketed static component: {{{ ['name'] }}}
    if (
      nameToken.type === TokenType.TEXT &&
      nameToken.value.trim().startsWith('[')
    ) {
      const bracketContent = nameToken.value.trim();
      const match = bracketContent.match(/^\['([^']+)'\]$/);
      if (match) {
        componentName = match[1];
        isStatic = true;
        this.advance();
      }
    } else if (nameToken.type === TokenType.STRING) {
      // Old syntax: {{{ 'card' | ... }}}
      componentName = nameToken.value;
      this.advance();
    } else {
      // New syntax: {{{ card(...) }}} or old: component name as identifier
      nameToken = this.consume(TokenType.IDENTIFIER);
      componentName = nameToken.value;
    }

    const props: Record<string, ASTNode> = {};

    // NEW SYNTAX: {{{ card(:title="Text", :desc="Info") }}}
    if (this.currentToken().type === TokenType.LPAREN) {
      Object.assign(props, this.parsePropsGroup());
    }
    // PIPE SYNTAX: {{{ 'card' | (:title="Text") }}} OR {{{ 'card' | title: 'Text' }}}
    else if (this.currentToken().type === TokenType.PIPE) {
      this.consume(TokenType.PIPE);

      if (this.currentToken().type === TokenType.LPAREN) {
        // {{{ 'card' | (:title="...") }}}
        Object.assign(props, this.parsePropsGroup());
      } else {
        // OLD SYNTAX: {{{ 'card' | title: 'Text', description: 'Info' }}}
        while (
          this.currentToken().type !== TokenType.CLOSE_COMPONENT &&
          !(
            this.currentToken().type === TokenType.OPERATOR &&
            this.currentToken().value === '/'
          )
        ) {
          const propName = this.consume(TokenType.IDENTIFIER).value;

          // Accept either TEXT with ':' or COLON token
          if (this.currentToken().type === TokenType.COLON) {
            this.consume(TokenType.COLON);
          } else if (
            this.currentToken().type === TokenType.TEXT &&
            this.currentToken().value.trim() === ':'
          ) {
            this.consume(TokenType.TEXT);
          }

          const propValue = this.parsePrimary();
          props[propName] = propValue;

          if (this.currentToken().type === TokenType.COMMA) {
            this.consume(TokenType.COMMA);
          } else {
            break;
          }
        }
      }
    }

    // Check for Self-Closing: {{{ card ... / }}}
    let isSelfClosing = false;
    if (
      this.currentToken().type === TokenType.OPERATOR &&
      this.currentToken().value === '/'
    ) {
      this.consume(TokenType.OPERATOR);
      isSelfClosing = true;
    }

    this.consume(TokenType.CLOSE_COMPONENT);

    const component: Component = {
      type: 'Component',
      name: componentName,
    };

    if (isStatic) {
      component.isStatic = true;
    }

    if (Object.keys(props).length > 0) {
      component.props = props;
    }

    // If not self-closing, parse body
    if (!isSelfClosing) {
      const body: ASTNode[] = [];
      while (this.currentToken().type !== TokenType.EOF) {
        const node = this.parseNode();
        if (node) {
          if (node.type === 'ClosingComponent') {
            if (node.name === componentName) {
              break; // Found matching closing tag
            } else {
              throw new TemplateError(
                `Expected closing tag {{{ /${componentName} }}}, but got {{{ /${node.name} }}}`,
                this.currentToken().line,
                this.currentToken().column,
                this.templateName,
                this.templateSource,
              );
            }
          }
          body.push(node);
        }
      }
      if (body.length > 0) {
        component.body = body;
      }
    }

    return component;
  }

  private parsePropsGroup(): Record<string, ASTNode> {
    const props: Record<string, ASTNode> = {};
    this.consume(TokenType.LPAREN);

    while (this.currentToken().type !== TokenType.RPAREN) {
      // Expect :propName
      if (this.currentToken().type === TokenType.COLON) {
        this.consume(TokenType.COLON);
        const propName = this.consume(TokenType.IDENTIFIER).value;

        // Expect =
        this.consume(TokenType.OPERATOR, '=');

        // Parse prop value (expression)
        const propValue = this.parseExpression();
        props[propName] = propValue;

        // Handle comma
        if (this.currentToken().type === TokenType.COMMA) {
          this.consume(TokenType.COMMA);
        }
      } else {
        throw new Error(`Expected : for prop, got ${this.currentToken().type}`);
      }
    }

    this.consume(TokenType.RPAREN);
    return props;
  }

  private parseBlock(): ASTNode | null {
    this.consume(TokenType.OPEN_BLOCK);
    const keyword = this.consume(TokenType.KEYWORD);

    if (keyword.value === 'if') {
      return this.parseIfStatement();
    } else if (keyword.value === 'for') {
      return this.parseForLoop();
    } else if (keyword.value === 'island') {
      return this.parseIsland();
    } else if (keyword.value === 'transition') {
      return this.parseTransition();
    } else {
      throw new TemplateError(
        `Unexpected block keyword: ${keyword.value}`,
        keyword.line,
        keyword.column,
        this.templateName,
        this.templateSource,
      );
    }
  }

  private parseIsland(): Island {
    const startToken = this.currentToken();
    const nameToken = this.consume(TokenType.STRING);
    this.openTags.push({
      type: 'island',
      name: nameToken.value,
      line: startToken.line,
    });

    this.consume(TokenType.CLOSE_BLOCK);

    const body: ASTNode[] = [];
    while (this.currentToken().type !== TokenType.EOF) {
      const token = this.currentToken();
      if (token.type === TokenType.OPEN_BLOCK) {
        const nextToken = this.peek(1);
        // Check for {% endisland %}
        if (
          nextToken.type === TokenType.KEYWORD &&
          nextToken.value === 'endisland'
        ) {
          this.consume(TokenType.OPEN_BLOCK);
          this.consume(TokenType.KEYWORD);
          this.consume(TokenType.CLOSE_BLOCK);
          this.openTags.pop(); // Close the island tag
          break;
        }
        // Check for {% island "/" %}
        if (
          nextToken.type === TokenType.KEYWORD &&
          nextToken.value === 'island'
        ) {
          const stringToken = this.peek(2);
          if (
            stringToken.type === TokenType.STRING &&
            stringToken.value === '/'
          ) {
            this.consume(TokenType.OPEN_BLOCK);
            this.consume(TokenType.KEYWORD);
            this.consume(TokenType.STRING);
            this.consume(TokenType.CLOSE_BLOCK);
            this.openTags.pop(); // Close the island tag
            break;
          }
        }
      }
      const node = this.parseNode();
      if (node) body.push(node);
    }

    return { type: 'Island', name: nameToken.value, body };
  }

  private parseTransition(): Transition {
    const startToken = this.currentToken();
    const nameToken = this.consume(TokenType.STRING);
    this.openTags.push({
      type: 'transition',
      name: nameToken.value,
      line: startToken.line,
    });

    this.consume(TokenType.CLOSE_BLOCK);

    const body = this.parseBlockBody(['endtransition']);

    return { type: 'Transition', name: nameToken.value, body };
  }

  private parseIfStatement(): IfStatement {
    const startToken = this.currentToken();
    this.openTags.push({ type: 'if', name: 'if', line: startToken.line });

    const condition = this.parseExpression();
    this.consume(TokenType.CLOSE_BLOCK);

    const consequent: ASTNode[] = [];
    let alternate: ASTNode[] | null = null;

    while (this.currentToken().type !== TokenType.EOF) {
      const token = this.currentToken();
      if (token.type === TokenType.OPEN_BLOCK) {
        const nextToken = this.peek(1);
        if (nextToken.type === TokenType.KEYWORD) {
          if (nextToken.value === 'else') {
            this.consume(TokenType.OPEN_BLOCK);
            this.consume(TokenType.KEYWORD);
            this.consume(TokenType.CLOSE_BLOCK);
            alternate = this.parseBlockBody(['endif']);
            break;
          } else if (nextToken.value === 'endif') {
            this.consume(TokenType.OPEN_BLOCK);
            this.consume(TokenType.KEYWORD);
            this.consume(TokenType.CLOSE_BLOCK);
            this.openTags.pop(); // Close the if tag
            break;
          }
        }
      }
      const node = this.parseNode();
      if (node) consequent.push(node);
    }

    return { type: 'IfStatement', condition, consequent, alternate };
  }

  private parseBlockBody(endKeywords: string[]): ASTNode[] {
    const body: ASTNode[] = [];
    while (this.currentToken().type !== TokenType.EOF) {
      const token = this.currentToken();
      if (token.type === TokenType.OPEN_BLOCK) {
        const nextToken = this.peek(1);
        if (
          nextToken.type === TokenType.KEYWORD &&
          endKeywords.includes(nextToken.value)
        ) {
          this.consume(TokenType.OPEN_BLOCK);
          this.consume(TokenType.KEYWORD);
          this.consume(TokenType.CLOSE_BLOCK);
          this.openTags.pop(); // Close the tag
          return body;
        }
      }
      const node = this.parseNode();
      if (node) {
        if (node.type === 'ClosingComponent') {
          throw new TemplateError(
            `Unexpected closing tag: {{{ /${node.name} }}} inside block`,
            this.currentToken().line,
            this.currentToken().column,
            this.templateName,
            this.templateSource,
          );
        }
        body.push(node);
      }
    }
    return body;
  }

  private parseForLoop(): ForLoop {
    const startToken = this.currentToken();
    const item = this.consume(TokenType.IDENTIFIER).value;
    this.openTags.push({ type: 'for', name: item, line: startToken.line });

    this.consume(TokenType.KEYWORD);
    const collection = this.parseExpression();
    this.consume(TokenType.CLOSE_BLOCK);

    const body = this.parseBlockBody(['endfor']);
    // parseBlockBody already pops the tag when it finds endfor

    return { type: 'ForLoop', item, collection, body };
  }

  private parseExpression(): ASTNode {
    let left = this.parseLogicalOr();

    while (this.currentToken().type === TokenType.PIPE) {
      this.consume(TokenType.PIPE);
      const pipeName = this.consume(TokenType.IDENTIFIER).value;
      const args: ASTNode[] = [left];

      while (
        this.currentToken().type === TokenType.TEXT &&
        this.currentToken().value.trim() === ':'
      ) {
        this.consume(TokenType.TEXT);
        args.push(this.parsePrimary());
      }

      left = { type: 'CallExpression', callee: pipeName, arguments: args };
    }

    return left;
  }

  private parseLogicalOr(): ASTNode {
    let left = this.parseLogicalAnd();
    while (
      this.currentToken().type === TokenType.OPERATOR &&
      this.currentToken().value === '||'
    ) {
      const operator = this.consume(TokenType.OPERATOR).value;
      const right = this.parseLogicalAnd();
      left = { type: 'BinaryExpression', operator, left, right };
    }
    return left;
  }

  private parseLogicalAnd(): ASTNode {
    let left = this.parseEquality();
    while (
      this.currentToken().type === TokenType.OPERATOR &&
      this.currentToken().value === '&&'
    ) {
      const operator = this.consume(TokenType.OPERATOR).value;
      const right = this.parseEquality();
      left = { type: 'BinaryExpression', operator, left, right };
    }
    return left;
  }

  private parseEquality(): ASTNode {
    let left = this.parseRelational();
    while (
      this.currentToken().type === TokenType.OPERATOR &&
      ['==', '!='].includes(this.currentToken().value)
    ) {
      const operator = this.consume(TokenType.OPERATOR).value;
      const right = this.parseRelational();
      left = { type: 'BinaryExpression', operator, left, right };
    }
    return left;
  }

  private parseRelational(): ASTNode {
    let left = this.parseAdditive();
    while (
      this.currentToken().type === TokenType.OPERATOR &&
      ['<', '>', '<=', '>='].includes(this.currentToken().value)
    ) {
      const operator = this.consume(TokenType.OPERATOR).value;
      const right = this.parseAdditive();
      left = { type: 'BinaryExpression', operator, left, right };
    }
    return left;
  }

  private parseAdditive(): ASTNode {
    let left = this.parseMultiplicative();
    while (
      this.currentToken().type === TokenType.OPERATOR &&
      ['+', '-'].includes(this.currentToken().value)
    ) {
      const operator = this.consume(TokenType.OPERATOR).value;
      const right = this.parseMultiplicative();
      left = { type: 'BinaryExpression', operator, left, right };
    }
    return left;
  }

  private parseMultiplicative(): ASTNode {
    let left = this.parseUnary();
    while (
      this.currentToken().type === TokenType.OPERATOR &&
      ['*', '/'].includes(this.currentToken().value)
    ) {
      const operator = this.consume(TokenType.OPERATOR).value;
      const right = this.parseUnary();
      left = { type: 'BinaryExpression', operator, left, right };
    }
    return left;
  }

  private parseUnary(): ASTNode {
    if (
      this.currentToken().type === TokenType.OPERATOR &&
      ['!', '-', '+'].includes(this.currentToken().value)
    ) {
      const operator = this.consume(TokenType.OPERATOR).value;
      const argument = this.parseUnary();
      return { type: 'UnaryExpression', operator, argument };
    }
    return this.parseMember();
  }

  private parseMember(): ASTNode {
    let object = this.parsePrimary();

    while (true) {
      if (this.currentToken().type === TokenType.DOT) {
        this.consume(TokenType.DOT);
        const property = this.consume(TokenType.IDENTIFIER);
        object = {
          type: 'MemberExpression',
          object,
          property: { type: 'Identifier', name: property.value },
        };
      } else if (this.currentToken().type === TokenType.LPAREN) {
        this.consume(TokenType.LPAREN);
        const args: ASTNode[] = [];

        if (this.currentToken().type !== TokenType.RPAREN) {
          args.push(this.parseExpression());
          while (this.currentToken().type === TokenType.COMMA) {
            this.consume(TokenType.COMMA);
            args.push(this.parseExpression());
          }
        }

        this.consume(TokenType.RPAREN);
        object = { type: 'FunctionCall', callee: object, arguments: args };
      } else {
        break;
      }
    }

    return object;
  }

  private parseObjectProperties(
    endTokenType: TokenType,
  ): { key: string; value: ASTNode }[] {
    const properties: { key: string; value: ASTNode }[] = [];
    if (this.currentToken().type !== endTokenType) {
      do {
        const key = this.consume(TokenType.IDENTIFIER);
        this.consume(TokenType.COLON);
        const value = this.parseExpression();
        properties.push({ key: key.value, value });
        if (this.currentToken().type === TokenType.COMMA) {
          this.consume(TokenType.COMMA);
        } else {
          break;
        }
      } while (true);
    }
    return properties;
  }

  private parseArray(): ASTNode {
    this.consume(TokenType.LBRACKET);
    const elements: ASTNode[] = [];

    if (this.currentToken().type !== TokenType.RBRACKET) {
      do {
        elements.push(this.parseExpression());
        if (this.currentToken().type === TokenType.COMMA) {
          this.consume(TokenType.COMMA);
        } else {
          break;
        }
      } while (true);
    }

    this.consume(TokenType.RBRACKET);
    return { type: 'ArrayLiteral', elements };
  }

  private parsePrimary(): ASTNode {
    const token = this.currentToken();

    if (token.type === TokenType.STRING) {
      this.advance();
      return { type: 'Literal', value: token.value };
    }

    if (token.type === TokenType.NUMBER) {
      this.advance();
      return { type: 'Literal', value: Number(token.value) };
    }

    if (token.type === TokenType.IDENTIFIER) {
      this.advance();
      if (token.value === 'true') return { type: 'Literal', value: true };
      if (token.value === 'false') return { type: 'Literal', value: false };
      return { type: 'Identifier', name: token.value };
    }

    if (token.type === TokenType.LPAREN) {
      // Check for object literal syntax: (key: value)
      const next = this.peek(1);
      const next2 = this.peek(2);
      if (
        next.type === TokenType.IDENTIFIER &&
        next2.type === TokenType.COLON
      ) {
        this.consume(TokenType.LPAREN);
        const properties = this.parseObjectProperties(TokenType.RPAREN);
        this.consume(TokenType.RPAREN);
        return { type: 'ObjectLiteral', properties };
      }

      this.consume(TokenType.LPAREN);
      const expr = this.parseExpression();
      this.consume(TokenType.RPAREN);
      return expr;
    }

    if (token.type === TokenType.LBRACKET) {
      return this.parseArray();
    }

    if (token.type === TokenType.LBRACE) {
      this.consume(TokenType.LBRACE);
      const properties: { key: string; value: ASTNode }[] = [];
      if (this.currentToken().type !== TokenType.RBRACE) {
        do {
          const key = this.consume(TokenType.IDENTIFIER);
          this.consume(TokenType.COLON);
          const value = this.parseExpression();
          properties.push({ key: key.value, value });
          if (this.currentToken().type === TokenType.COMMA) {
            this.consume(TokenType.COMMA);
          } else {
            break;
          }
        } while (true);
      }
      this.consume(TokenType.RBRACE);
      return { type: 'ObjectLiteral', properties };
    }

    throw new TemplateError(
      `Unexpected token in expression: ${token.value} (${TokenType[token.type]})`,
      token.line,
      token.column,
      this.templateName,
      this.templateSource,
    );
  }

  private currentToken(): Token {
    if (this.position >= this.tokens.length) {
      return { type: TokenType.EOF, value: '', line: 0, column: 0 };
    }
    return this.tokens[this.position];
  }

  private peek(offset: number): Token {
    if (this.position + offset >= this.tokens.length) {
      return { type: TokenType.EOF, value: '', line: 0, column: 0 };
    }
    return this.tokens[this.position + offset];
  }

  private advance(): void {
    this.position++;
  }

  private consume(type: TokenType, value?: string): Token {
    const token = this.currentToken();
    if (token.type === type) {
      if (value !== undefined && token.value !== value) {
        throw new TemplateError(
          `Expected token ${TokenType[type]} with value '${value}', but got '${token.value}'`,
          token.line,
          token.column,
          this.templateName,
          this.templateSource,
        );
      }
      this.advance();
      return token;
    }
    throw new TemplateError(
      `Expected token type ${TokenType[type]}${value ? ` with value '${value}'` : ''}, but got ${TokenType[token.type]} ('${token.value}')`,
      token.line,
      token.column,
      this.templateName,
      this.templateSource,
    );
  }
}
