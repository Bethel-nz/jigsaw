export type Token = {
  type: TokenType;
  value: string;
};
export enum TokenType {
  TEXT,
  EXPRESSION,
  CONTROL,
  COMPONENT,
  ControlStructure,
  Expression,
}

export type TemplateData = Record<string, any>;
export interface JigSawConfig {
  port: number;
}

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

export interface CachedRoute {
  content: string;
  lastUpdated: number;
}
