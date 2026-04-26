import { jigsaw } from './index';

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
    staticPaths: {},
  })
  .catch((e) => console.error('Build failed:', e));