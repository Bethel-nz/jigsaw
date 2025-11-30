import { ASTNode } from './parser';

export class Compiler {
  private scope: Set<string>[] = [new Set()];

  compile(node: ASTNode): string {
    return `(function(data, pipes, helper, context) { 
      const __output = [];
      function __append(str) { __output.push(str); }
      function __escape(str) { 
        if (str === null || str === undefined) return "";
        return String(str)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }
      function __get(obj, path) {
        if (obj === null || obj === undefined) return "";
        
        // Security: Prevent access to prototype, constructor, etc.
        if (path === 'constructor' || path === '__proto__' || path === 'prototype') return undefined;
        
        // Try to get from object first
        if (obj !== null && (typeof obj === 'object' || typeof obj === 'function')) {
          if (path in obj) {
            return obj[path];
          }
        }
        
        // If not in object and object is data (root), try global scope
        if (obj === data && typeof globalThis[path] !== 'undefined') {
          return globalThis[path];
        }
        
        return undefined;
      }
      function __callFunction(fn, args) {
        if (typeof fn !== 'function') {
          throw new Error('Attempted to call non-function value: ' + typeof fn);
        }
        return fn(...args);
      }
      
      ${this.visit(node)}
      
      return __output.join('');
    })`;
  }

  private visit(node: ASTNode): string {
    switch (node.type) {
      case 'Program':
        return node.body.map(child => this.visit(child)).join('\n');
      case 'Text':
        // Transform event handlers: @{event}="..." to data-on-{event}="..."
        // Supports: @click, @submit, @input, @change, @focus, @blur, etc.
        let transformed = node.value;
        
        // Common events to support
        const events = [
          'click', 'dblclick',
          'submit', 'reset',
          'input', 'change', 'keydown', 'keyup', 'keypress',
          'focus', 'blur',
          'mouseenter', 'mouseleave', 'mouseover', 'mouseout',
          'touchstart', 'touchend', 'touchmove'
        ];
        
        // Transform each event type
        events.forEach(event => {
          transformed = transformed
            .replace(new RegExp(`@${event}="([\\s\\S]*?)"`, 'g'), `data-on-${event}="$1"`)
            .replace(new RegExp(`@${event}='([\\s\\S]*?)'`, 'g'), `data-on-${event}='$1'`);
        });
        
        // Transform @sync to data-sync
        transformed = transformed
          .replace(/@sync="([^"]+)"/g, 'data-sync="$1"')
          .replace(/@sync='([^']+)'/g, "data-sync='$1'");

