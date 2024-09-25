import Knob from './knob';
import { TemplateData, JigSawConfig, CachedRoute } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { parse, HTMLElement } from 'node-html-parser';
import * as chokidar from 'chokidar';

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
  private static componentsDir: string = path.join(process.cwd(), 'components');

  private static components: Map<string, string> = new Map();
  private static watcher: chokidar.FSWatcher | null = null;
  private static routeCache: Map<string, CachedRoute> = new Map();
  private static parentRoutes: Set<string> = new Set();

  constructor(config: Partial<JigSawConfig> = {}) {
    JigSaw.config = { ...JigSaw.config, ...config };
  }

  static template(nameOrNames: string | string[]): void {
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

  static route(
    routePath: string,
    handler: (params?: Record<string, string>) => string | Promise<string>
  ): void {
    const paramNames = this.getRouteParams(routePath);

    if (paramNames.length === 0) {
      this.parentRoutes.add(routePath);
    }

    this.routes.set(routePath, async (params?: Record<string, string>) => {
      for (const param of paramNames) {
        if (!(param in params! || params === undefined)) {
          throw new Error(`Missing required parameter: ${param}`);
        }
      }

      const cacheKey = this.getCacheKey(routePath, params);
      const cachedRoute = this.routeCache.get(cacheKey);

      if (cachedRoute && !this.isCacheExpired(cachedRoute)) {
        return cachedRoute.content;
      }

      const content = await handler(params);
      const fullHtml = this.processHtml(content);

      this.routeCache.set(cacheKey, {
        content: fullHtml,
        lastUpdated: Date.now(),
      });

      return fullHtml;
    });
  }

  private static getRouteParams(routePath: string): string[] {
    return routePath
      .split('/')
      .filter((part) => part.startsWith(':'))
      .map((part) => part.slice(1));
  }

  private static async handleRoute(path: string): Promise<string> {
    const [routePath, params] = this.matchRoute(path);
    const routeHandler = this.routes.get(routePath);
    if (routeHandler) {
      try {
        const cacheKey = this.getCacheKey(routePath, params);
        const cachedRoute = this.routeCache.get(cacheKey);

        if (cachedRoute && !this.isCacheExpired(cachedRoute)) {
          return cachedRoute.content;
        }

        const content = await routeHandler(params);
        this.routeCache.set(cacheKey, {
          content,
          lastUpdated: Date.now(),
        });
        return content;
      } catch (error) {
        console.error(`Error handling route ${path}:`, error);
        return '500 Internal Server Error';
      }
    }
    return '404 Not Found';
  }

  private static matchRoute(path: string): [string, Record<string, string>] {
    // First, check for exact matches (parent routes)
    if (this.parentRoutes.has(path)) {
      return [path, {}];
    }

    // If no exact match, look for parameterized routes
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

  static serve({ port }: JigSawConfig): void {
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

    this.clearCache();
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

  private static getCacheKey(
    routePath: string,
    params?: Record<string, string>
  ): string {
    if (!params) return routePath;
    const paramString = Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    return `${routePath}?${paramString}`;
  }

  private static isCacheExpired(cachedRoute: CachedRoute): boolean {
    const cacheLifetime = 5 * 60 * 1000; // 5 minutes in milliseconds
    return Date.now() - cachedRoute.lastUpdated > cacheLifetime;
  }

  private static clearCache(): void {
    this.routeCache.clear();
  }
}

export default JigSaw;
