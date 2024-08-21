import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

type TemplateData = Record<string, any>;
interface JigSawConfig {
  generateNavigation?: boolean;
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
  private readonly compiledTemplate: (data: TemplateData) => string;

  constructor(template: string) {
    this.template = template;
    this.compiledTemplate = this.compile();
  }

  private compile(): (data: TemplateData) => string {
    const regex = /{{{\s*(.*?)\s*}}}|\{%\s*(.*?)\s*%\}|{{\s*(.*?)\s*}}/g;
    const segments: (string | ((data: TemplateData) => string))[] = [];

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(this.template)) !== null) {
      segments.push(this.template.slice(lastIndex, match.index));

      if (match[1]) {
        // Handle partials
        segments.push(this.createPartialGetter(match[1].trim()));
      } else if (match[2]) {
        // Handle control structures (if, for)
        segments.push(this.createControlStructure(match[2].trim()));
      } else if (match[3]) {
        // Handle variable interpolation
        segments.push(this.createValueGetter(match[3].trim()));
      }

      lastIndex = regex.lastIndex;
    }

    segments.push(this.template.slice(lastIndex));

    return (data: TemplateData) =>
      segments
        .map((segment) =>
          typeof segment === 'function' ? segment(data) : segment
        )
        .join('');
  }

  private createValueGetter(path: string): (data: TemplateData) => string {
    const keys = path.split('.');
    return (data: TemplateData) => {
      let value: any = data;
      for (const key of keys) {
        if (value === undefined || value === null) return '';
        value = value[key];
      }
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
    };
  }

  private createPartialGetter(
    partialName: string
  ): (data: TemplateData) => string {
    return (data: TemplateData) => {
      const partialData = data[partialName];
      if (typeof partialData === 'object' && partialData !== null) {
        if (partialData.type === 'link') {
          return this.renderLink(partialData as LinkDefinition);
        } else if (partialData.type === 'header') {
          return this.renderHeader(partialData as HeaderDefinition);
        } else if ('tag' in partialData) {
          return this.renderComponent(partialData as ComponentDefinition);
        }
        return JSON.stringify(partialData);
      }
      const partial = JigSaw.getPartial(partialName);
      return partial ? partial.render(data) : String(partialData);
    };
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

  private createControlStructure(
    structure: string
  ): (data: TemplateData) => string {
    const [keyword, ...rest] = structure.split(' ');
    const condition = rest.join(' ');

    if (keyword === 'if') {
      return (data: TemplateData) => {
        const result = this.evaluateCondition(condition, data);
        return result ? '' : ''; // Placeholder for if implementation
      };
    } else if (keyword === 'for') {
      const [item, , collection] = condition.split(' ');
      return (data: TemplateData) => {
        const items = this.getValueFromData(collection, data);
        if (!Array.isArray(items)) return '';
        return items
          .map((itemData) => {
            const newData = { ...data, [item]: itemData };
            return ''; // Placeholder for for loop implementation
          })
          .join('');
      };
    }

    return () => '';
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

  render(data: TemplateData): string {
    return this.compiledTemplate(data);
  }
}

class JigSaw {
  private static templates: Map<string, Knob> = new Map();
  private static partials: Map<string, Knob> = new Map();
  private static routes: Map<
    string,
    (params: Record<string, string>) => string
  > = new Map();
  private static headContent: Map<string, string> = new Map();

  private static config: JigSawConfig = {
    generateNavigation: true, // Default value
  };

  static configure(newConfig: JigSawConfig): void {
    this.config = { ...this.config, ...newConfig };
  }

  static registerTemplate(nameOrPath: string, content?: string): void {
    let template: Knob;
    if (content) {
      template = new Knob(content);
    } else {
      const fullPath = path.resolve(nameOrPath);
      const name = path.basename(fullPath, path.extname(fullPath));
      const fileContent = fs.readFileSync(fullPath, 'utf-8');
      template = new Knob(fileContent);
      nameOrPath = name;
    }
    this.templates.set(nameOrPath, template);
  }

  static registerPartial(name: string, templateString: string): void {
    this.partials.set(name, new Knob(templateString));
  }

  static getPartial(name: string): Knob | undefined {
    return this.partials.get(name);
  }

  static render(name: string, data: TemplateData): string {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template "${name}" not found`);
    }
    return template.render(data);
  }

  static renderString(templateString: string, data: TemplateData): string {
    const template = new Knob(templateString);
    return template.render(data);
  }

  static setHead(route: string, headContent: string): void {
    if (!this.routes.has(route)) {
      throw new Error(`Route "${route}" is not registered`);
    }
    this.headContent.set(route, headContent);
  }

  static registerRoute(
    path: string,
    handler: (params: Record<string, string>) => string
  ): void {
    this.routes.set(path, (params) => {
      const content = handler(params);
      const head = this.headContent.get(path) || '';
      const navigation = this.config.generateNavigation
        ? this.generateNavigation()
        : '';
      return `<!DOCTYPE html>
<html>
  <head>
    ${head}
  </head>
  <body>
    ${navigation}
    ${content}
  </body>
</html>`;
    });
  }

  static handleRoute(path: string): string {
    const routeHandler = this.routes.get(path);
    if (routeHandler) {
      return routeHandler({}); // Simplification: not parsing route params
    }
    return '404 Not Found';
  }

  private static generateNavigation(): string {
    if (!this.config.generateNavigation) {
      return ''; // Return empty string if navigation is disabled
    }

    const navItems = Array.from(this.routes.keys())
      .map(
        (route) =>
          `<li><a href="${route}">${
            route === '/' ? 'Home' : route.slice(1)
          }</a></li>`
      )
      .join('');

    return `
    <nav>
      <ul>
        ${navItems}
      </ul>
    </nav>
  `;
  }

  static startServer(port: number = 3000) {
    const staticDir = path.join(process.cwd(), 'static');

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const pathname = url.pathname;

      // Check if the request is for a static file
      const staticFilePath = path.join(staticDir, pathname);
      if (
        fs.existsSync(staticFilePath) &&
        fs.statSync(staticFilePath).isFile()
      ) {
        const ext = path.extname(staticFilePath);
        let contentType = 'text/plain';

        switch (ext) {
          case '.html':
            contentType = 'text/html';
            break;
          case '.css':
            contentType = 'text/css';
            break;
          case '.js':
            contentType = 'text/javascript';
            break;
          case '.json':
            contentType = 'application/json';
            break;
          case '.png':
            contentType = 'image/png';
            break;
          case '.jpg':
          case '.jpeg':
            contentType = 'image/jpeg';
            break;
        }

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(staticFilePath).pipe(res);
        return;
      }

      // Handle dynamic routes
      const route = this.routes.get(pathname);
      if (route) {
        const params = {}; // You might want to parse query parameters here
        const content = route(params);
        const headContent = this.headContent.get(pathname) || '';
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          `<html><head>${headContent}</head><body>${content}</body></html>`
        );
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      }
    });

    server.listen(port, () => {
      console.log(`Server running at http://localhost:${port}/`);
    });
  }
}
JigSaw.configure({
  generateNavigation: true,
});

