import { TemplateError } from './errors';

export interface ErrorContext {
  error: Error;
  templateName?: string;
  templatePath?: string;
  generatedCode?: string;
  errorLine?: number;
  errorColumn?: number;
}

export function formatErrorPage(context: ErrorContext): string {
  const { error, templateName, templatePath, generatedCode, errorLine, errorColumn } = context;
  
  const stackTrace = error.stack || '';
  const errorType = error.constructor.name;
  
  // Use formatted message for TemplateError, raw message for others
  const message = error instanceof TemplateError ? error.format() : error.message;
  
  // Extract relevant stack lines
  const stackLines = stackTrace.split('\n').slice(1, 10);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - ${errorType}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Geist Mono', 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
      background: #0a0a0a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      color: #ededed;
    }
    
    .error-container {
      max-width: 800px;
      width: 100%;
      background: #0a0a0a;
      border: 1px solid #333;
      border-radius: 0;
    }
    
    .error-header {
      padding: 1.5rem;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: flex-start;
      gap: 1rem;
    }
    
    .error-icon {
      color: #ff4444;
      font-size: 1.2rem;
      line-height: 1.4;
    }
    
    .error-type {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #666;
      margin-bottom: 0.5rem;
    }
    
    .error-message {
      font-size: 1.1rem;
      color: #ededed;
      line-height: 1.4;
      font-weight: 500;
    }
    
    .error-body {
      padding: 1.5rem;
    }
    
    .section {
      margin-bottom: 2rem;
    }
    
    .section:last-child {
      margin-bottom: 0;
    }
    
    .section-title {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #444;
      margin-bottom: 1rem;
      font-weight: 600;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 1rem 2rem;
      font-size: 0.875rem;
    }
    
    .info-label {
      color: #666;
    }
    
    .info-value {
      color: #a1a1a1;
      font-family: monospace;
    }
    
    .code-block {
      background: #000;
      border: 1px solid #333;
      border-radius: 0;
      overflow: hidden;
    }
    
    .code-header {
      background: #111;
      padding: 0.5rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #333;
    }
    
    .code-title {
      font-size: 0.75rem;
      color: #666;
    }
    
    .toggle-btn {
      background: transparent;
      color: #666;
      border: 1px solid #333;
      padding: 0.25rem 0.75rem;
      cursor: pointer;
      font-size: 0.7rem;
      transition: all 0.2s;
    }
    
    .toggle-btn:hover {
      color: #ededed;
      border-color: #666;
    }
    
    .code-content {
      padding: 1rem;
      overflow-x: auto;
      max-height: 400px;
      overflow-y: auto;
      font-size: 0.85rem;
      color: #888;
    }
    
    .code-content.collapsed {
      display: none;
    }
    
    pre {
      margin: 0;
      font-family: inherit;
    }
    
    .stack-line {
      padding: 0.15rem 0;
      color: #666;
    }
    
    .stack-line:first-child {
      color: #a1a1a1;
    }
    
    .stack-line span {
      color: #444;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-header">
      <div class="error-icon">●</div>
      <div>
        <div class="error-type">${errorType}</div>
        <div class="error-message">${escapeHtml(error instanceof TemplateError ? error.message : message)}</div>
      </div>
    </div>
    
    <div class="error-body">
      ${error instanceof TemplateError && error.templateSource ? `
      <div class="section">
        <div class="section-title">Error Details ${error.templateName ? `<span style="color: #888; font-weight: normal; margin-left: 1rem;">${error.templateName}.jig</span>` : ''}</div>
        <div class="code-block">
          <div class="code-content" style="max-height: none;">
            <pre style="color: #ff6666;">${escapeHtml(error.format())}</pre>
          </div>
        </div>
      </div>
      ` : message !== error.message ? `
      <div class="section">
        <div class="section-title">Error Details</div>
        <div class="code-block">
          <div class="code-content" style="max-height: none;">
            <pre style="color: #ff6666;">${escapeHtml(message)}</pre>
          </div>
        </div>
      </div>
      ` : ''}
      
      ${error instanceof TemplateError && error.templateSource ? `
      <div class="section">
        <div class="code-block">
          <div class="code-header">
            <div class="code-title">Template Source ${error.templateName ? `<span style="color: #888; font-weight: normal; margin-left: 0.5rem;">${error.templateName}.jig</span>` : ''}</div>
            <button class="toggle-btn" onclick="toggleCode(this)">Show</button>
          </div>
          <div class="code-content collapsed">
            <pre>${error.templateSource.split(/\r?\n/).map((line, i) => {
              const lineNum = i + 1;
              const isErrorLine = lineNum === error.line;
              return `<div class="stack-line" style="color: ${isErrorLine ? '#ff6666' : '#666'}; background: ${isErrorLine ? 'rgba(255, 102, 102, 0.1)' : 'transparent'}; padding: 0.15rem 0.5rem; margin: 0 -0.5rem;">${String(lineNum).padStart(3, ' ')} | ${escapeHtml(line)}</div>`;
            }).join('')}</pre>
          </div>
        </div>
      </div>
      ` : ''}
      
      <div class="section">
        <div class="code-block">
          <div class="code-header">
            <div class="code-title">Stack Trace</div>
            <button class="toggle-btn" onclick="toggleCode(this)">Show</button>
          </div>
          <div class="code-content collapsed">
            <pre>${stackLines.map(line => `<div class="stack-line">${escapeHtml(line.trim())}</div>`).join('')}</pre>
          </div>
        </div>
      </div>
      
      ${generatedCode ? `
      <div class="section">
        <div class="code-block">
          <div class="code-header">
            <div class="code-title">Generated Source</div>
            <button class="toggle-btn" onclick="toggleCode(this)">Show</button>
          </div>
          <div class="code-content collapsed">
            <pre>${escapeHtml(generatedCode)}</pre>
          </div>
        </div>
      </div>
      ` : ''}
    </div>
  </div>
  
  <script>
    function toggleCode(btn) {
      const content = btn.closest('.code-block').querySelector('.code-content');
      const isCollapsed = content.classList.contains('collapsed');
      content.classList.toggle('collapsed');
      btn.textContent = isCollapsed ? 'Hide' : 'Show';
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
