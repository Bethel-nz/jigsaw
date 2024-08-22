# JigSaw Templating Engine Documentation

JigSaw is a powerful, flexible templating engine for Node.js applications, written in TypeScript. It provides a straightforward approach to creating dynamic HTML content, complete with support for partials, control structures, and component-like rendering.

## Key Features

- **Dynamic Template Rendering**: Easily create dynamic HTML pages with variable interpolation and control structures.
- **Support for Partials**: Break down your templates into smaller, reusable components.
- **Control Structures**: Use familiar `if/else` and `for` loop constructs to add logic to your templates.
- **Component-like Rendering**: Define complex components with nested elements and props, similar to how you might use JSX.
- **Built-in Static File Serving**: Serve static assets directly from a designated directory.
- **Automatic Navigation Generation**: Automatically generate navigation menus based on your registered routes.
- **TypeScript Support**: Leverage TypeScript's static typing to catch errors early and improve code quality.

## Getting Started

### Prerequisites

- **Node.js** (version 12 or higher)
- **Git**

### Installation

To get started with JigSaw, first clone the repository to your local machine:

```bash
git clone https://github.com/Bethel-nz/jigsaw.git
cd jigsaw-templating-engine
```

Then, install the required dependencies:

```bash
npm install
```

### Usage

1. **Import JigSaw into Your Project:**

   ```typescript
   import { JigSaw } from './path/to/jigsaw';
   ```

2. **Register a Template:**

   You can register templates either from a file or directly as a string:

   ```typescript
   // Using a file
   JigSaw.registerTemplate('./templates/home.html');

   // Using a string
   JigSaw.registerTemplate(
     'profile',
     `
     <div class="profile">
       {{ profileImage }}
       <h1>{{ name }}</h1>
       {% if bio %}
         <p>{{ bio }}</p>
       {% endif %}
     </div>
   `
   );
   ```

3. **Register a Route:**

   Routes are registered with a path and a handler function:

   ```typescript
   JigSaw.registerRoute('/profile', (params) => {
     const data = {
       name: 'John Doe',
       bio: 'Web developer',
       profileImage: {
         tag: 'img',
         props: {
           src: '/images/john-doe.jpg',
           alt: 'John Doe',
         },
       },
     };
     return JigSaw.render('profile', data);
   });
   ```

4. **Start the Server:**

   To start the server, simply call:

   ```typescript
   JigSaw.startServer(3000); // Or any other port
   ```

## Template Syntax

JigSaw's template syntax is designed to be intuitive and flexible:

- **Variable Interpolation:** `{{ variableName }}`
- **Partials:** `{{{ partialName }}}`
- **Control Structures:**
  - **If/Else:** `{% if condition %} ... {% else %} ... {% endif %}`
  - **For Loops:** `{% for item in items %} ... {% endfor %}`

### Example Template

Here's a simple example to illustrate the syntax:

```html
<div class="profile">
  {{ profileImage }}
  <h1>{{ name }}</h1>
  {% if bio %}
  <p>{{ bio }}</p>
  {% endif %}
</div>
```

## Advanced Features

### Component-like Rendering

JigSaw supports rendering component-like structures, which can be used to build complex UI elements:

```typescript
const data = {
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
};
```

### Special Types

JigSaw includes special types for links and headers:

```typescript
const data = {
  githubLink: {
    type: 'link',
    href: 'https://github.com/johndoe',
    text: 'Check out my GitHub',
    title: "John Doe's GitHub Profile",
  },
  headerName: {
    type: 'header',
    level: 1,
    text: 'John Doe',
    id: 'profile-name',
  },
};
```

### Custom Head Content

You can define custom head content for each route:

```typescript
JigSaw.setHead(
  '/profile',
  `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>User Profile</title>
  <link rel="stylesheet" href="/styles/profile.css">
`
);
```

### Static File Serving

JigSaw automatically serves static files from the `static` directory located in the project root. Simply place your static assets (e.g., CSS, JavaScript, images) in this directory, and they will be accessible via the server.

### Navigation Generation

By default, JigSaw generates navigation based on your registered routes. You can enable or disable this feature in the configuration:

```typescript
JigSaw.configure({
  generateNavigation: true, // or false
});
```

## API Reference

For detailed information on JigSaw's API, refer to the source code in the `src` directory.

## Examples

Check out the `//#examples` section in src code for sample projects that demonstrate JigSaw's capabilities.

- ![sample site made with jigsaw](./image.png)

## Final Note

This implementation of JigSaw is a powerful tool for learning and building templating engines. However, for production use, more extensive testing, error handling, and performance optimizations are recommended. Additionally, security considerations, such as input sanitization, should be taken into account to prevent vulnerabilities in real-world applications.