        // Transform @state to data-state
        transformed = transformed
          .replace(/@state="([^"]+)"/g, 'data-state="$1"')
          .replace(/@state='([^']+)'/g, "data-state='$1'");

        // Transform @init to data-init
        transformed = transformed
          .replace(/@init="([^"]+)"/g, 'data-init="$1"')
          .replace(/@init='([^']+)'/g, "data-init='$1'");
        
        return `__append(${JSON.stringify(transformed)});`;
      case 'Meta':
        // node.properties is { key: string, value: ASTNode }[]
        // We compile to an array of entries to preserve duplicate keys (like multiple 'link' tags)
        const metaEntries = node.properties.map(p => `{ key: '${p.key}', value: ${this.visitExpression(p.value)} }`).join(', ');
        return `
          if (context && context.meta) {
            try {
              const entries = [ ${metaEntries} ];
              entries.forEach(entry => {
                 const key = entry.key;
                 const value = entry.value;
                 
                 if (key === 'link') {
                    const existing = context.meta[key];
                    const existingArray = Array.isArray(existing) ? existing : (existing ? [existing] : []);
                    const incomingArray = Array.isArray(value) ? value : (value ? [value] : []);
                    context.meta[key] = [...existingArray, ...incomingArray];
                 } else {
                    // For other keys, last one wins (standard object behavior)
                    context.meta[key] = value;
                 }
              });
            } catch(e) { console.error('Meta parse error:', e); }
          }
          __append("<!-- JIGSAW_META_HEAD -->");`;
      case 'Script':
        // Use JSON.stringify to safely escape quotes and special characters
        return `if (context && context.scripts) context.scripts.push({ content: ${JSON.stringify(node.content)} });`;
      case 'FnDefinition':
        const safeName = node.name;
        const safeArgs = node.args.replace(/"/g, '&quot;');
        const safeBody = node.body.replace(/<\/script>/gi, '<\\/script>');
        return `__append('<script type="jigsaw/fn" data-name="${safeName}" data-args="${safeArgs}">${safeBody}</script>');`;
      case 'Interpolation':
        // Handle @sync directive: {{ @sync user.name }}
        if (node.value.type === 'Identifier' && node.value.name === '@sync') {
          // This is a special case - we'll handle it differently
          // For now, treat it as an error since @sync needs an argument
          throw new Error('@sync requires a variable: {{ @sync variableName }}');
        }
        
        // Check if this is a member expression starting with @sync
        if (node.value.type === 'MemberExpression' && 
            node.value.object.type === 'Identifier' && 
            node.value.object.name === '@sync') {
          // {{ @sync user.name }} -> <span data-sync="user.name">value</span>
          const syncPath = this.getSyncPath(node.value);
          const valueExpr = this.visitExpression(node.value.property);
          return `__append('<span data-sync="' + ${JSON.stringify(syncPath)} + '">' + __escape(${valueExpr}) + '</span>');`;
        }
        
        if (node.value.type === 'CallExpression' && node.value.callee === 'safe') {
          // Inline the safe pipe: just append the first argument without escaping
          const arg = node.value.arguments[0];
          return `__append(${this.visitExpression(arg)});`;
        }
        return `__append(__escape(${this.visitExpression(node.value)}));`;
      case 'IfStatement':
        const condition = this.visitExpression(node.condition);
        const consequent = node.consequent.map(child => this.visit(child)).join('\n');
        const alternate = node.alternate ? node.alternate.map(child => this.visit(child)).join('\n') : '';
        return `if (${condition}) { ${consequent} } else { ${alternate} }`;
      case 'ForLoop':
        this.pushScope();
        this.addVar(node.item);
        this.addVar(`${node.item}_index`);
        this.addVar(`${node.item}_first`);
        this.addVar(`${node.item}_last`);
        
        const collection = this.visitExpression(node.collection);
        const body = node.body.map(child => this.visit(child)).join('\n');
        this.popScope();
        
        return `
        (function() {
          const __collection = ${collection};
          if (__collection && typeof __collection[Symbol.iterator] === 'function') {
            let __index = 0;
            const __length = Array.isArray(__collection) ? __collection.length : 0;
            for (const ${node.item} of __collection) {
               const ${node.item}_index = __index;
               const ${node.item}_first = __index === 0;
               const ${node.item}_last = __index === __length - 1;
               ${body}
               __index++;
            }
          }
        })();`;
      case 'Island':
        const islandBody = node.body.map(child => this.visit(child)).join('\n');
        return `__append('<div data-island="${node.name}" data-island-static>'); ${islandBody} __append('</div>');`;
      case 'Transition':
        const transitionBody = node.body.map(child => this.visit(child)).join('\n');
        return `__append('<div data-transition-type="${node.name}">'); ${transitionBody} __append('</div>');`;
      case 'Component':
        // Build props object if component has props
        let propsCode = 'data';
        let extraProps = [];
        
        if (node.props && Object.keys(node.props).length > 0) {
          const propEntries = Object.entries(node.props)
            .map(([key, value]) => `${key}: ${this.visitExpression(value)}`)
            .join(', ');
          extraProps.push(propEntries);
        }
        
        // Handle Body (Fragment)
        if (node.body && node.body.length > 0) {
            const bodyContent = node.body.map(child => this.visit(child)).join('\n');
            // We wrap the body in an IIFE that returns the rendered string
            // We must ensure __append captures to a local buffer or we use a separate helper
            // Actually, our current compile structure uses a local __output array.
            // If we nest, we need a NEW __output array.
            // So we can just call the main compile function recursively? 
            // No, 'visit' returns code that appends to __output.
            // So we need to create a new scope for __output.
            const fragmentCode = `(function() {
                const __output = [];
                function __append(str) { __output.push(str); }
                // We inherit other helpers (__escape, __get, etc) from parent scope
                ${bodyContent}
                return __output.join('');
            })()`;
            extraProps.push(`fragment: ${fragmentCode}`);
        }
        
        if (extraProps.length > 0) {
            propsCode = `Object.assign({}, data, { ${extraProps.join(', ')} })`;
        }
        
        // Wrap static components (islands) with data attribute
        if (node.isStatic) {
          return `__append('<div data-island="${node.name}" data-island-static>'); __append(helper.renderComponent('${node.name}', ${propsCode})); __append('</div>');`;
        }
        
        return `__append(helper.renderComponent('${node.name}', ${propsCode}));`;
      default:
        return '';
    }
  }

  private visitExpression(node: ASTNode): string {
    switch (node.type) {
      case 'Literal':
        return JSON.stringify(node.value);
      case 'ObjectLiteral':
        // @ts-ignore
        const props = node.properties.map(p => `${p.key}: ${this.visitExpression(p.value)}`).join(', ');
        return `{ ${props} }`;
      case 'Identifier':
        if (node.name === 'helper') return 'helper';
        if (this.hasVar(node.name)) {
          return node.name;
        }
        return `__get(data, '${node.name}')`;
      case 'MemberExpression':
        return `__get(${this.visitExpression(node.object)}, '${node.property.name}')`;
      case 'BinaryExpression':
        return `(${this.visitExpression(node.left)} ${node.operator} ${this.visitExpression(node.right)})`;
      case 'UnaryExpression':
        return `(${node.operator} ${this.visitExpression(node.argument)})`;
      case 'CallExpression':
        const args = node.arguments.map(arg => this.visitExpression(arg)).join(', ');
        return `pipes['${node.callee}'] ? pipes['${node.callee}'](${args}) : (function(){ throw new Error("Pipe '${node.callee}' not found"); })()`;
      case 'FunctionCall':
        const fnArgs = node.arguments.map(arg => this.visitExpression(arg)).join(', ');
        const callee = this.visitExpression(node.callee);
        return `__callFunction(${callee}, [${fnArgs}])`;
      default:
        return '""';
    }
  }

  private pushScope() {
    this.scope.push(new Set());
  }

  private popScope() {
    this.scope.pop();
  }

  private addVar(name: string) {
    this.scope[this.scope.length - 1].add(name);
  }

  private hasVar(name: string): boolean {
    for (let i = this.scope.length - 1; i >= 0; i--) {
      if (this.scope[i].has(name)) {
        return true;
      }
    }
    return false;
  }
  
  private getSyncPath(node: ASTNode): string {
    // Build the path for data-sync attribute
    // Example: @sync.user.name -> "user.name"
    if (node.type === 'MemberExpression') {
      const objectPath = this.getSyncPath(node.object);
      const propertyName = node.property.name || '';
      return objectPath ? `${objectPath}.${propertyName}` : propertyName;
    }
    if (node.type === 'Identifier') {
      return node.name === '@sync' ? '' : node.name;
    }
    return '';
  }
}
