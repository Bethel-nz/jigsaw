# Jigsaw Tutorial: Building a Simple Blog

This tutorial will guide you through building a simple blog with Jigsaw. You'll learn how to set up your project, create templates and components, and use dynamic routing.

## Prerequisites

- [Bun](https://bun.sh/) v1.0+ installed
- Basic knowledge of TypeScript/JavaScript
- A text editor (VS Code is recommended)

## 1. Project Setup

First, let's create a new project and install Jigsaw.

```bash
mkdir my-jigsaw-blog
cd my-jigsaw-blog
bun init -y
```

Now, you'll need to copy the Jigsaw source files into your project. For this tutorial, we'll assume you have a `src` directory with the Jigsaw engine files.

Your project structure should look like this:

```
my-jigsaw-blog/
├── src/
│   ├── jigsaw.ts
│   ├── knob.ts
│   ├── lexer.ts
│   ├── parser.ts
│   ├── compiler.ts
│   ├── errors.ts
│   └── types.ts
├── templates/
├── components/
├── public/
│   └── static/
└── index.ts
```

## 2. Your First Page

Let's create a simple home page.

### a. Create `index.ts`

This file will be the entry point of our application.

```typescript
// index.ts
import JigSaw from './src/jigsaw';

// Load our templates
JigSaw.template(['layout', 'home']);

// Define a route for the home page
JigSaw.route('/', () => {
  return JigSaw.render('home', {
    title: 'Welcome to My Blog!',
    message: 'This is my first post.'
  });
});

// Start the server
JigSaw.serve({ port: 3000 });
```

### b. Create a Layout Template

The layout will be the base structure for all our pages.

**`templates/layout.jig`**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ meta.title || 'My Blog' }}</title>
  <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
  <header>
    <h1>My Jigsaw Blog</h1>
  </header>

  <main>
    {{ content | safe }}
  </main>

  <footer>
    <p>&copy; 2025 My Blog</p>
  </footer>
</body>
</html>
```

### c. Create a Home Template

This template will be rendered inside the layout.

**`templates/home.jig`**
```html
@meta {{
  title: "Home - My Blog"
}}

<div class="hero">
  <h1>{{ title }}</h1>
  <p>{{ message }}</p>
</div>
```

### d. Add Some Styles

Create a stylesheet to make our blog look a bit nicer.

**`public/static/styles.css`**
```css
body {
  font-family: sans-serif;
  line-height: 1.6;
  color: #333;
  margin: 0;
}

header {
  background: #333;
  color: white;
  padding: 1rem;
  text-align: center;
}

main {
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
}

footer {
  text-align: center;
  padding: 1rem;
  color: #666;
  margin-top: 2rem;
}
```

### e. Run Your App

Now, let's see our page in action!

```bash
bun run index.ts
```

Visit **http://localhost:3000** in your browser. You should see your new blog's home page.

## 3. Adding Dynamic Routes

Let's create a page for a single blog post.

### a. Update `index.ts`

We'll add a new route that takes a slug as a parameter.

```typescript
// index.ts
import JigSaw from './src/jigsaw';

// Sample data for our posts
const posts = [
  { id: '1', slug: 'first-post', title: 'My First Post', content: 'Hello World!' },
  { id: '2', slug: 'second-post', title: 'Another Post', content: 'This is another post.' }
];

// Load templates
JigSaw.template(['layout', 'home', 'post']);

// Home page route
JigSaw.route('/', () => {
  return JigSaw.render('home', {
    title: 'Welcome to My Blog!',
    posts: posts
  });
});

// Dynamic route for a single post
JigSaw.route('/blog/:slug', (params) => {
  const post = posts.find(p => p.slug === params.slug);

  if (!post) {
    // A simple 404 handler
    return '404 Not Found';
  }

  return JigSaw.render('post', { post });
});

// Start the server
JigSaw.serve({ port: 3000 });
```

### b. Create a Post Template

This template will display a single blog post.

**`templates/post.jig`**
```html
@meta {{
  title: "{{ post.title }} - My Blog"
}}

<article>
  <h1>{{ post.title }}</h1>
  <div class="content">
    <p>{{ post.content }}</p>
  </div>
  <a href="/">← Back to Home</a>
</article>
```

### c. Update the Home Page

Let's list our posts on the home page.

**`templates/home.jig`**
```html
@meta {{
  title: "Home - My Blog"
}}

<div class="post-list">
  <h2>All Posts</h2>
  {% for post in posts %}
    <div class="post-item">
      <h3><a href="/blog/{{ post.slug }}">{{ post.title }}</a></h3>
    </div>
  {% endfor %}
</div>
```

Now, restart your server and visit **http://localhost:3000**. You should see a list of your posts, and you can click on them to navigate to the single post page.

## 4. Using Components

Let's create a reusable component for our post items.

### a. Create a Card Component

**`components/_card.jig`**
```html
<div class="card">
  <h3><a href="{{ link }}">{{ title }}</a></h3>
  <p>{{ description }}</p>
</div>
```

### b. Use the Component

Now, let's use our new component in the home page. Note the required colon (`:`) before each prop name.

**`templates/home.jig`**
```html
@meta {{
  title: "Home - My Blog"
}}

<div class="post-list">
  <h2>All Posts</h2>
  {% for post in posts %}
    {{{ card(:title=post.title, :description=post.content, :link="/blog/" + post.slug) }}}
  {% endfor %}
</div>
```

Restart your server, and your home page should now be using the card component.

## Next Steps

You've now built a simple blog with Jigsaw! Here are some things you can try next:

- **Add more styles**: Make your blog look unique.
- **Create more components**: Build a library of reusable UI elements.
- **Explore advanced features**: Check out the `SYNTAX.md` and `API.md` documentation to learn about Islands Architecture, View Transitions, and more.
- **Build a more complex application**: Try building a portfolio, a dashboard, or a small e-commerce site.