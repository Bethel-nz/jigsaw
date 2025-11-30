import JigSaw from './src/jigsaw';
import db from './src/db';

// Define custom pipes for the blog
JigSaw.definePipe('formatDate', (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
});

// Load templates
JigSaw.template(['blog', 'post', 'admin']);

// Route: Home page - Blog listing
JigSaw.route('/', () => {
  const posts = db.query(`
    SELECT * FROM posts 
    WHERE published = 1 
    ORDER BY created_at DESC
  `).all();
  
  const postsWithTags = posts.map((post: any) => ({
    ...post,
    tags: post.tags ? post.tags.split(',') : []
  }));
  
  return JigSaw.render('blog', {
    title: 'My Tech Blog',
    siteName: 'My Tech Blog',
    currentYear: new Date().getFullYear(),
    posts: postsWithTags
  });
});

// Route: Individual post page
JigSaw.route('/post/:slug', (params) => {
  const post = db.query(`
    SELECT * FROM posts WHERE slug = ?
  `).get(params!.slug);
  
  if (!post) {
    return '<h1>Post not found</h1>';
  }
  
  // Increment view count
  db.run(`UPDATE posts SET views = views + 1 WHERE slug = ?`, [params!.slug]);
  
  const postWithTags = {
    ...post,
    tags: (post as any).tags ? (post as any).tags.split(',') : []
  };
  
  return JigSaw.render('post', {
    siteName: 'My Tech Blog',
    post: postWithTags
  });
});

// Route: Admin page  
JigSaw.route('/admin', () => {
  const allPosts = db.query(`
    SELECT * FROM posts 
    ORDER BY created_at DESC
  `).all();
  
  const published = db.query(`
    SELECT COUNT(*) as count FROM posts WHERE published = 1
  `).get() as any;
  
  const totalViews = db.query(`
    SELECT SUM(views) as total FROM posts
  `).get() as any;
  
  return JigSaw.render('admin', {
    posts: allPosts,
    stats: {
      total: allPosts.length,
      published: published.count,
      drafts: allPosts.length - published.count,
      totalViews: totalViews.total || 0
    }
  });
});

// Start server with JigSaw's built-in routing
JigSaw.serve({ port: 3000 });

console.log(`\n🚀 Blog server running at http://localhost:3000`);
console.log(`📝 Visit http://localhost:3000/admin for admin panel`);
console.log(`✨ Client-side routing enabled - smooth page transitions!\n`);
