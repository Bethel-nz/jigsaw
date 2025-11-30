export class TemplateError extends Error {
  line: number;
  column: number;
  templateName?: string;
  templateSource?: string;

  constructor(
    message: string, 
    line: number, 
    column: number,
    templateName?: string,
    templateSource?: string
  ) {
    super(message);
    this.name = 'TemplateError';
    this.line = line;
    this.column = column;
    this.templateName = templateName;
    this.templateSource = templateSource;
  }

  /**
   * Format the error with source context and visual pointers
   * @returns Formatted error message with line context
   */
  format(): string {
    if (!this.templateSource) {
      return `${this.message} at ${this.templateName || 'template'}:${this.line}:${this.column}`;
    }
    
    const lines = this.templateSource.split('\n');
    const errorLine = lines[this.line - 1];
    
    if (!errorLine) {
      return `${this.message} at ${this.templateName || 'template'}:${this.line}:${this.column}`;
    }
    
    // Create visual pointer at error column
    const pointer = ' '.repeat(Math.max(0, this.column - 1)) + '^';
    
    // Get context lines (1 before, 1 after)
    const contextBefore = this.line > 1 ? lines[this.line - 2] : null;
    const contextAfter = this.line < lines.length ? lines[this.line] : null;
    
    // Line number width for alignment
    const maxLineNum = this.line + 1;
    const lineNumWidth = String(maxLineNum).length;
    const pad = (num: number) => String(num).padStart(lineNumWidth, ' ');
    
    let output = `\n${this.message}\n`;
    output += `  at ${this.templateName || 'template'}:${this.line}:${this.column}\n\n`;
    
    // Add context before
    if (contextBefore !== null) {
      output += `  ${pad(this.line - 1)} | ${contextBefore}\n`;
    }
    
    // Add error line with pointer
    output += `  ${pad(this.line)} | ${errorLine}\n`;
    output += `  ${' '.repeat(lineNumWidth)} | ${pointer}\n`;
    
    // Add context after
    if (contextAfter !== null) {
      output += `  ${pad(this.line + 1)} | ${contextAfter}\n`;
    }
    
    return output;
  }

  /**
   * Override toString to use formatted output
   */
  toString(): string {
    return this.format();
  }
}
