import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { parse, HTMLElement } from 'node-html-parser';
import * as chokidar from 'chokidar';
import { fetchUserData } from './data';

type TemplateData = Record<string, any>;
interface JigSawConfig {
  port?: number;
}

interface ComponentDefinition {
  tag: string;
  content?: string;
  props?: Record<string, any>;
  children?: ComponentDefinition[];
}

interface LinkDefinition {
  type: 'link';
  href: string;
  text: string;
  title?: string;
}

interface HeaderDefinition {
  type: 'header';
  level: number;
  text: string;
  id?: string;
}

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

class JigSaw {
  private static templates: Map<string, Knob> = new Map();
  private static partials: Map<string, Knob> = new Map();
  private static routes: Map<
    string,
    (params?: Record<string, string>) => string | Promise<string>
  > = new Map();

  private static config: JigSawConfig = {
    port: 3000,
  };

  private static templatesDir: string = path.join(process.cwd(), 'templates');
  private static buildDir: string = path.join(process.cwd(), '.build');
  private static componentsDir: string = path.join(process.cwd(), 'components');

  private static components: Map<string, string> = new Map();
  private static watcher: chokidar.FSWatcher | null = null;

  static configure(newConfig: JigSawConfig): void {
    this.config = { ...this.config, ...newConfig };
  }

  static registerTemplate(nameOrNames: string | string[]): void {
    if (Array.isArray(nameOrNames)) {
      nameOrNames.forEach((name) => this.loadSingleTemplate(name));
    } else {
      this.loadSingleTemplate(nameOrNames);
    }
  }

  private static loadSingleTemplate(name: string): void {
    const templatePath = path.join(this.templatesDir, `${name}.jig`);
    if (!fs.existsSync(templatePath)) {
      console.warn(
        `Template file not found: ${templatePath}. Using empty template.`
      );
      this.templates.set(name, new Knob(''));
    } else {
      const fileContent = fs.readFileSync(templatePath, 'utf-8');
      this.templates.set(name, new Knob(fileContent));
    }
  }

