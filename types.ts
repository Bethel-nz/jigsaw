export enum TokenType {
    // Single-character tokens
    LEFT_PAREN, RIGHT_PAREN, LEFT_BRACE, RIGHT_BRACE,
    DOT, SEMICOLON, EQUAL,
  
    // Literals
    IDENTIFIER, STRING, NUMBER,
  
    // Keywords
    FUNCTION, CONST,
  
    EOF,
    TEXT,
    TEMPLATE
  }
  
  export interface Token {
    type: TokenType;
    lexeme: string;
    literal?: any;
    line: number;
    column: number;
  }

  export  type TemplateData = {
    components?: ComponentDefinition[];
    links?: LinkDefinition[];
    headers?: HeaderDefinition[];
    [key: string]: any;
  };
  export interface ComponentDefinition {
    tag: string;
    content?: string;
    props?: Record<string, any>;
    children?: ComponentDefinition[];
  }
  
  export interface LinkDefinition {
    type: 'link';
    href: string;
    text: string;
    title?: string;
  }
  
  export interface HeaderDefinition {
    type: 'header';
    level: number;
    text: string;
    id?: string;
  }