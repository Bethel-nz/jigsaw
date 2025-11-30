# Jigsaw Template Syntax Guide

Complete reference for Jigsaw template syntax and features.

---

## Table of Contents

- [Variable Interpolation](#variable-interpolation)
- [Control Structures](#control-structures)
- [Components](#components)
- [Islands Architecture](#islands-architecture)
- [View Transitions](#view-transitions)
- [Pipes](#pipes)
- [Event Handlers](#event-handlers)
- [Meta Tags & Scripts](#meta-tags--scripts)
- [Comments](#comments)
- [Expressions](#expressions)

---

## Variable Interpolation

Display variables from your data using `{{ }}`.

### Basic Usage

```html
{{ name }}
{{ user.email }}
{{ items.0.title }}
```

**Example:**
```typescript
JigSaw.render('template', {
  name: 'Alice',
  user: { email: 'alice@example.com' },
  items: [{ title: 'First' }]
});
```

### HTML Escaping

**All variables are HTML-escaped by default** for security:

```html
{{ userInput }}
<!-- <script>alert('xss')</script> -->
<!-- Renders as: &lt;script&gt;alert('xss')&lt;/script&gt; -->
```

### Safe Pipe (Unescaped HTML)

⚠️ Use `safe` pipe only with **trusted content**:

```html
{{ trustedHtml | safe }}
<!-- Renders raw HTML without escaping -->
```

---

## Control Structures

### If Statements

```html
{% if condition %}
  <p>Condition is true</p>
{% endif %}
```

**With Else:**
```html
{% if isAdmin %}
  <div class="admin-panel">Admin Tools</div>
{% else %}
  <div class="user-panel">User Dashboard</div>
{% endif %}
```

**Expressions:**
```html
{% if user.age >= 18 %}
  <p>Adult content</p>
{% endif %}

{% if user.role == 'admin' && user.active %}
  <button>Delete Users</button>
{% endif %}
```

---

### For Loops

Iterate over arrays:

```html
{% for item in items %}
  <div>{{ item }}</div>
{% endfor %}
```

**With Objects:**
```html
{% for post in posts %}
  <article>
    <h2>{{ post.title }}</h2>
    <p>{{ post.excerpt }}</p>
  </article>
{% endfor %}
```

### Loop Metadata

Special variables available inside loops:

```html
{% for item in items %}
  Item: {{ item }}
  
  {% if item_first %}
    <p>This is the first item!</p>
  {% endif %}
  
  {% if item_last %}
    <p>This is the last item!</p>
  {% endif %}
  
  <p>Index: {{ item_index }}</p>
{% endfor %}
```

**Loop Variables:**
- `{item}_first` - `true` for first iteration
- `{item}_last` - `true` for last iteration
- `{item}_index` - Zero-based index (0, 1, 2...)

---

## Components

Reusable template pieces.

### Creating Components

**File:** `components/card.jig`
```html
<div class="card">
  <h3>{{ title }}</h3>
  <p>{{ description }}</p>
</div>
```

### Using Components

Components can be rendered using a function-like syntax. Props are passed as named arguments, and **each prop name must be prefixed with a colon (`:`)**.

```html
{{{ card(:title="Welcome", :description="Hello World!") }}}
```

**With dynamic values:**
```html
{{{ userCard(:name=user.name, :email=user.email, :active=true) }}}
```

You can also use a pipe-based syntax, which is supported for legacy reasons:

```html
{{{ 'card' | :title="Welcome", :description="Hello World!" }}}
```

---

## Islands Architecture

Persistent UI components that survive navigation.

### Creating Islands

```html
{% island "nav" %}
  <nav class="main-nav">
    <a href="/">Home</a>
    <a href="/about">About</a>
  </nav>
{% endisland %}
```

**Rendered HTML:**
```html
<div data-island="nav" data-island-static>
  <nav class="main-nav">...</nav>
</div>
```

### How Islands Work

1. **Initial Load**: Island renders normally
2. **Navigation**: Island content is preserved
3. **New Page**: Only non-island content updates
4. **State**: Island maintains its state (form inputs, scroll position, etc.)

### Use Cases

Perfect for:
- Navigation menus
- Music/video players
- Shopping carts
- Chat widgets
- User session indicators

**Example - Persistent Player:**
```html
{% island "player" %}
  <audio @sync="currentTrack" controls>
    <source src="/music/{{ currentTrack }}.mp3">
  </audio>
  <button @click="nextTrack()">Next</button>
{% endisland %}
```

---

## View Transitions

Smooth animations between page navigations using the native View Transitions API.

### Basic Syntax

```html
{% transition "fade" %}
  <main class="content">
    <!-- Dynamic content here -->
  </main>
{% endtransition %}
```

**Rendered HTML:**
```html
<div data-transition-type="fade">
  <main class="content">...</main>
</div>
```

### Transition Types

Common transition names:
- `fade` - Fade in/out
- `slide-left` - Slide from right
- `slide-right` - Slide from left
- `zoom` - Zoom in/out

**Example:**
```html
<!-- In layout.jig -->
{% transition "slide-left" %}
  <!-- Page content changes here -->
{% endtransition %}
```

### Per-Element Transitions

Add `data-transition` attribute to specific elements:

```html
<a href="/blog/{{ post.id }}" data-transition="slide-left">
  Read More
</a>
```

### How It Works

1. Click link with transition
2. Browser captures current state
3. New page loads
4. Browser animates between states
5. Native API handles the animation

---

## Pipes

Transform values in templates.

### Built-in Pipes

#### safe

Bypass HTML escaping (⚠️ trusted content only):

```html
{{ richContent | safe }}
```

### Custom Pipes

Define in your application:

```typescript
// Simple transformation
JigSaw.definePipe('upper', (str: string) => str.toUpperCase());

// With arguments
JigSaw.definePipe('truncate', (str: string, length: number) => {
  return str.length > length ? str.slice(0, length) + '...' : str;
});

// Multiple arguments
JigSaw.definePipe('format', (date: Date, format: string, locale: string) => {
  return date.toLocaleDateString(locale, { dateStyle: format });
});
```

### Using Pipes

```html
<!-- No arguments -->
{{ name | upper }}

<!-- With arguments -->
{{ description | truncate: 100 }}
{{ date | format: 'long': 'en-US' }}

<!-- Chain pipes -->
{{ name | upper | truncate: 20 }}
```

---

## Event Handlers

Attach JavaScript event handlers to elements.

### @click

Execute JavaScript on click:

```html
<button @click="console.log('Clicked!')">
  Click Me
</button>
```

**Rendered HTML:**
```html
<button data-on-click="console.log('Clicked!')">
  Click Me
</button>
```

### @sync

Bind data for islands (**experimental**):

```html
<input @sync="username" type="text" />
```

**Rendered HTML:**
```html
<input data-bind="username" type="text" />
```

### Usage Notes

- `@click` transforms to `data-on-click`
- `@sync` transforms to `data-bind`  
- Actual event handling requires client-side JavaScript
- Perfect for islands and interactive components

---

## Meta Tags & Scripts

Inject metadata and scripts into your pages.

### @meta Directive

Define page metadata:

```html
@meta {{
  title: "Home Page",
  description: "Welcome to our site",
  author: "Alice",
  keywords: "jigsaw, templates, ssr"
}}
```

**Access in Code:**
```typescript
const result = JigSaw.render('page', data);
console.log(result.meta.title);        // "Home Page"
console.log(result.meta.description);  // "Welcome to our site"
```

### @script Directive

Include external scripts:

```html
@script(src="/static/app.js" defer)
@script(src="https://cdn.example.com/lib.js" async)
```

**Access in Code:**
```typescript
const result = JigSaw.render('page', data);
console.log(result.scripts);
// ["<script src='/static/app.js' defer>", ...]
```

### Layout Integration

```html
<!-- layout.jig -->
<!DOCTYPE html>
<html>
<head>
  <title>{{ meta.title || 'Default Title' }}</title>
  <meta name="description" content="{{ meta.description }}">
  
  {% for script in scripts %}
    {{ script | safe }}
  {% endfor %}
</head>
<body>
  {{ content | safe }}
</body>
</html>
```

---

## Comments

### Template Comments

Not rendered in output:

```html
{# This is a comment #}
{# 
  Multi-line comment
  Won't appear in output
#}
```

### HTML Comments

Rendered in output:

```html
<!-- This appears in the HTML -->
```

---

## Expressions

Full expression support in interpolations and conditions.

### Operators

**Arithmetic:**
```html
{{ price * quantity }}
{{ total - discount }}
{{ count + 1 }}
{{ amount / rate }}
```

**Comparison:**
```html
{% if age >= 18 %}
{% if score < 50 %}
{% if status == 'active' %}
{% if role != 'guest' %}
```

**Logical:**
```html
{% if isAdmin && isActive %}
{% if isPremium || isTrial %}
{% if !isBlocked %}
```

### Member Access

```html
{{ user.profile.name }}
{{ items.0.title }}
{{ company.address.city }}
```

### Function Calls

```html
{{ Math.max(a, b) }}
{{ Date.now() }}
{{ formatDate(timestamp) }}
```

### Object Literals

```html
{{ { name: 'Alice', age: 30 } }}
```

### Parentheses for Grouping

```html
{{ (price + tax) * quantity }}
{% if (isAdmin || isModerator) && isActive %}
```

### Ternary (via if-else)

No direct ternary operator, use if-else:

```html
{% if condition %}
  true value
{% else %}
  false value
{% endif %}
```

---

## Complete Example

```html
{# layout.jig - Main Layout #}
@meta {{
  title: "{{ pageTitle || 'My Site' }}",
  description: "{{ pageDescription }}"
}}

@script(src="/static/app.js" defer)

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{ meta.title }}</title>
  <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
  {% island "nav" %}
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
      {% if user %}
        <span>Welcome, {{ user.name }}!</span>
      {% endif %}
    </nav>
  {% endisland %}
  
  {% transition "fade" %}
    {{ content | safe }}
  {% endtransition %}
  
  {% island "player" %}
    <audio controls @sync="currentTrack">
      <source src="/music/{{ currentTrack }}.mp3">
    </audio>
  {% endisland %}
  
  {% for script in scripts %}
    {{ script | safe }}
  {% endfor %}
</body>
</html>
```

```html
{# home.jig - Home Page #}
@meta {{
  title: "Home - Welcome",
  description: "Welcome to my amazing site!"
}}

<div class="hero">
  <h1>{{ title }}</h1>
  <p>{{ tagline | upper }}</p>
</div>

<div class="posts">
  {% for post in posts %}
    {% if post_first %}
      <h2>Latest Post</h2>
    {% endif %}
    
    {{{ 'postCard' | 
      title: post.title,
      excerpt: post.excerpt | truncate: 150,
      url: '/blog/' + post.slug
    }}}
  {% endfor %}
</div>

{% if showNewsletter %}
  <form>
    <input type="email" @sync="email" placeholder="Your email">
    <button @click="subscribe()">Subscribe</button>
  </form>
{% endif %}
```

---

## Best Practices

1. **Always escape user input** - Don't use `safe` pipe on untrusted data
2. **Use components for reusability** - DRY principle
3. **Keep logic simple** - Complex logic belongs in JavaScript, not templates
4. **Use islands for stateful UI** - Navigation, players, carts
5. **Leverage transitions** - Smooth user experience
6. **Organize with meta/scripts** - Keep metadata with templates
7. **Comment complex sections** - Help future developers

---

## Quick Reference

| Feature | Syntax | Example |
|---------|--------|---------|
| Variable | `{{ }}` | `{{ name }}` |
| If Statement | `{% if %} {% endif %}` | `{% if show %}...{% endif %}` |
| For Loop | `{% for in %} {% endfor %}` | `{% for item in items %}` |
| Component | `{{{ }}}` | `{{{ 'card' \| title: 'Hi' }}}` |
| Island | `{% island %} {% endisland %}` | `{% island "nav" %}` |
| Transition | `{% transition %} {% endtransition %}` | `{% transition "fade" %}` |
| Pipe | `\|` | `{{ name \| upper }}` |
| Event | `@event` | `<button @click="fn()">` |
| Meta | `@meta` | `@meta {{ title: "Hi" }}` |
| Script | `@script` | `@script(src="/app.js")` |
| Comment | `{# #}` | `{# Not rendered #}` |
