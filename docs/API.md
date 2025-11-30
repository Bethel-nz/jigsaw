# Jigsaw API Reference

Complete API documentation for the Jigsaw template engine.

---

## Table of Contents

- [JigSaw Class](#jigsaw-class)
- [Template Methods](#template-methods)
- [Routing Methods](#routing-methods)
- [Configuration](#configuration)
- [Pipes](#pipes)
- [RenderResult](#renderresult)

---

## JigSaw Class

The main orchestrator for the Jigsaw template engine. Manages templates, components, routes, and the HTTP server.

### Static Methods

#### `JigSaw.template(name: string | string[]): void`

Load one or more templates from the `templates/` directory.

**Parameters:**
- `name` - Template name(s) without extension (`.jig`)

**Example:**
```typescript
// Load single template
JigSaw.template('home');

// Load multiple templates
JigSaw.template(['home', 'about', 'contact']);
```

**File Resolution:**
- Looks for `templates/{name}.jig`
- If not found, creates empty template with warning

---

#### `JigSaw.render(name: string, data: TemplateData): RenderResult`

Render a template with provided data.

**Parameters:**
- `name` - Template name
- `data` - Object containing template variables

**Returns:** `RenderResult` object

**Example:**
```typescript
const result = JigSaw.render('home', {
  title: 'Welcome',
  user: { name: 'Alice' },
  posts: [{ id: 1, title: 'First Post' }]
});

console.log(result.html);
console.log(result.meta.title);
```

**Throws:** Error if template not found

---

#### `JigSaw.route(path: string, handler: RouteHandler): void`

Define a route and its rendering logic.

**Parameters:**
- `path` - Route path (supports `:param` syntax)
- `handler` - Function returning template name or RenderResult

**Example:**
```typescript
// Static route
JigSaw.route('/', () => 'home');

// Dynamic route
JigSaw.route('/blog/:id', (params) => {
  const post = getPost(params.id);
  return JigSaw.render('post', { post });
});

// Async handler
JigSaw.route('/user/:id', async (params) => {
  const user = await fetchUser(params.id);
  return JigSaw.render('profile', { user });
});
```

**Route Parameters:**
- Use `:paramName` for dynamic segments
- Access via `params` object in handler
- Supports multiple parameters: `/blog/:year/:month/:slug`

**Caching:**
- Routes cached for 5 minutes (TTL)
- Cache key includes all parameter values
- Parent routes (no params) always cached

---

#### `JigSaw.api(path: string, handler: ApiHandler): void`

Define an API route (returns JSON, not HTML).

**Parameters:**
- `path` - API route path
- `handler` - Function with `(req, res, params)` signature

**Example:**
```typescript
JigSaw.api('/api/posts', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ posts: getAllPosts() }));
});

JigSaw.api('/api/posts/:id', (req, res, params) => {
  const post = getPost(params.id);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ post }));
});
```

---

#### `JigSaw.definePipe(name: string, fn: Function): void`

Register a custom pipe for template transformations.

**Parameters:**
- `name` - Pipe name (used in templates)
- `fn` - Transformation function

**Example:**
```typescript
// Simple pipe
JigSaw.definePipe('upper', (str: string) => str.toUpperCase());

// Pipe with arguments
JigSaw.definePipe('truncate', (str: string, length: number) => {
  return str.length > length ? str.slice(0, length) + '...' : str;
});

// Multi-argument pipe
JigSaw.definePipe('replace', (str: string, search: string, replace: string) => {
  return str.replace(new RegExp(search, 'g'), replace);
});
```

**Template Usage:**
```html
{{ name | upper }}
{{ description | truncate: 100 }}
{{ text | replace: 'old': 'new' }}
```

**Built-in Pipes:**
- `safe` - Bypass HTML escaping (⚠️ use with trusted content only)

---

#### `JigSaw.serve(config: JigSawConfig): void`

Start the HTTP server with Hot Module Replacement (HMR).

**Parameters:**
```typescript
interface JigSawConfig {
  port: number;
}
```

**Example:**
```typescript
JigSaw.serve({ port: 3000 });
// Server running at http://localhost:3000/
// HMR Active
```

**Features:**
- Automatic template reloading
- Component hot-swapping
- CSS live updates
- WebSocket-based HMR
- Static file serving from `public/`

---

## Template Data

### TemplateData

Object passed to templates containing variables.

**Type:**
```typescript
type TemplateData = Record<string, any>;
```

**Example:**
```typescript
const data: TemplateData = {
  title: 'My Page',
  user: {
    name: 'Alice',
    email: 'alice@example.com'
  },
  items: [1, 2, 3],
  showBanner: true
};
```

---

## RenderResult

Object returned by `JigSaw.render()`.

**Type:**
```typescript
interface RenderResult {
  html: string;
  meta: Record<string, any>;
  scripts: string[];
  toString(): string;
}
```

**Properties:**
- `html` - Rendered HTML string
- `meta` - Metadata collected from `@meta` directives
- `scripts` - Script tags collected from `@script` directives
- `toString()` - Returns `html` (for direct usage)

**Example:**
```typescript
const result = JigSaw.render('page', data);

console.log(result.html);           // <div>...</div>
console.log(result.meta.title);     // "Page Title"
console.log(result.scripts);        // ["<script src='/app.js'>"]
console.log(`${result}`);           // Calls toString(), returns html
```

**Composition:**
```typescript
// Compose multiple templates
const header = JigSaw.render('header', { user });
const content = JigSaw.render('content', { posts });
const layout = JigSaw.render('layout', { header, content });

// Meta and scripts merge automatically
console.log(layout.meta);    // Combined from all templates
console.log(layout.scripts); // Combined from all templates
```

---

## Route Handlers

### RouteHandler

Function signature for route handlers.

**Type:**
```typescript
type RouteHandler = (
  params?: Record<string, string>
) => string | RenderResult | Promise<string | RenderResult>;
```

**Return Values:**
- `string` - Template name (rendered with empty data)
- `RenderResult` - Pre-rendered template
- `Promise<...>` - Async version of above

**Examples:**
```typescript
// Return template name
JigSaw.route('/', () => 'home');

// Return RenderResult
JigSaw.route('/about', () => JigSaw.render('about', { team }));

// Async with database
JigSaw.route('/blog/:slug', async (params) => {
  const post = await db.posts.findOne({ slug: params.slug });
  return JigSaw.render('post', { post });
});
```

---

### ApiHandler

Function signature for API route handlers.

**Type:**
```typescript
type ApiHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params?: Record<string, string>
) => void;
```

**Example:**
```typescript
JigSaw.api('/api/data', (req, res) => {
  if (req.method === 'POST') {
    // Handle POST
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
  }
});
```

---

## Configuration

### Directory Structure

```
project/
├── templates/        # Template files (.jig)
├── components/       # Component files (.jig)
├── public/          # Static assets
│   └── static/      # CSS, JS, images
└── index.ts         # Application entry point
```

**Configurable Paths:**
Currently using `process.cwd()` as base. Directories:
- Templates: `templates/`
- Components: `components/`
- Public: `public/`

---

## Advanced Features

### Hot Module Replacement (HMR)

Automatically enabled in development. Features:

**Template Updates:**
- Save `.jig` file → Browser reloads automatically
- No manual refresh needed

**CSS Updates:**
- Save CSS file → Injected without page reload
- Maintains page state

**Component Updates:**
- Save component → All instances update
- Islands persist across updates

**WebSocket Connection:**
```javascript
// Auto-injected in development
const ws = new WebSocket('ws://localhost:${port}');
ws.onmessage = (event) => {
  const { type, path } = JSON.parse(event.data);
  if (type === 'css-update') updateCSS(path);
  if (type === 'template-update') location.reload();
};
```

---

### Caching

**Template Compilation Cache:**
- Compiled templates cached in memory
- Cleared on file change (HMR)
- Clear manually: `Knob.clearCache()`

**Route Cache:**
- 5-minute TTL
- Per-route + params
- Parent routes cached permanently

---

## Error Handling

All template errors throw `TemplateError` with:

**Properties:**
- `message` - Error description
- `line` - Line number
- `column` - Column number
- `templateName` - Template file name
- `templateSource` - Full template source

**Methods:**
- `format()` - Returns formatted error with visual context

**Example Error:**
```
Expected token type IDENTIFIER, but got DOT ('.')
  at home.jig:12:15

  11 | <div>{{ user.name }}</div>
  12 | <div>{{ user..email }}</div>
      |               ^
  13 | </div>
```

**Catching Errors:**
```typescript
try {
  const result = JigSaw.render('template', data);
} catch (error) {
  if (error instanceof TemplateError) {
    console.error(error.format());
  }
}
```

---

## Examples

### Complete Application

```typescript
import JigSaw from './src/jigsaw';

// Define pipes
JigSaw.definePipe('date', (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString();
});

// Load templates
JigSaw.template(['layout', 'home', 'post']);

// Define routes
JigSaw.route('/', () => {
  return JigSaw.render('home', {
    posts: getAllPosts(),
    featured: getFeaturedPost()
  });
});

JigSaw.route('/blog/:slug', (params) => {
  const post = getPost(params.slug);
  return JigSaw.render('post', { post });
});

// API routes
JigSaw.api('/api/posts', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ posts: getAllPosts() }));
});

// Start server
JigSaw.serve({ port: 3000 });
```

---

## Type Definitions

```typescript
// Main types
type TemplateData = Record<string, any>;

interface RenderResult {
  html: string;
  meta: Record<string, any>;
  scripts: string[];
  toString(): string;
}

type RouteHandler = (
  params?: Record<string, string>
) => string | RenderResult | Promise<string | RenderResult>;

type ApiHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params?: Record<string, string>
) => void;

interface JigSawConfig {
  port: number;
}
```
