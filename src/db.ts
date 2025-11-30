import { Database } from "bun:sqlite";

const db = new Database("blog.db");

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    excerpt TEXT,
    author TEXT NOT NULL,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published BOOLEAN DEFAULT 0,
    views INTEGER DEFAULT 0
  )
`);

// Seed with sample data
const samplePosts = [
  {
    title: "Welcome to My Blog",
    slug: "welcome-to-my-blog",
    content: `# Welcome to My Blog

This is my first blog post! I'm excited to share my thoughts and experiences with you.

## What to Expect

I'll be writing about:
- Technology and programming
- Personal projects
- Life lessons
- And much more!

Stay tuned for more content.`,
    excerpt: "My first blog post introducing what this blog is all about.",
    author: "Admin",
    tags: "welcome,introduction",
    published: 1
  },
  {
    title: "Building a Templating Engine",
    slug: "building-templating-engine",
    content: `# Building a Templating Engine

Recently, I've been working on a custom templating engine called Jigsaw. Here's what I learned.

## Key Features

- AST-based parsing
- Compiler for performance
- Elixir-style pipes
- Safe sandboxing

The journey has been incredible!`,
    excerpt: "My experience building a modern templating engine from scratch.",
    author: "Admin",
    tags: "programming,javascript,templates",
    published: 1
  },
  {
    title: "Draft: Upcoming Features",
    slug: "draft-upcoming-features",
    content: "This is a draft post about upcoming features...",
    excerpt: "A preview of what's coming next.",
    author: "Admin",
    tags: "updates",
    published: 0
  }
];

const insertPost = db.prepare(`
  INSERT INTO posts (title, slug, content, excerpt, author, tags, published)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

for (const post of samplePosts) {
  try {
    insertPost.run(
      post.title,
      post.slug,
      post.content,
      post.excerpt,
      post.author,
      post.tags,
      post.published
    );
  } catch (e) {
    // Post might already exist
  }
}

console.log("Database initialized successfully!");
console.log(`Total posts: ${db.query("SELECT COUNT(*) as count FROM posts").get().count}`);

export default db;
