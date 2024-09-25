import {
  TemplateData,
  ComponentDefinition,
  HeaderDefinition,
  LinkDefinition,
} from '../types';
import JigSaw from './jigsaw';

class Knob {
  private readonly template: string;

  constructor(template: string) {
    this.template = template;
  }

  render(data: TemplateData): string {
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

      if (expression.startsWith('{{')) {
        const innerExpression = expression.slice(2, -2).trim();
        result += this.evaluateExpression(innerExpression, data);
      } else if (expression.startsWith('{%')) {
        const controlStructure = expression.slice(2, -2).trim();
        result += this.processControlStructure(controlStructure, data);
      }

      lastIndex = regex.lastIndex;
    }

    result += content.slice(lastIndex);
    return result;
  }

  private processControlStructure(
    structure: string,
    data: TemplateData
  ): string {
    const [keyword, ...rest] = structure.split(/\s+/);
    const condition = rest.join(' ');

    if (keyword === 'if') {
      return this.processIfStatement(condition, data);
    } else if (keyword === 'for') {
      return this.processForLoop(condition, data);
    }

    return '';
  }

  private processIfStatement(condition: string, data: TemplateData): string {
    const result = this.evaluateCondition(condition, data);

    const ifStartTag = `{% if ${condition} %}`;
    const ifEndTag = '{% endif %}';
    const elseTag = '{% else %}';
    const elseEndTag = '{% endelse %}';

    const ifBlock = this.extractBlock('if', condition);
    const elseBlock = this.extractBlock('else');
    if (result) {
      if (
        ifBlock &&
        ifBlock.includes(ifStartTag) &&
        ifBlock.includes(ifEndTag)
      ) {
        const content = ifBlock.slice(
          ifStartTag.length,
          ifBlock.lastIndexOf(ifEndTag)
        );
        return this.renderContent(content, data);
      }
    } else if (
      elseBlock &&
      elseBlock.startsWith(elseTag) &&
      elseBlock.endsWith(elseEndTag)
    ) {
      const content = elseBlock.slice(
        elseTag.length,
        elseBlock.lastIndexOf(elseEndTag)
      );
      return this.renderContent(content, data);
    }

    return '';
  }

  private processForLoop(condition: string, data: TemplateData): string {
    const [item, , collection] = condition.split(' ');
    const items = this.getValueFromData(collection, data);
    const loopBlock = this.extractBlock('for', condition);

    if (!Array.isArray(items)) return '';

    let result = '';
    items.forEach((itemData, index) => {
      const itemContext = {
        ...data,
        [item]: itemData,
        [`${item}_index`]: index,
        [`${item}_first`]: index === 0,
        [`${item}_last`]: index === items.length - 1,
      };
      result += this.renderContent(loopBlock, itemContext);
    });

    return result;
  }

  private extractBlock(
    blockType: string,
    condition?: string,
    data?: TemplateData
  ): string {
    let startTag = condition
      ? `{% ${blockType} ${condition} %}`
      : `{% ${blockType} %}`;
    const endTag = `{% end${blockType} %}`;
    let depth = 0;
    let startIndex = this.template.indexOf(startTag);
    let endIndex = startIndex;

    if (blockType === 'if' && condition && data) {
      const conditionResult = this.evaluateCondition(condition, data);

      if (!conditionResult) {
        const elseTag = '{% else %}';
        const elseIndex = this.template.indexOf(elseTag, startIndex);
        if (
          elseIndex !== -1 &&
          elseIndex < this.template.indexOf(endTag, startIndex)
        ) {
          startIndex = elseIndex;
          startTag = elseTag;
        } else {
          return '';
        }
      }
    }

    while (endIndex < this.template.length) {
      const nextStart = this.template.indexOf(`{% ${blockType}`, endIndex + 1);
      const nextEnd = this.template.indexOf(endTag, endIndex + 1);
      if (nextStart !== -1 && nextStart < nextEnd) {
        depth++;
        endIndex = nextStart;
      } else if (nextEnd !== -1) {
        if (depth === 0) {
          endIndex = nextEnd;
          break;
        }
        depth--;
        endIndex = nextEnd;
      } else {
        break;
      }
    }

    if (startIndex === -1 || endIndex === -1) {
      return '';
    }

    const extractedBlock = this.template.slice(
      startIndex + startTag.length,
      endIndex
    );
    return extractedBlock;
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
      'img',
      'br',
      'hr',
      'input',
      'meta',
      'link',
      'area',
      'base',
      'col',
      'embed',
      'param',
      'source',
      'track',
      'wbr',
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
