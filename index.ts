import { fetchUserData, fetchProfiles } from './data';
import JigSaw from './src/jigsaw';

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

const jigsaw = JigSaw;

jigsaw.definePipe('upper', (str: string) => str.toUpperCase());
jigsaw.definePipe('safe', (str: string) => str);

// Load templates
jigsaw.template(['layout', 'home', 'blog', 'post', 'profiles', 'profile$id', 'test-error']);

// Demo Data
const posts = [
  { id: 1, title: 'The Power of Islands', excerpt: 'Why persistent components matter for UX.', date: 'Oct 24, 2025', content: 'Islands architecture allows us to keep parts of the page alive while navigating...' },
  { id: 2, title: 'Native View Transitions', excerpt: 'Animating the web without heavy libraries.', date: 'Oct 25, 2025', content: 'The View Transitions API is a game changer for multi-page applications...' },
  { id: 3, title: 'Component Props in Jigsaw', excerpt: 'Passing data to reusable components.', date: 'Oct 26, 2025', content: 'With the new props syntax, components become much more powerful and reusable...' },
];

// Routes

// Home
jigsaw.route('/', () => {
  const home = jigsaw.render('home', { posts });
  return jigsaw.render('layout', {
    content: home.html
  }, home.meta);
});

// Blog List
jigsaw.route('/blog', () => {
  return jigsaw.render('layout', {
    title: 'Jigsaw - Blog',
    content: jigsaw.render('blog', { posts })
  });
});

// Blog Post
jigsaw.route('/blog/:id', (params) => {
  const post = posts.find(p => p.id === Number(params?.id));
  if (!post) {
    return '<h1>404 Post Not Found</h1>';
  }
  
  return jigsaw.render('layout', {
    title: `Jigsaw - ${post.title}`,
    content: jigsaw.render('post', { post })
  });
});

// Legacy Routes (keeping for reference)
jigsaw.route('/profiles', async () => {
  const profiles = await fetchProfiles();
  return jigsaw.render('profiles', { profiles });
});

jigsaw.route('/profile/:id', async (params) => {
  const data = await fetchUserData(params?.id!);
  return jigsaw.render('profile$id', data);
});

jigsaw.route('/test-error', () => {
  return jigsaw.render('test-error', { items: ['item1', 'item2'] });
});

// Start Server
// Start Server or Build
console.log('Arguments:', process.argv);
if (process.argv.includes('--build')) {
  console.log('Starting build...');
  
  // Parse Ignore Flag
  const ignoreIndex = process.argv.indexOf('--ignore');
  const ignoreList = ignoreIndex !== -1 && process.argv[ignoreIndex + 1] 
      ? process.argv[ignoreIndex + 1].split(',') 
      : [];

  jigsaw.build('dist', {
      ignore: ignoreList,
      staticPaths: {
          '/blog/:id': posts.map(p => ({ id: p.id.toString() })),
          '/profile/:id': [{ id: '1' }, { id: '2' }] // Example static paths for profile
      }
  }).catch(e => console.error('Build failed:', e));
} else {
  jigsaw.serve({ port: 3000 });
}
