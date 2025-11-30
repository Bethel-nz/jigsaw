import { expect, test, describe } from "bun:test";
import { Lexer } from '../src/lexer';
import { Parser } from '../src/parser';
import { TemplateError } from '../src/errors';

describe("Parser Robustness - Unclosed Tags", () => {
  test("detects unclosed if statement", () => {
    const tokens = new Lexer("{% if condition %}<div>Content</div>").tokenize();
    const parser = new Parser(tokens, undefined, "test");
    
    try {
      parser.parse();
      expect(true).toBe(false); // Should throw
    } catch (error: any) {
      expect(error).toBeInstanceOf(TemplateError);
      expect(error.message).toContain("Unclosed tag");
      expect(error.message).toContain("if");
    }
  });

  test("detects unclosed for loop", () => {
    const tokens = new Lexer("{% for item in items %}<span>{{ item }}</span>").tokenize();
    const parser = new Parser(tokens, undefined, "test");
    
    try {
      parser.parse();
      expect(true).toBe(false); // Should throw
    } catch (error: any) {
      expect(error).toBeInstanceOf(TemplateError);
      expect(error.message).toContain("Unclosed tag");
      expect(error.message).toContain("for");
    }
  });

  test("detects unclosed island", () => {
    const tokens = new Lexer('{% island "nav" %}<nav>Links</nav>').tokenize();
    const parser = new Parser(tokens, undefined, "test");
    
    try {
      parser.parse();
      expect(true).toBe(false); // Should throw
    } catch (error: any) {
      expect(error).toBeInstanceOf(TemplateError);
      expect(error.message).toContain("Unclosed tag");
      expect(error.message).toContain("island");
    }
  });

  test("detects unclosed transition", () => {
    const tokens = new Lexer('{% transition "fade" %}<main>Content</main>').tokenize();
    const parser = new Parser(tokens, undefined, "test");
    
    try {
      parser.parse();
      expect(true).toBe(false); // Should throw
    } catch (error: any) {
      expect(error).toBeInstanceOf(TemplateError);
      expect(error.message).toContain("Unclosed tag");
      expect(error.message).toContain("transition");
    }
  });

  test("detects multiple unclosed tags", () => {
    const tokens = new Lexer("{% if a %}{% for item in items %}<div>").tokenize();
    const parser = new Parser(tokens, undefined, "test");
    
    try {
      parser.parse();
      expect(true).toBe(false); // Should throw
    } catch (error: any) {
      expect(error).toBeInstanceOf(TemplateError);
      expect(error.message).toContain("Unclosed tag");
      // Should mention multiple tags
    }
  });

  test("allows properly closed tags", () => {
    const tokens = new Lexer("{% if show %}<div>Yes</div>{% endif %}").tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    expect(ast.body.length).toBeGreaterThan(0);
  });
});
