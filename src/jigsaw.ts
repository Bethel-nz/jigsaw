import Knob from './knob';
import { TemplateError } from './errors';
import { TemplateData, JigSawConfig, CachedRoute, RenderResult } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { parse, HTMLElement } from 'node-html-parser';
import * as chokidar from 'chokidar';
import { formatErrorPage, ErrorContext } from './errorPage';
import { WebSocketServer, WebSocket } from 'ws';

class JigSaw {
  private static templates: Map<string, Knob> = new Map();
  private static components: Map<string, string> = new Map();
  private static pipes: Map<string, Function> = new Map([
    ['safe', (str: string) => str],
    ['json', (data: any) => JSON.stringify(data)],
    ['upper', (str: string) => (str ? str.toUpperCase() : '')],
  ]);
  private static routes: Map<
    string,
    (
      params?: Record<string, string>,
    ) => string | RenderResult | Promise<string | RenderResult>
  > = new Map();
  private static routeCache: Map<string, CachedRoute> = new Map();
  private static parentRoutes: Set<string> = new Set();
  private static preloadedTemplates: Record<string, string> | null = null;
  private static appShell: string | null = null;

  private static watcher: chokidar.FSWatcher | null = null;
  private static wss: WebSocketServer | null = null;

  private static templatesDir: string = path.join(process.cwd(), 'templates');
  private static componentsDir: string = path.join(process.cwd(), 'templates', 'components');
  private static publicDir: string = path.join(process.cwd(), 'public');

  private static config: JigSawConfig = {
    port: 3000,
  };

  constructor(config: Partial<JigSawConfig> = {}) {
    JigSaw.config = { ...JigSaw.config, ...config };
  }

  static definePipe(name: string, fn: Function): void {
    this.pipes.set(name, fn);
  }

  static getPipes(): Record<string, Function> {
    return Object.fromEntries(this.pipes);
  }

  
  
  static useAppShell(html: string): void {
    this.appShell = html;
  }

  static usePreloadedTemplates(templates: Record<string, string>): void {
    this.preloadedTemplates = templates;
    // Hydrate the template map immediately
    for (const [name, content] of Object.entries(templates)) {
      if (name.startsWith("comp:")) {
         this.components.set(name.slice(5), content);
      } else {
         this.templates.set(name, new Knob(content, name));
      }
    }
  }

  static template(nameOrNames: string | string[]): void {
    if (Array.isArray(nameOrNames)) {
      nameOrNames.forEach((name) => this.loadSingleTemplate(name));
    } else {
      this.loadSingleTemplate(nameOrNames);
    }
  }

  private static loadSingleTemplate(name: string): void {
    if (this.preloadedTemplates && this.templates.has(name)) return;
    const templatePath = path.join(this.templatesDir, `${name}.jig`);
    if (!fs.existsSync(templatePath)) {
      console.warn(
        `Template file not found: ${templatePath}. Using empty template.`,
      );
      this.templates.set(name, new Knob('', name));
    } else {
      const fileContent = fs.readFileSync(templatePath, 'utf-8');
      this.templates.set(name, new Knob(fileContent, name));
    }
  }

