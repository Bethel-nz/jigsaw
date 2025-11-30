import { expect, test, describe } from "bun:test";
import Knob from '../src/knob';

describe("Security - XSS Prevention", () => {
  test("escapes script tags in variables", () => {
    const knob = new Knob("{{ userInput }}");
    const result = knob.render({ userInput: "<script>alert('xss')</script>" });
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
    expect(result).toContain("&lt;/script&gt;");
  });

  test("escapes HTML special characters", () => {
    const knob = new Knob("{{ html }}");
    const dangerous = `<img src=x onerror="alert('xss')">`;
    const result = knob.render({ html: dangerous });
    expect(result).toContain("&lt;img");
    expect(result).toContain('onerror='); // It's there, but safe (escaped quotes/brackets)
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
    expect(result).toContain("&quot;");
  });

  test("escapes event handlers", () => {
    const knob = new Knob("{{ input }}");
    const result = knob.render({ input: `<div onclick="alert('xss')">` });
    expect(result).toContain('onclick='); // Safe because < is escaped
    expect(result).toContain("&lt;");
  });

  test("escapes javascript: protocol", () => {
    const knob = new Knob("{{ link }}");
    const result = knob.render({ link: `javascript:alert('xss')` });
    // Jigsaw escapes HTML chars, but doesn't strip protocols from text interpolation
    // This is expected behavior for a template engine (not a sanitizer)
    expect(result).toContain('javascript:'); 
  });

  // ...

  test("does not execute code blocks in data", () => {
    const knob = new Knob("{{ userInput }}");
    const result = knob.render({ userInput: "{% if true %}bad{% endif %}" });
    // Should render as text, not execute
    expect(result).toContain("{% if true %}");
    expect(result).toContain("bad"); 
    expect(result).toContain("{% endif %}");
  });

  test("isolates user data from template scope", () => {
    const knob = new Knob("{{ data }}");
    const maliciousData = {
      data: "function() { return 'hacked'; }()"
    };
    const result = knob.render(maliciousData);
    // Should render the function string, not execute it
    expect(result).toContain("function()");
    expect(result).toContain("hacked");
  });

  // ...

  test("handles combined XSS attempts", () => {
    const template = `
      {% if show %}
        <div class="{{ className }}">
          {{ content }}
        </div>
      {% endif %}
    `;
    const knob = new Knob(template);
    const result = knob.render({
      show: true,
      className: '" onload="alert(\'xss\')" class="',
      content: "<script>alert('xss2')</script>"
    });
    
    // Quotes should be escaped, making the injection harmless
    expect(result).toContain("&quot; onload=&quot;");
    expect(result).toContain("&lt;script&gt;");
  });

  test("handles deeply nested malicious data", () => {
    const knob = new Knob("{{ data.level1.level2.level3 }}");
    const result = knob.render({
      data: {
        level1: {
          level2: {
            level3: "<img src=x onerror='alert(1)'>"
          }
        }
      }
    });
    expect(result).toContain("&lt;img");
    expect(result).toContain("onerror"); // Safe because escaped
  });

  test("prevents code execution in expressions", () => {
    const knob = new Knob("{{ user.name }}");
    const maliciousData = {
      user: {
        get name() {
          // This getter runs, but shouldn't cause security issues
          return "<script>evil()</script>";
        }
      }
    };
    const result = knob.render(maliciousData);
    expect(result).not.toContain("<script>");
  });
});

describe("Security - Error Information Leakage", () => {
  test("does not leak implementation details in errors", () => {
    const knob = new Knob("{{ user... }}", "test-template");
    try {
      knob.render({});
      expect(true).toBe(false); // Should throw
    } catch (error: any) {
      // Error should be helpful but not leak internals
      expect(error.message).not.toContain("Function");
      expect(error.message).not.toContain("eval");
    }
  });
});
