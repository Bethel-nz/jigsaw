import { jigsaw, posts, noirProducts } from './index';

// Parse Arguments for Build
console.log('Starting build from build.ts...');

const args = process.argv.slice(2);
const ignoreIndex = args.indexOf('--ignore');
const ignoreList =
  ignoreIndex !== -1 && args[ignoreIndex + 1]
    ? args[ignoreIndex + 1].split(',')
    : [];

jigsaw
  .build('dist', {
    ignore: ignoreList,
    staticPaths: {
      '/blog/:id': posts.map((p) => ({ id: p.id.toString() })),
      '/profile/:id': [{ id: '1' }, { id: '2' }],
      '/product/:id': noirProducts.map((p) => ({ id: p.id })),
    },
  })
  .catch((e) => console.error('Build failed:', e));
