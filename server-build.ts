import { jigsaw } from './index';
import { encode } from './src/codec';
import * as fs from 'fs';
import * as path from 'path';

async function build() {
  console.log('🚀 Starting Clean SSR Server Build...');
  
  const distDir = path.resolve(process.cwd(), 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);

  // 1. Bundle all templates into templates.jigsaw
  console.log('--- 1. Bundling Templates into JSON ---');
  const templateBundle: Record<string, string> = {};
  
  // Helper to crawl
  const crawl = (dir: string, prefix = '') => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
         crawl(fullPath, prefix); // We could add subfolder support here if needed
      } else if (file.endsWith('.jig')) {
         const name = file.startsWith('_') ? file.slice(1, -4) : file.slice(0, -4);
         templateBundle[prefix + name] = fs.readFileSync(fullPath, 'utf8');
      }
    }
  };

  crawl(path.join(process.cwd(), 'templates'));
  crawl(path.join(process.cwd(), 'templates', 'components'), 'comp:');
  
  const encoded = encode(JSON.stringify(templateBundle));
  fs.writeFileSync(path.join(distDir, 'templates.jigsaw'), encoded);
  console.log('✅ Templates obfuscated and bundled to dist/templates.jigsaw');

  
  // 2. Generate the Single App Shell
  console.log('--- 2. Generating App Shell ---');
  const shell = jigsaw.generateAppShell();
  fs.writeFileSync(path.join(distDir, 'index.html'), shell);
  console.log('✅ App Shell generated to dist/index.html');

  // 3. Bundle the Server
  console.log('--- 2. Bundling SSR Server ---');
  const { execSync } = require('child_process');
  console.log('--- 4. Compiling Standalone Binary ---');
  try {
    execSync('bun build ./index.ts --compile --bytecode --outfile ./dist/jigsaw-engine');
    if (process.platform === 'darwin') {
      console.log('--- 4.1 Signing Binary ---');
      try {
        execSync('codesign --deep --force --sign - --entitlements entitlements.plist ./dist/jigsaw-engine');
        execSync('xattr -d com.apple.quarantine ./dist/jigsaw-engine 2>/dev/null || true');
        console.log('✅ Standalone binary signed');
      } catch (se) {
        console.warn('⚠️ Codesign failed, but build continued:', se.message);
      }
    }
    console.log('✅ Standalone binary compiled to dist/jigsaw-engine');
  } catch (e) {
    console.error('Compilation failed:', e.message);
    process.exit(1);
  }

  
  
  console.log('✅ Server bundled to dist/server.js');

  // 3. Copy only static assets (NO .jig files!)
  console.log('--- 5. Copying Static Assets ---');
  const publicDir = path.join(process.cwd(), 'public');
  const destPublic = path.join(distDir, 'public');
  if (fs.existsSync(publicDir)) {
     const { execSync } = require('child_process');
     execSync(`rm -rf ${destPublic} && cp -R ${publicDir} ${destPublic}`);
  }

  console.log('✨ Build Complete! Run with: NODE_ENV=production node ./dist/server.js');
}

build().catch(err => {
  console.error('Fatal build error:', err);
  process.exit(1);
});