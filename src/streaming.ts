import Knob from './knob';
import { TemplateData } from './types';

/**
 * Streaming HTML renderer for large templates
 * Breaks template into chunks and yields them progressively
 */
export class StreamingRenderer {
  /**
   * Render template as async stream
   * Useful for large pages to improve TTFB
   */
  async *renderStream(
    template: string,
    data: TemplateData,
    templateName?: string,
    chunkSize: number = 1000
  ): AsyncGenerator<string> {
    const knob = new Knob(template, templateName);
    
    // For now, render entire template
    // In future, could parse and yield chunks of AST
    const html = knob.render(data);
    
    // Yield in chunks
    for (let i = 0; i < html.length; i += chunkSize) {
      yield html.slice(i, i + chunkSize);
    }
  }
  
  /**
   * Render template as Node.js stream
   * Compatible with http.ServerResponse
   */
  async renderToStream(
    template: string,
    data: TemplateData,
    templateName?: string
  ): Promise<ReadableStream<string>> {
    const knob = new Knob(template, templateName);
    const html = knob.render(data);
    
    return new ReadableStream({
      start(controller) {
        // Stream in chunks of 16KB
        const chunkSize = 16384;
        let position = 0;
        
        const push = () => {
          if (position >= html.length) {
            controller.close();
            return;
          }
          
          const chunk = html.slice(position, position + chunkSize);
          controller.enqueue(chunk);
          position += chunkSize;
          
          // Use setTimeout to avoid blocking
          setTimeout(push, 0);
        };
        
        push();
      }
    });
  }
  
  /**
   * Stream helper for HTTP responses
   * Usage: res.write(await StreamingRenderer.streamToResponse(...))
   */
  static async *streamToResponse(
    template: string,
    data: TemplateData,
    templateName?: string
  ): AsyncGenerator<Buffer> {
    const renderer = new StreamingRenderer();
    
    for await (const chunk of renderer.renderStream(template, data, templateName)) {
      yield Buffer.from(chunk, 'utf-8');
    }
  }
}

/**
 * Helper to stream template to HTTP response
 * 
 * @example
 * ```typescript
 * JigSaw.route('/large-page', async (params, req, res) => {
 *   res.writeHead(200, { 'Content-Type': 'text/html' });
 *   
 *   for await (const chunk of streamTemplate('large-page', data)) {
 *     res.write(chunk);
 *   }
 *   
 *   res.end();
 * });
 * ```
 */
export async function* streamTemplate(
  templateName: string,
  data: TemplateData
): AsyncGenerator<Buffer> {
  // This would need access to JigSaw.getTemplate()
  // For now, it's a placeholder showing the pattern
  const template = `<!-- Template: ${templateName} -->`;
  const renderer = new StreamingRenderer();
  
  for await (const chunk of renderer.renderStream(template, data, templateName)) {
    yield Buffer.from(chunk, 'utf-8');
  }
}