// Example usage
JigSaw.registerTemplate(
  'profile',
  `
<div class="profile">
  {{ profileImage }}
  {{ headerName }}
  {% if bio %}
    <p>{{ bio }}</p>
  {% endif %}
  {{ socialLinks }}
  {{ githubLink }}
</div>
`
);

JigSaw.registerTemplate('./templates/home.html'); // Assuming this file exists

JigSaw.registerRoute('/profile', (params) => {
  const data = {
    userData: {
      name: 'John Doe',
    },
    bio: 'Web developer and TypeScript enthusiast',
    profileImage: {
      tag: 'img',
      props: {
        src: 'https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?q=80&w=1856&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
        alt: 'user image',
        class: 'profile-image',
        style: 'width:200px',
      },
    },
    headerName: {
      type: 'header',
      level: 1,
      text: 'John Doe',
      id: 'profile-name',
    },
    socialLinks: {
      tag: 'div',
      props: { class: 'social-links' },
      children: [
        {
          tag: 'a',
          props: { href: 'https://twitter.com/johndoe' },
          content: 'Twitter',
        },
        {
          tag: 'a',
          props: { href: 'https://github.com/johndoe' },
          content: 'GitHub',
        },
      ],
    },
    githubLink: {
      type: 'link',
      href: 'https://github.com/johndoe',
      text: 'Check out my GitHub',
      title: "John Doe's GitHub Profile",
    },
  };
  return JigSaw.render('profile', data);
});

JigSaw.setHead(
  '/profile',
  `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>User Profile</title>
  <link rel="stylesheet" href="/styles/profile.css">
`
);

JigSaw.registerRoute('/', (params) => {
  return JigSaw.render('home', { title: 'Welcome' });
});

// Start the server
JigSaw.startServer();
