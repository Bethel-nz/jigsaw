import { fetchUserData, fetchProfiles } from './data';
import JigSaw from './src/jigsaw';

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

export const jigsaw = JigSaw;

jigsaw.definePipe('upper', (str: string) => str.toUpperCase());
jigsaw.definePipe('safe', (str: string) => str);

// Load templates
jigsaw.template([
  'layout',
  'home',
  'blog',
  'post',
  'profiles',
  'profile$id',
  'test-error',
  'tasks',
  'test-batching',
  'noir-layout',
  'noir-home',
  'noir-collection',
  'noir-product',
]);

// Demo Data
export const posts = [
  {
    id: 1,
    title: 'The Power of Islands',
    excerpt: 'Why persistent components matter for UX.',
    date: 'Oct 24, 2025',
    content:
      'Islands architecture allows us to keep parts of the page alive while navigating...',
  },
  {
    id: 2,
    title: 'Native View Transitions',
    excerpt: 'Animating the web without heavy libraries.',
    date: 'Oct 25, 2025',
    content:
      'The View Transitions API is a game changer for multi-page applications...',
  },
  {
    id: 3,
    title: 'Component Props in Jigsaw',
    excerpt: 'Passing data to reusable components.',
    date: 'Oct 26, 2025',
    content:
      'With the new props syntax, components become much more powerful and reusable...',
  },
];

// Routes

// Tasks App (Index)
jigsaw.route('/tasks', () => {
  return jigsaw.render('tasks', { newTask: '' });
});

jigsaw.route('/test-batching', () => {
  return jigsaw.render('test-batching', {});
});

// Demo Page (previous home with layout)
jigsaw.route('/demo', () => {
  const home = jigsaw.render('home', { posts });
  return jigsaw.render(
    'layout',
    {
      content: home.html,
    },
    home.meta,
  );
});

// Blog List
jigsaw.route('/blog', () => {
  return jigsaw.render('layout', {
    title: 'Jigsaw - Blog',
    content: jigsaw.render('blog', { posts }),
  });
});

// Blog Post
jigsaw.route('/blog/:id', (params) => {
  const post = posts.find((p) => p.id === Number(params?.id));
  if (!post) {
    return '<h1>404 Post Not Found</h1>';
  }

  return jigsaw.render('layout', {
    title: `Jigsaw - ${post.title}`,
    content: jigsaw.render('post', { post }),
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

// ── NØIR Demo Site ──
export const noirProducts = [
  {
    id: 'c-01',
    name: 'ERODED TEE',
    category: 'CORE',
    price: 95,
    size: 'OVERSIZED',
  },
  {
    id: 'c-02',
    name: 'SIGNAL HOODIE',
    category: 'LAYER',
    price: 240,
    size: 'RELAXED',
  },
  {
    id: 'c-03',
    name: 'STATIC CARGO',
    category: 'BOTTOM',
    price: 195,
    size: 'WIDE',
  },
  { id: 'c-04', name: 'NULL TANK', category: 'CORE', price: 75, size: 'BOXY' },
  {
    id: 'c-05',
    name: 'CORRUPT JACKET',
    category: 'OUTER',
    price: 450,
    size: 'OVERSIZED',
  },
  {
    id: 'c-06',
    name: 'GLITCH SHORT',
    category: 'BOTTOM',
    price: 130,
    size: 'RELAXED',
  },
  {
    id: 'c-07',
    name: 'NOISE CREWNECK',
    category: 'LAYER',
    price: 185,
    size: 'REGULAR',
  },
  {
    id: 'c-08',
    name: 'VOID PUFFER',
    category: 'OUTER',
    price: 520,
    size: 'OVERSIZED',
  },
  {
    id: 'c-09',
    name: 'DRIFT PANT',
    category: 'BOTTOM',
    price: 210,
    size: 'TAPERED',
  },
  {
    id: 'c-10',
    name: 'DECAY LONGSLEEVE',
    category: 'CORE',
    price: 110,
    size: 'RELAXED',
  },
  {
    id: 'c-11',
    name: 'STATIC VEST',
    category: 'LAYER',
    price: 170,
    size: 'BOXY',
  },
  {
    id: 'c-12',
    name: 'FRAGMENT COAT',
    category: 'OUTER',
    price: 580,
    size: 'OVERSIZED',
  },
];

const noirCategories = [...new Set(noirProducts.map((p) => p.category))];
const marqueeItems = Array.from({ length: 12 }, (_, i) => i);

jigsaw.route('/', () => {
  return jigsaw.render('noir-layout', {
    content: jigsaw.render('noir-home', {
      featured: noirProducts.slice(0, 4),
      productCount: noirProducts.length,
      marqueeItems,
    }),
  });
});

jigsaw.route('/collection', (params) => {
  const category = params?.category;
  let products = noirProducts;

  if (category && category !== 'ALL') {
    products = noirProducts.filter((p) => p.category === category);
  }

  return jigsaw.render('noir-layout', {
    content: jigsaw.render('noir-collection', {
      products: products,
      categories: noirCategories,
      productCount: products.length,
      currentFilter: category || 'ALL',
    }),
  });
});

jigsaw.route('/product/:id', (params) => {
  const product = noirProducts.find((p) => p.id === params?.id);
  if (!product) return '<h1>404 - Product Not Found</h1>';
  return jigsaw.render('noir-layout', {
    content: jigsaw.render('noir-product', { product }),
  });
});

// Start Server only if run directly
import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  jigsaw.serve({ port: 3090 });
}