  static render(
    name: string,
    data: TemplateData,
    initialMeta: any = {},
  ): RenderResult {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template "${name}" not found`);
    }

    const context = { meta: { ...initialMeta }, scripts: [] };
    const html = template.render(data, context);

    return {
      html,
      meta: context.meta,
      scripts: context.scripts,
      handlers: template.getHandlers ? template.getHandlers() : new Map(),
      toString: () => html,
    };
  }

  static route(
    routePath: string,
    handler: (
      params?: Record<string, string>,
    ) => string | RenderResult | Promise<string | RenderResult>,
  ): void {
    const templatePath = routePath.replace(/:/g, '$');
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

      return content;
    });
  }

  private static getRouteParams(routePath: string): string[] {
    return routePath
      .split('/')
      .filter((part) => part.startsWith(':'))
      .map((part) => part.slice(1));
  }

  private static async handleRoute(
    path: string,
    query?: URLSearchParams,
  ): Promise<string> {
    const [routePath, params] = this.matchRoute(path);
    const routeHandler = this.routes.get(routePath);

    if (routeHandler) {
      try {
        // Merge query params into route params
        if (query && params) {
          try {
            query.forEach((value, key) => {
              params[key] = value;
            });
          } catch (e) {
            console.error('[Jigsaw] Error merging query params:', e);
          }
        } else if (query && !params) {
          console.warn(
            '[Jigsaw] Query params present but no params object for route:',
            routePath,
          );
        }

        let content = await routeHandler(params);
        let meta = {};
        let scripts: { content: string }[] = [];

        let handlers: Map<string, string> = new Map();

        if (typeof content === 'object' && content.html) {
          meta = content.meta;
          scripts = content.scripts;
          if (content.handlers) handlers = content.handlers;
          content = content.html;
        } else if (typeof content === 'string') {
          // It's just a string
        }

        let data = {};
        try {
          const root = parse(content as string);
          const dataAttr =
            root.rawAttrs && root.rawAttrs.match(/data-jigsaw="([^"]+)"/);
          if (dataAttr && dataAttr[1]) {
            data = JSON.parse(decodeURIComponent(dataAttr[1]));
          }
        } catch (e) {
          console.warn('Failed to parse data-jigsaw attribute:', e);
        }

        let finalContent = this.cleanupEmptyElements(content as string, data);

        // Inject Head Management
        finalContent = this.injectHead(finalContent, meta, scripts);

        // Inject Morphdom for HMR/View Transitions
        finalContent = this.injectMorphdom(finalContent);

        // Inject Handlers Script (CSP Safe)
        if (handlers && handlers.size > 0) {
          let handlerScriptContent =
            'window.__JIGSAW_HANDLERS = window.__JIGSAW_HANDLERS || {};\n';
          for (const [id, code] of handlers) {
            handlerScriptContent += `window.__JIGSAW_HANDLERS['${id}'] = function($event, $el, $state, $ref, $, $http, $effect) { 
                  try {
                    ${code}
                  } catch(e) { console.error("Error in handler ${id}:", e); }
                };\n`;
            handlerScriptContent += `window.__JIGSAW_HANDLERS['${id}'].__code = ${JSON.stringify(code)};\n`;
          }
          finalContent = this.injectScript(finalContent, handlerScriptContent);
        }

        if (this.appShell) {
          return this.appShell
            .replace(/<div id="jigsaw-root">[\s\S]*?<\/div>/, '<div id="jigsaw-root">' + finalContent + '</div>')
            .replace(/<title>[\s\S]*?<\/title>/, '<title>' + (meta.title || 'Jigsaw') + '</title>');
        }
        return finalContent;

      } catch (error) {
        console.error(`Error handling route ${path}:`, error);

        const errorContext: ErrorContext = {
          error: error as Error,
          templateName: routePath,
          templatePath: path,
        };

        if (error instanceof TemplateError) {
          errorContext.errorLine = error.line;
          errorContext.errorColumn = error.column;
        } else {
          const lineMatch = (error as Error).message.match(/at line (\d+)/);
          if (lineMatch) {
            errorContext.errorLine = parseInt(lineMatch[1]);
          }
        }

        let errorPage = formatErrorPage(errorContext);
        // if (process.env.NODE_ENV !== 'production') {
        //    errorPage = this.injectHMRScript(errorPage);
        // }
        return errorPage;
      }
    }
    return '404 Not Found';
  }

  private static injectHead(html: string, meta: any, scripts: any[]): string {
    let injected = html;
    let headContent = '';

    if (meta && Object.keys(meta).length > 0) {
      const metaTags = Object.entries(meta)
        .map(([key, value]) => {
          // Handle link tags: link: { rel: 'stylesheet', href: '...' }
          if (key === 'link') {
            if (Array.isArray(value)) {
              return value
                .map((link) => {
                  const attrs = Object.entries(link)
                    .map(([k, v]) => `${k}="${v}"`)
                    .join(' ');
                  return `<link ${attrs}>`;
                })
                .join('\n');
            } else if (typeof value === 'object' && value !== null) {
              const attrs = Object.entries(value)
                .map(([k, v]) => `${k}="${v}"`)
                .join(' ');
              return `<link ${attrs}>`;
            }
            return '';
          }

          // Handle title specifically
          if (key === 'title') {
            return `<title>${value}</title>`;
          }

          return `<meta name="${key}" content="${value}">`;
        })
        .join('\n');
      headContent += metaTags + '\n';
    }

    if (scripts && scripts.length > 0) {
      const scriptTags = scripts
        .map((s) => {
          return `<script ${s.content}></script>`;
        })
        .join('\n');

      if (injected.includes('</body>')) {
        injected = injected.replace('</body>', `${scriptTags}\n</body>`);
      } else {
        injected += scriptTags;
      }
    }

    // Replace the FIRST marker with <head>
    if (injected.includes('<!-- JIGSAW_META_HEAD -->')) {
      injected = injected.replace(
        '<!-- JIGSAW_META_HEAD -->',
        `<head>\n${headContent}</head>`,
      );
      // Remove any subsequent markers
      injected = injected.replace(/<!-- JIGSAW_META_HEAD -->/g, '');
    } else {
      // Fallback: inject into existing head or title
      if (injected.includes('</head>')) {
        injected = injected.replace('</head>', `${headContent}\n</head>`);
      } else if (injected.includes('<title>')) {
        injected = injected.replace('<title>', `${headContent}\n<title>`);
      }
    }

    return injected;
  }

  private static matchRoute(path: string): [string, Record<string, string>] {
    if (this.parentRoutes.has(path)) return [path, {}];
    for (const [routePath, handler] of this.routes) {
      const routeParts = routePath.split('/');
      const pathParts = path.split('/');
      if (routeParts.length === pathParts.length) {
        const params: Record<string, string> = {};
        let match = true;
        for (let i = 0; i < routeParts.length; i++) {
          if (routeParts[i].startsWith(':')) {
            params[routeParts[i].slice(1)] = pathParts[i];
          } else if (routeParts[i] !== pathParts[i]) {
            match = false;
            break;
          }
        }
        if (match) return [routePath, params];
      }
    }
    return ['', {}];
  }

  private static apiRoutes: Map<
    string,
    (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      params: Record<string, string>,
    ) => void
  > = new Map();

  static api(
    routePath: string,
    handler: (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      params: Record<string, string>,
    ) => void,
  ): void {
    this.apiRoutes.set(routePath, handler);
  }

  
  static generateAppShell(initialHtml: string = '', meta: any = {}, scripts: any[] = []): string {
    const context = { meta, scripts };
    // We use layout.jig as the base shell if it exists
    try {
      const shell = this.render('layout', { content: initialHtml }, meta);
      return shell.html;
    } catch (e) {
      // Fallback basic shell if layout fails
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${meta.title || 'Jigsaw App'}</title>
</head>
<body>
  <div id="jigsaw-root">${initialHtml}</div>
  <script src="/static/jigsaw-router.js"></script>
</body>
</html>`;
    }
  }

  static serve({ port }: JigSawConfig): void {
    this.config.port = port;
    this.loadTemplates();
    this.loadComponents();
    this.startWatcher();

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      let pathname = url.pathname || '/';

      // Check API Routes
      for (const [routePath, handler] of this.apiRoutes) {
        const [matchedPath, params] = this.matchRoutePattern(
          routePath,
          pathname,
        );
        if (matchedPath) {
          handler(req, res, params);
          return;
        }
      }

      const staticFilePath = path.join(process.cwd(), 'public', pathname);
      if (
        fs.existsSync(staticFilePath) &&
        fs.statSync(staticFilePath).isFile()
      ) {
        const ext = path.extname(staticFilePath);
        const contentType = this.getContentType(ext);
        const cacheControl =
          process.env.NODE_ENV === 'production'
            ? 'public, max-age=31536000' // 1 year for prod
            : 'no-cache'; // Disable cache for dev

        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
        });
        fs.createReadStream(staticFilePath).pipe(res);
        return;
      }

      const content = await this.handleRoute(pathname, url.searchParams);
      const statusCode =
        content.startsWith('4') ||
        (content.startsWith('5') && !content.includes('<html'))
          ? parseInt(content.slice(0, 3))
          : 200;

      res.writeHead(statusCode, {
        'Content-Type': 'text/html',
        'Transfer-Encoding': 'chunked', // Enable streaming
      });

      // Stream the response in chunks for better TTFB
      const chunkSize = 16384; // 16KB chunks
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize);
        res.write(chunk);
      }

      res.end();
    });

    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws) => {
      // console.log('Client connected to HMR');
    });

    server.listen(this.config.port, '0.0.0.0', () => {
      console.log(`Server running at http://0.0.0.0:${this.config.port}/`);
      console.log(`HMR Active`);
    });
  }

  static async build(
    outputDir: string = 'dist',
    options: {
      ignore?: string[];
      staticPaths?: Record<string, Record<string, string>[]>;
    } = {},
  ): Promise<void> {
    const distPath = path.resolve(process.cwd(), outputDir);
    console.log(`Building to ${distPath}...`);

    // 1. Clean/Create dist
    if (fs.existsSync(distPath)) {
      fs.rmSync(distPath, { recursive: true, force: true });
    }
    fs.mkdirSync(distPath, { recursive: true });

    // Load Resources
    this.loadTemplates();
    this.loadComponents();

    // 2. Copy Public Dir
    if (fs.existsSync(this.publicDir)) {
      console.log('Copying static assets...');
      this.copyDir(this.publicDir, path.join(distPath, 'static'));
    }

    // 3. Render Routes
    console.log('Rendering routes...');
    let hasErrors = false;
    for (const [routePath, handler] of this.routes) {
      // Check Ignore List
      if (options.ignore && options.ignore.includes(routePath)) {
        console.log(`Skipping ignored route: ${routePath}`);
        continue;
      }

      // Handle Dynamic Routes
      if (routePath.includes(':')) {
        if (options.staticPaths && options.staticPaths[routePath]) {
          console.log(
            `Rendering dynamic route: ${routePath} with ${options.staticPaths[routePath].length} paths`,
          );
          for (const params of options.staticPaths[routePath]) {
            // Construct actual path for file saving
            let actualPath = routePath;
            for (const [key, value] of Object.entries(params)) {
              actualPath = actualPath.replace(`:${key}`, value);
            }
            if (!await this.renderAndSaveRoute(routePath, handler, distPath, actualPath, params)) hasErrors = true;
          }
        } else {
          console.warn(
            `Skipping dynamic route: ${routePath} (No static paths provided)`,
          );
        }
        continue;
      }

      // Handle Static Routes
      if (!await this.renderAndSaveRoute(routePath, handler, distPath, routePath)) hasErrors = true;
    }
    if (hasErrors) throw new Error("Build failed: One or more routes failed to render.");
    console.log('Build complete!');
  }

  private static async renderAndSaveRoute(
    routePath: string,
    handler: Function,
    distPath: string,
    savePath: string,
    params: Record<string, string> = {},
  ): Promise<boolean> {
    try {
      console.log('Rendering ' + savePath + '...');
      let content = await handler(params);
      let meta = {};
      let scripts: { content: string }[] = [];

      if (typeof content === 'object' && content.html) {
        meta = content.meta;
        scripts = content.scripts;
        content = content.html;
      }

      let data = {};
      try {
        const root = parse(content as string);
        const dataAttr =
          root.rawAttrs && root.rawAttrs.match(/data-jigsaw="([^"]+)"/);
        if (dataAttr && dataAttr[1]) {
          data = JSON.parse(decodeURIComponent(dataAttr[1]));
        }
      } catch (e) {
        console.warn('Failed to parse data-jigsaw attribute:', e);
      }

      let finalContent = this.cleanupEmptyElements(content as string, data);
      finalContent = this.injectHead(finalContent, meta, scripts);

      const fileName =
        savePath === '/'
          ? 'index.html'
          : savePath.replace(/^\//, '') + '/index.html';
      const filePath = path.join(distPath, fileName);
      const fileDir = path.dirname(filePath);

      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      fs.writeFileSync(filePath, finalContent);
      return true;
    } catch (e) {
      console.error('Error rendering route ' + savePath + ':', e);
      return false;
    }
  }

  private static copyDir(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private static matchRoutePattern(
    routePath: string,
    path: string,
  ): [string, Record<string, string>] {
    const routeParts = routePath.split('/');
    const pathParts = path.split('/');
    if (routeParts.length === pathParts.length) {
      const params: Record<string, string> = {};
      let match = true;
      for (let i = 0; i < routeParts.length; i++) {
        if (routeParts[i].startsWith(':')) {
          params[routeParts[i].slice(1)] = pathParts[i];
        } else if (routeParts[i] !== pathParts[i]) {
          match = false;
          break;
        }
      }
      if (match) return [routePath, params];
    }
    return ['', {}];
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
    if (!fs.existsSync(this.componentsDir)) return;
    const files = fs.readdirSync(this.componentsDir);
    files.forEach((file) => {
      if (file.endsWith('.jig')) {
        const componentName = file.startsWith('_') ? file.slice(1, -4) : file.slice(0, -4);
        const content = fs.readFileSync(
          path.join(this.componentsDir, file),
          'utf-8',
        );
        this.components.set(componentName, content);
      }
    });
  }

  static getComponent(name: string): string {
    return this.components.get(name) || '';
  }

  static startWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
    }

    const watchPaths = [this.templatesDir, this.componentsDir, this.publicDir];

    this.watcher = chokidar.watch(watchPaths, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher
      .on('add', (path) => this.handleFileChange(path, 'added'))
      .on('change', (path) => this.handleFileChange(path, 'changed'))
      .on('unlink', (path) => this.handleFileChange(path, 'removed'));
  }

  private static astCache: Map<string, any> = new Map();

  private static async handleFileChange(
    filePath: string,
    changeType: 'added' | 'changed' | 'removed',
  ): Promise<void> {
    const ext = path.extname(filePath);

    if (ext === '.jig') {
      const isComponent = filePath.includes(this.componentsDir);
      const name = isComponent
        ? this.getComponentNameFromPath(filePath)
        : this.getTemplateNameFromPath(filePath);

      if (changeType === 'removed') {
        isComponent
          ? this.components.delete(name)
          : this.templates.delete(name);
        this.astCache.delete(filePath);
        this.broadcastHMR({ type: 'reload' });
        return;
      }

      // Load new content
      const content = fs.readFileSync(filePath, 'utf-8');

      // Create temporary Knob to get AST
      const newKnob = new Knob(content, name);
      let newAST;
      try {
        newAST = newKnob.getAST();
      } catch (e) {
        console.error(`[HMR] Parse error in ${name}:`, e);
        return; // Don't reload if syntax error
      }

      // Diff against cached AST
      const oldAST = this.astCache.get(filePath);
      let hmrMessage: { type: string; islands?: string[] };

      if (!oldAST) {
        hmrMessage = { type: 'reload' };
      } else {
        const { diffJigsawAST } = await import('./differ');
        hmrMessage = diffJigsawAST(oldAST, newAST);
      }

      // Update caches
      this.astCache.set(filePath, newAST);
      isComponent
        ? this.components.set(name, content)
        : this.templates.set(name, newKnob);

      this.clearCache();
      Knob.clearCache();

      this.broadcastHMR(hmrMessage);
      return;
    }

    if (ext === '.css') {
      this.broadcastHMR({ type: 'css-update', file: path.basename(filePath) });
    }
  }

  private static broadcastHMR(message: object): void {
    if (!this.wss) return;

    const data = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  private static injectHMRScript(html: string): string {
    const script = `
    <script>
    (function() {
      console.log("[Jigsaw] HMR Active");
      const socket = new WebSocket('ws://' + window.location.host);
      
      socket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if (data.type === 'css-update') {
          const links = document.querySelectorAll('link[rel="stylesheet"]');
          links.forEach(link => {
            const url = new URL(link.href);
            url.searchParams.set('t', Date.now());
            link.href = url.toString();
          });
          console.log("[Jigsaw] CSS Reloaded");
        } 
        else if (data.type === 'content-update') {
          console.log("[Jigsaw] Template changed, reloading...");
          if (typeof navigate === 'function') {
             navigate(window.location.href); 
          } else {
             window.location.reload();
          }
        }
      };
      
      socket.onclose = function() { console.log("[Jigsaw] HMR Disconnected"); };
    })();
    </script>
    `;

    if (html.includes('</body>')) {
      return html.replace('</body>', `${script}</body>`);
    } else {
      return html + script;
    }
  }

  private static injectScript(html: string, scriptContent: string): string {
    const scriptTag = `<script>${scriptContent}</script>`;
    if (html.includes('</body>')) {
      return html.replace('</body>', `${scriptTag}\\n</body>`);
    } else {
      return html + scriptTag;
    }
  }

  private static injectMorphdom(html: string): string {
    // Only inject morphdom in development mode for HMR
    if (process.env.NODE_ENV === 'production') {
      return html;
    }

    const script = '<script src="/static/morphdom.js" defer></script>';
    if (html.includes('</body>')) {
      return html.replace('</body>', `${script}\n</body>`);
    } else {
      return html + script;
    }
  }

  private static getComponentNameFromPath(filePath: string): string {
    return path.basename(filePath, '.jig');
  }
  private static getTemplateNameFromPath(filePath: string): string {
    return path.basename(filePath, '.jig');
  }
  private static loadComponent(path: string): void {
    const componentName = this.getComponentNameFromPath(path);
    const content = fs.readFileSync(path, 'utf-8');
    this.components.set(componentName, content);
  }
  private static loadTemplate(path: string): void {
    const templateName = this.getTemplateNameFromPath(path);
    const content = fs.readFileSync(path, 'utf-8');
    this.templates.set(templateName, new Knob(content, templateName));
  }
  private static loadTemplates(): void {
    if (!fs.existsSync(this.templatesDir)) return;
    const files = fs.readdirSync(this.templatesDir);
    files.forEach((file) => {
      if (file.endsWith('.jig')) {
        this.loadTemplate(path.join(this.templatesDir, file));
      }
    });
  }
  private static getCacheKey(
    routePath: string,
    params?: Record<string, string>,
  ): string {
    if (!params) return routePath;
    return `${routePath}?${Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join('&')}`;
  }
  private static isCacheExpired(cachedRoute: CachedRoute): boolean {
    return Date.now() - cachedRoute.lastUpdated > 5 * 60 * 1000;
  }
  private static clearCache(): void {
    this.routeCache.clear();
  }

  private static processHtml(html: string, data?: TemplateData): string {
    return this.cleanupEmptyElements(html, data);
  }

  private static cleanupEmptyElements(
    html: string,
    data?: TemplateData,
  ): string {
    return html;
  }
}

export default JigSaw;
