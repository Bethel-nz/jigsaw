import {
  TemplateData,
  ComponentDefinition,
  HeaderDefinition,
  LinkDefinition,
} from './types';
import JigSaw from './jigsaw';

class Knob {
  private readonly template: string;
  private processingBlocks: Set<string> = new Set();

  constructor(template: string) {
    this.template = template;
  }

  render(data: TemplateData): string {
    this.processingBlocks.clear();
    return this.renderContent(this.processComponents(data), data);
  }

  private processComponents(data: TemplateData): string {
    const componentRegex = /{{{(\w+)}}}/g;
    return this.template.replace(componentRegex, (match, componentName) => {
      const componentTemplate = JigSaw.getComponent(componentName);
      if (!componentTemplate) {
        console.warn(`Component not found: ${componentName}`);
        return '';
      }
      const componentData = data[componentName] || {};
      return this.renderContent(componentTemplate, componentData);
    });
  }

  private renderContent(content: string, data: TemplateData): string {
    const regex = /(\{\{[^}]+\}\}|\{%[^%]+%\})/g;
    let lastIndex = 0;
    let result = '';

    let match;
    while ((match = regex.exec(content)) !== null) {
      result += content.slice(lastIndex, match.index);
      const expression = match[0];

      const expressionKey = `${match.index}-${expression}`;
      
      if (this.processingBlocks.has(expressionKey)) {
        result += expression;
        lastIndex = regex.lastIndex;
        continue;
      }

      this.processingBlocks.add(expressionKey);

      try {
        if (expression.startsWith('{{')) {
          const innerExpression = expression.slice(2, -2).trim();
          result += this.evaluateExpression(innerExpression, data);
        } else if (expression.startsWith('{%')) {
          const controlStructure = expression.slice(2, -2).trim();
          result += this.processControlStructure(controlStructure, data);
        }
      } finally {
        this.processingBlocks.delete(expressionKey);
      }

      lastIndex = regex.lastIndex;
    }