  static render(name: string, data: TemplateData): string {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template "${name}" not found`);
    }
    return template.render(data);
  }

  private static processHtml(html: string): string {
    const root = parse(html);

    const isElementEmpty = (element: HTMLElement): boolean => {
      return (
        element.textContent.trim() === '' &&
        !element.childNodes.some(
          (child) =>
            child.nodeType === 1 && !isElementEmpty(child as HTMLElement)
        )
      );
    };

    const isSelfClosingTag = (tagName: string): boolean => {
      const selfClosingTags = [
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
      return selfClosingTags.includes(tagName.toLowerCase());
    };

    const processNode = (node: HTMLElement): string => {
      if (node.nodeType === 3) {
        return node.text;
      }

      if (node.nodeType === 1) {
        const tagName = node.tagName.toLowerCase();

        if (tagName === '!doctype') {
          return '<!DOCTYPE html>';
        }

        if (isSelfClosingTag(tagName)) {
          return `<${tagName}${node.rawAttrs ? ' ' + node.rawAttrs : ''}>`;
        }

        if (isElementEmpty(node) && !['script', 'style'].includes(tagName)) {
          return '';
        }

        const childContent = node.childNodes
          .map((child) => processNode(child as HTMLElement))
          .join('');

        return `<${tagName}${
          node.rawAttrs ? ' ' + node.rawAttrs : ''
        }>${childContent}</${tagName}>`;
      }

      return '';
    };

    return root.childNodes
      .map((child) => processNode(child as HTMLElement))
      .join('');
  }

  static registerRoute(
    routePath: string,
    handler: (params?: Record<string, string>) => string | Promise<string>
  ): void {
    const paramNames = this.getRouteParams(routePath);

    this.routes.set(routePath, async (params?: Record<string, string>) => {
      for (const param of paramNames) {
        if (!(param in params! || params === undefined)) {
          throw new Error(`Missing required parameter: ${param}`);
        }
      }

      const content = await handler(params);
      const fullHtml = this.processHtml(content);
      this.updateBuildFile(routePath, fullHtml);
      return fullHtml;
    });

    this.buildRoute(routePath);
  }

  private static getRouteParams(routePath: string): string[] {
    return routePath
      .split('/')
      .filter((part) => part.startsWith(':'))
      .map((part) => part.slice(1));
  }

  private static updateBuildFile(routePath: string, content: string): void {
    const buildPath = path.join(
      this.buildDir,
      `${routePath === '/' ? 'index' : routePath}.html`
    );
    fs.mkdirSync(path.dirname(buildPath), { recursive: true });
    fs.writeFileSync(buildPath, content);
  }

  private static buildRoute(routePath: string): void {
    const handler = this.routes.get(routePath);
    if (handler) {
      const content = handler({});
      const buildPath = path.join(
        this.buildDir,
        `${routePath.slice(1) || 'index'}.html`
      );
      fs.writeFileSync(buildPath, content as string);
    }
  }

  private static async handleRoute(path: string): Promise<string> {
    const [routePath, params] = this.matchRoute(path);
    const routeHandler = this.routes.get(routePath);
    if (routeHandler) {
      try {
        return await routeHandler(params);
      } catch (error) {
        console.error(`Error handling route ${path}:`, error);
        return '500 Internal Server Error';
      }
    }
    return '404 Not Found';
  }

  private static matchRoute(path: string): [string, Record<string, string>] {
    for (const [routePath, handler] of this.routes) {
      const routeParts = routePath.split('/');
      const pathParts = path.split('/');

      if (routeParts.length === pathParts.length) {
        const params: Record<string, string> = {};
        let match = true;

        for (let i = 0; i < routeParts.length; i++) {
          if (routeParts[i].startsWith(':')) {
            const paramName = routeParts[i].slice(1);
            params[paramName] = pathParts[i];
          } else if (routeParts[i] !== pathParts[i]) {
            match = false;
            break;
          }
        }

        if (match) {
          return [routePath, params];
        }
      }
    }
    return ['', {}];
  }

  static serve() {
    fs.mkdirSync(this.buildDir, { recursive: true });
    this.loadTemplates();
    this.loadComponents();
    this.startWatcher();

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      let pathname = url.pathname || '/';

      const staticFilePath = path.join(process.cwd(), 'public', pathname);
      if (
        fs.existsSync(staticFilePath) &&
        fs.statSync(staticFilePath).isFile()
      ) {
        const ext = path.extname(staticFilePath);
        const contentType = this.getContentType(ext);

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(staticFilePath).pipe(res);
        return;
      }

      const content = await this.handleRoute(pathname);
      const statusCode =
        content.startsWith('4') || content.startsWith('5')
          ? parseInt(content.slice(0, 3))
          : 200;

      res.writeHead(statusCode, { 'Content-Type': 'text/html' });
      res.end(content);
    });

    server.listen(this.config.port, () => {
      console.log(`Server running at http://localhost:${this.config.port}/`);
    });
  }

  private static getContentType(ext: string): string {
    const contentTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.xml': 'application/xml',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf',
    };

    return contentTypes[ext.toLowerCase()] || 'application/octet-stream';
  }

  static loadComponents(): void {
    if (!fs.existsSync(this.componentsDir)) {
      console.warn(`Components directory not found: ${this.componentsDir}`);
      return;
    }

    const files = fs.readdirSync(this.componentsDir);
    files.forEach((file) => {
      if (file.startsWith('_') && file.endsWith('.jig')) {
        const componentName = file.slice(1, -4);
        const componentPath = path.join(this.componentsDir, file);
        const content = fs.readFileSync(componentPath, 'utf-8');
        this.components.set(componentName, content);
      }
    });
  }

  static getComponent(name: string): string {
    const component = this.components.get(name);
    if (!component) {
      console.warn(`Component not found: ${name}`);
      return '';
    }
    return component;
  }

  static startWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
    }

    const watchPaths = [this.templatesDir, this.componentsDir];

    this.watcher = chokidar.watch(watchPaths, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
    });

    this.watcher
      .on('add', (path) => this.handleFileChange(path, 'added'))
      .on('change', (path) => this.handleFileChange(path, 'changed'))
      .on('unlink', (path) => this.handleFileChange(path, 'removed'));
  }

  private static handleFileChange(
    path: string,
    changeType: 'added' | 'changed' | 'removed'
  ): void {
    const isComponent = path.startsWith(this.componentsDir);
    const name = isComponent
      ? this.getComponentNameFromPath(path)
      : this.getTemplateNameFromPath(path);

    if (changeType === 'removed') {
      if (isComponent) {
        this.components.delete(name);
      } else {
        this.templates.delete(name);
      }
    } else {
      if (isComponent) {
        this.loadComponent(path);
      } else {
        this.loadTemplate(path);
      }
    }

    this.rebuildAllRoutes();
  }

  private static getComponentNameFromPath(path: string): string {
    return path.split('/').pop()!.slice(1, -4);
  }

  private static getTemplateNameFromPath(path: string): string {
    return path.split('/').pop()!.slice(0, -4);
  }

  private static loadComponent(path: string): void {
    const componentName = this.getComponentNameFromPath(path);
    const content = fs.readFileSync(path, 'utf-8');
    this.components.set(componentName, content);
  }

  private static loadTemplate(path: string): void {
    const templateName = this.getTemplateNameFromPath(path);
    const content = fs.readFileSync(path, 'utf-8');
    this.templates.set(templateName, new Knob(content));
  }

  private static loadTemplates(): void {
    if (!fs.existsSync(this.templatesDir)) {
      console.warn(`Templates directory not found: ${this.templatesDir}`);
      return;
    }

    const files = fs.readdirSync(this.templatesDir);
    files.forEach((file) => {
      if (file.endsWith('.jig')) {
        const templatePath = path.join(this.templatesDir, file);
        this.loadTemplate(templatePath);
      }
    });
  }
  private static rebuildAllRoutes(): void {
    this.routes.forEach((_, routePath) => {
      this.buildRoute(routePath);
    });
  }
}

JigSaw.configure({
  port: 8750,
});

JigSaw.registerTemplate(['index', 'profile']);

JigSaw.registerRoute('/profile', async (params) => {
  const data = await fetchUserData('2');
  return JigSaw.render('profile', data);
});

JigSaw.registerRoute('/', (params) => {
  return JigSaw.render('index', { title: 'Welcome' });
});

JigSaw.serve();
