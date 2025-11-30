# Jigsaw Security Best Practices

Guidelines for building secure applications with Jigsaw.

---

## Table of Contents

- [XSS Prevention](#xss-prevention)
- [Template Injection](#template-injection)
- [Safe Pipe Usage](#safe-pipe-usage)
- [Data Validation](#data-validation)
- [Content Security Policy](#content-security-policy)
- [Static File Security](#static-file-security)
- [Common Vulnerabilities](#common-vulnerabilities)

---

## XSS Prevention

### Automatic HTML Escaping

**✅ Jigsaw escapes all variables by default:**

```html
{{ userInput }}
```

If `userInput` contains `<script>alert('xss')</script>`, it renders as:
```html
&lt;script&gt;alert('xss')&lt;/script&gt;
```

**This prevents XSS attacks automatically.**

### What Gets Escaped

Jigsaw escapes these characters:
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&#039;`

**Example:**
```typescript
JigSaw.render('page', {
  comment: `<img src=x onerror="alert('xss')">`
});
```

Renders safely as:
```html
&lt;img src=x onerror=&quot;alert('xss')&quot;&gt;
```

---

## Template Injection

### The Risk

**❌ Never allow users to provide template strings:**

```typescript
// DANGEROUS - Don't do this!
const userTemplate = req.body.template; // User-provided
const knob = new Knob(userTemplate);
knob.render(data);
```

**Why it's dangerous:**
```typescript
// Malicious user provides:
template = "{% for item in items %}{{ system.password }}{% endfor %}"
```

### Safe Approach

**✅ Only use pre-defined templates:**

```typescript
// SAFE
const templateName = req.params.template;
const allowedTemplates = ['home', 'about', 'profile'];

if (!allowedTemplates.includes(templateName)) {
  throw new Error('Invalid template');
}

JigSaw.render(templateName, userData);
```

### Key Principles

1. **Never render user-provided template strings**
2. **Only render from trusted `.jig` files**
3. **Validate template names from user input**
4. **Keep template files in controlled directories**

---

## Safe Pipe Usage

### The Danger

The `safe` pipe **bypasses HTML escaping**.

**❌ NEVER use safe pipe with user input:**

```html
<!-- DANGEROUS! -->
{{ userComment | safe }}
```

If `userComment` is `<script>steal();</script>`, it executes!

### When to Use Safe Pipe

**✅ Only use with trusted, sanitized content:**

```typescript
// Server-side sanitization
import sanitizeHtml from 'sanitize-html';

const cleanHtml = sanitizeHtml(userInput, {
  allowedTags: ['b', 'i', 'em', 'strong', 'p'],
  allowedAttributes: {}
});

JigSaw.render('page', { content: cleanHtml });
```

```html
<!-- Now safe to use -->
{{ content | safe }}
```

### Trusted Sources for Safe Pipe

Use `safe` safely when:
- Content from CMS with built-in sanitization
- Markdown converted to HTML (with sanitization)
- Admin-authored HTML content
- HTML from your own templates/components

**Always sanitize HTML before marking it safe!**

---

## Data Validation

### Validate All User Input

**Before rendering:**

```typescript
import { z } from 'zod';

const CommentSchema = z.object({
  author: z.string().max(50),
  text: z.string().max(500),
  email: z.string().email()
});

JigSaw.route('/comments/:id', (params) => {
  const comment = getComment(params.id);
  
  try {
    const validated = CommentSchema.parse(comment);
    return JigSaw.render('comment', { comment: validated });
  } catch (error) {
    return JigSaw.render('error', { message: 'Invalid data' });
  }
});
```

### Sanitize Rich Text

**Use a library like `sanitize-html`:**

```typescript
import sanitizeHtml from 'sanitize-html';

const sanitizeConfig = {
  allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
  allowedAttributes: {
    'a': ['href', 'title']
  },
  allowedSchemes: ['http', 'https', 'mailto']
};

JigSaw.route('/article/:id', (params) => {
  const article = getArticle(params.id);
  
  article.content = sanitizeHtml(article.content, sanitizeConfig);
  
  return JigSaw.render('article', { article });
});
```

---

## Content Security Policy

### Implementing CSP

Add CSP headers to prevent XSS even if escaping fails:

```typescript
import http from 'http';

JigSaw.route('/page', () => {
  const result = JigSaw.render('page', data);
  return result.html;
});

// Wrap JigSaw server with custom server for headers
const server = http.createServer((req, res) => {
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://trusted-cdn.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:;"
  );
  
  // Handle request with JigSaw
  // ...
});
```

### Recommended CSP

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'nonce-{random}';
  img-src 'self' https: data:;
  font-src 'self';
  connect-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

---

## Static File Security

### Path Traversal Prevention

Jigsaw serves static files from `public/`. **Ensure proper path validation:**

```typescript
// Built into JigSaw, but if implementing custom:
import path from 'path';
import fs from 'fs';

function serveStatic(requestPath: string) {
  // Normalize and resolve path
  const safePath = path.normalize(requestPath).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.join(process.cwd(), 'public', safePath);
  
  // Ensure path is within public directory
  if (!fullPath.startsWith(path.join(process.cwd(), 'public'))) {
    throw new Error('Access denied');
  }
  
  return fs.readFileSync(fullPath);
}
```

### File Upload Security

**If implementing file uploads:**

```typescript
import crypto from 'crypto';
import path from 'path';

function handleUpload(file: Buffer, originalName: string) {
  // Generate random filename
  const hash = crypto.randomBytes(16).toString('hex');
  const ext = path.extname(originalName);
  
  // Validate extension
  const allowedExts = ['.jpg', '.png', '.gif', '.pdf'];
  if (!allowedExts.includes(ext.toLowerCase())) {
    throw new Error('File type not allowed');
  }
  
  const filename = `${hash}${ext}`;
  const uploadPath = path.join(process.cwd(), 'public', 'uploads', filename);
  
  fs.writeFileSync(uploadPath, file);
  return `/uploads/${filename}`;
}
```

---

## Common Vulnerabilities

### 1. XSS via Attributes

**❌ Unsafe:**
```html
<div class="{{ userClassName }}">
```

If `userClassName` is `" onload="alert('xss')"`, it breaks out of the attribute.

**✅ Safe (Jigsaw escapes this):**
```html
<div class="{{ userClassName }}">
<!-- Renders as: class="&quot; onload=&quot;alert('xss')&quot;" -->
```

### 2. JavaScript Context

**❌ Never put user data in JavaScript:**
```html
<script>
  var userName = "{{ user.name }}"; // DANGEROUS!
</script>
```

**✅ Use data attributes instead:**
```html
<div id="app" data-user="{{ user.name }}"></div>
<script>
  const userName = document.getElementById('app').dataset.user;
</script>
```

### 3. URL Context

**❌ Unsafe:**
```html
<a href="{{ userUrl }}">Click</a>
```

**✅ Validate URLs:**
```typescript
function validateUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '#';
    }
    return url;
  } catch {
    return '#';
  }
}

JigSaw.definePipe('safeUrl', validateUrl);
```

```html
<a href="{{ userUrl | safeUrl }}">Click</a>
```

---

## Security Checklist

Before deploying your Jigsaw application:

- [ ] **Never use `safe` pipe with user input**
- [ ] **Validate all user data with schemas (Zod, Yup, etc.)**
- [ ] **Sanitize rich text content before rendering**
- [ ] **Implement Content Security Policy headers**
- [ ] **Use HTTPS in production**
- [ ] **Validate file uploads (type, size, content)**
- [ ] **Prevent path traversal in static files**
- [ ] **Never render user-provided template strings**
- [ ] **Validate URLs in links and redirects**
- [ ] **Use data attributes, not inline scripts**
- [ ] **Regular security audits and updates**
- [ ] **Environment variables for secrets**
- [ ] **Rate limiting for user inputs**
- [ ] **CSRF tokens for forms**

---

## Reporting Security Issues

If you discover a security vulnerability in Jigsaw, please **do not** create a public issue.

**Instead:**
1. Email: [security contact - update this]
2. Include: Steps to reproduce
3. Include: Impact assessment
4. We'll respond within 48 hours

---

## Resources

- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Content Security Policy Reference](https://content-security-policy.com/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [sanitize-html library](https://www.npmjs.com/package/sanitize-html)
- [Zod validation library](https://zod.dev/)

---

## Summary

**Default Security:**
✅ HTML escaping enabled by default  
✅ Prototype pollution prevention  
✅ Safe property access  

**Your Responsibilities:**
⚠️ Never use `safe` pipe with user input  
⚠️ Validate all user data  
⚠️ Sanitize rich text content  
⚠️ Never render user-provided templates  
⚠️ Implement CSP headers  

**Remember: Security is a shared responsibility. Jigsaw provides secure defaults, but safe usage is up to you!**