    result += content.slice(lastIndex);
    return result;
  }

  private processControlStructure(structure: string, data: TemplateData): string {
    const [keyword, ...rest] = structure.split(/\s+/);
    const condition = rest.join(' ');

    const blockContent = this.extractBlock(keyword, condition);
    if (!blockContent) return '';

    if (keyword === 'if') {
      return this.processIfStatement(condition, data);
    } else if (keyword === 'for') {
      return this.processForLoop(condition, data);
    }

    return '';
  }

  private processForLoop(condition: string, data: TemplateData): string {
    const [item, , collection] = condition.split(' ');
    const items = this.getValueFromData(collection, data);

    if (!Array.isArray(items)) {
      console.warn(`Data for collection "${collection}" is not an array`);
      return '';
    }

    const loopBlock = this.extractBlock('for', condition);
    if (!loopBlock) return '';

    let result = '';
    const loopKey = `for-${item}-${collection}`;
    
    if (this.processingBlocks.has(loopKey)) {
      return '';
    }

    this.processingBlocks.add(loopKey);

    try {
      for (let i = 0; i < items.length; i++) {
        const itemData = items[i];
        if (itemData == null) continue;

        let processedBlock = loopBlock;
        const firstElementMatch = processedBlock.match(/^(\s*)<([^>]+)>/);
        if (firstElementMatch) {
          const [fullMatch, whitespace, tag] = firstElementMatch;
          const replacement = `${whitespace}<${tag} data-loop-index="${i}" data-loop-collection="${collection}">`;
          processedBlock = processedBlock.replace(fullMatch, replacement);
        }

        const itemContext = {
          ...data,
          [item]: itemData,
          [`${item}_index`]: i,
          [`${item}_first`]: i === 0,
          [`${item}_last`]: i === items.length - 1,
        };

        result += this.renderContent(processedBlock, itemContext);
      }
    } finally {
      this.processingBlocks.delete(loopKey);
    }

    return result;
  }

  private processIfStatement(condition: string, data: TemplateData): string {
    const result = this.evaluateCondition(condition, data);
    const ifBlock = this.extractBlock('if', condition);
    
    if (!ifBlock) return '';

    const elseTag = '{% else %}';
    const elseIndex = ifBlock.indexOf(elseTag);
    
    // Split content into if and else blocks
    const ifContent = elseIndex !== -1 ? ifBlock.slice(0, elseIndex) : ifBlock;
    const elseContent = elseIndex !== -1 ? ifBlock.slice(elseIndex + elseTag.length) : '';

    // Find the immediate wrapped element
    const elementRegex = /^\s*(<[^>]+>)([\s\S]*?)(<\/[^>]+>)\s*$/;
    const ifMatch = ifContent.match(elementRegex);
    const elseMatch = elseContent ? elseContent.match(elementRegex) : null;

    let renderedContent = '';
    
    if (result) {
      // If condition is true, render the if block
      if (ifMatch) {
        const [, openTag, content, closeTag] = ifMatch;
        const processedContent = this.renderContent(content, data);
        if (processedContent.trim()) {
          renderedContent = `${openTag}${processedContent}${closeTag}`;
        }
      } else {
        renderedContent = this.renderContent(ifContent, data);
      }
    } else if (elseContent) {
      // If condition is false and else block exists, render the else block
      if (elseMatch) {
        const [, openTag, content, closeTag] = elseMatch;
        const processedContent = this.renderContent(content, data);
        if (processedContent.trim()) {
          renderedContent = `${openTag}${processedContent}${closeTag}`;
        }
      } else {
        renderedContent = this.renderContent(elseContent, data);
      }
    }

    return renderedContent;
  }

  private extractBlock(blockType: string, condition?: string): string {
    const startTag = condition ? `{% ${blockType} ${condition} %}` : `{% ${blockType} %}`;
    const endTag = `{% end${blockType} %}`;
    
    const startIndex = this.template.indexOf(startTag);
    if (startIndex === -1) return '';

    let depth = 1;
    let currentIndex = startIndex + startTag.length;

    while (currentIndex < this.template.length) {
      const nextStart = this.template.indexOf(`{% ${blockType}`, currentIndex);
      const nextEnd = this.template.indexOf(endTag, currentIndex);

      if (nextEnd === -1) return '';
      
      if (nextStart !== -1 && nextStart < nextEnd) {
        depth++;
        currentIndex = nextStart + startTag.length;
      } else {
        depth--;
        if (depth === 0) {
          return this.template.slice(startIndex + startTag.length, nextEnd);
        }
        currentIndex = nextEnd + endTag.length;
      }
    }

    return '';
  }

  private evaluateExpression(expression: string, data: TemplateData): string {
    const value = this.getValueFromData(expression, data);
    if (typeof value === 'object' && value !== null) {
      if ('tag' in value) {
        return this.renderComponent(value as ComponentDefinition);
      } else if (value.type === 'link') {
        return this.renderLink(value as LinkDefinition);
      } else if (value.type === 'header') {
        return this.renderHeader(value as HeaderDefinition);
      }
      return JSON.stringify(value);
    }
    return value !== undefined && value !== null ? String(value) : '';
  }

  private evaluateCondition(condition: string, data: TemplateData): boolean {
    return !!this.getValueFromData(condition, data);
  }

  private getValueFromData(path: string, data: TemplateData): any {
    const keys = path.split('.');
    let value: any = data;
    for (const key of keys) {
      if (value === undefined || value === null) return undefined;
      value = value[key];
    }
    return value;
  }

  private renderComponent(component: ComponentDefinition): string {
    const { tag, content, props = {}, children = [] } = component;

    let attributes = Object.entries(props)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');

    if (attributes) {
      attributes = ' ' + attributes;
    }

    let childContent = content || '';
    if (children.length > 0) {
      childContent += children
        .map((child) => this.renderComponent(child))
        .join('');
    }

    const voidElements = [
      'img', 'br', 'hr', 'input', 'meta', 'link', 'area',
      'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'
    ];

    if (voidElements.includes(tag)) {
      return `<${tag}${attributes}/>`;
    }

    if (childContent.trim() === '') {
      return '';
    }

    return `<${tag}${attributes}>${childContent}</${tag}>`;
  }

  private renderLink(linkData: LinkDefinition): string {
    const { href, text, title } = linkData;
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr}>${text}</a>`;
  }

  private renderHeader(headerData: HeaderDefinition): string {
    const { level, text, id } = headerData;
    const idAttr = id ? ` id="${id}"` : '';
    return `<h${level}${idAttr}>${text}</h${level}>`;
  }
}

export default Knob;
