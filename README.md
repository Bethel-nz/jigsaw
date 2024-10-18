# JigSaw Templating Engine

JigSaw is a lightweight templating engine for Node.js applications, written in TypeScript. It provides an easy way to create dynamic HTML content with support for partials, control structures, and component-like rendering.

## Getting Started

### Prerequisites

- Node.js (version 12 or higher)
- Bun (for package management and running the project)

### Installation

```bash
git clone https://github.com/Bethel-nz/jigsaw.git
cd jigsaw-templating-engine
bun i
```

### Basic Usage

1. **Start the server**

   ```bash
   bun run dev
   ```

2. **Register Templates and Routes**

   ```typescript
   // Register templates
   JigSaw.registerTemplate(['index', 'profile']);

   // Register a route
   JigSaw.registerRoute('/profile/:id', async (params) => {
     const data = await fetchUserData(params!.id);
     return JigSaw.render('profile', data);
   });

   // Configure and start the server
   JigSaw.configure({ port: 8750 });
   JigSaw.serve();
   ```

## Template Syntax

- **Variable Interpolation:** `{{ variableName }}`
- **Components:** `{{{ componentName }}}`
- **Control Structures:**
  - If/Else: `{% if condition %} ... {% else %} ... {% endif %}`
  - For Loops: `{% for item in items %} ... {% endfor %}`

### Example Template

```html
<div class="profile">
  {{{ profileImage }}}
  <h1>{{ name }}</h1>
  {% if bio %}
  <p>{{ bio }}</p>
  {% endif %}
</div>
```

## Components

Components are reusable template snippets. Example:

```html
<!-- components/_profileImage.jig -->
<img src="{{ src }}" alt="{{ alt }}" class="{{ class }}" />
```

## Advanced Features

- **Component-like Rendering:** Support for rendering complex UI elements
- **Special Types:** Built-in types for links and headers
- **TypeScript Support:** Provides type safety and autocomplete
- **Development Mode:** Includes hot reloading for templates and components
- **Static File Serving:** Automatically serves static files from the `static` directory

## File Structure

- `templates/`: Main template files
- `components/`: Reusable component files
- `static/`: Static assets (CSS, JavaScript, images)

## API Reference

For detailed API information, refer to the source code in the `src` directory.

## Examples

Check the `templates` directory for sample projects demonstrating JigSaw's capabilities.

![sample site made with jigsaw](./image.png)

## Note

This implementation of JigSaw is primarily for learning purposes. For production use, additional testing, error handling, and optimizations are recommended.
