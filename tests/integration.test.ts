import { expect, test, describe } from "bun:test";
import Knob from '../src/knob';
import JigSaw from '../src/jigsaw';

describe("Integration - Full Render Pipeline", () => {
  test("renders simple text", () => {
    const knob = new Knob("Hello World");
    const result = knob.render({});
    expect(result).toBe("Hello World");
  });

  test("renders variable interpolation", () => {
    const knob = new Knob("Hello {{ name }}!");
    const result = knob.render({ name: "Jigsaw" });
    expect(result).toContain("Hello Jigsaw!");
  });

  test("escapes HTML content", () => {
    const knob = new Knob("{{ content }}");
    const result = knob.render({ content: "<script>alert('xss')</script>" });
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  test("renders if statements", () => {
    const template = "{% if isAdmin %}Admin Panel{% else %}User Panel{% endif %}";
    const knob = new Knob(template);
    
    const result1 = knob.render({ isAdmin: true });
    expect(result1).toContain("Admin Panel");
    
    const result2 = knob.render({ isAdmin: false });
    expect(result2).toContain("User Panel");
  });

  test("renders for loops", () => {
    const template = "{% for item in items %}{{ item }}{% endfor %}";
    const knob = new Knob(template);
    const result = knob.render({ items: ["a", "b", "c"] });
    expect(result).toContain("abc");
  });

  test("provides loop metadata", () => {
    const template = "{% for item in items %}{% if item_first %}first{% endif %}{% endfor %}";
    const knob = new Knob(template);
    const result = knob.render({ items: [1, 2, 3] });
    expect(result).toContain("first");
    expect(result.match(/first/g)?.length).toBe(1);
  });

  test("uses custom pipes", () => {
    JigSaw.definePipe('reverse', (str: string) => str.split('').reverse().join(''));
    const knob = new Knob("{{ text | reverse }}");
    const result = knob.render({ text: "hello" });
    expect(result).toBe("olleh");
  });

  test("handles nested member access", () => {
    const knob = new Knob("{{ user.profile.name }}");
    const result = knob.render({
      user: {
        profile: {
          name: "Alice"
        }
      }
    });
    expect(result).toBe("Alice");
  });

  test("handles safe pipe for raw HTML", () => {
    const knob = new Knob("{{ html | safe }}");
    const result = knob.render({ html: "<strong>Bold</strong>" });
    expect(result).toContain("<strong>");
  });

  test("caches compiled templates", () => {
    const template = "{{ name }}";
    const knob = new Knob(template);
    
    const start = performance.now();
    knob.render({ name: "First" });
    const firstTime = performance.now() - start;
    
    const start2 = performance.now();
    knob.render({ name: "Second" });
    const secondTime = performance.now() - start2;
    
    // Second render should be much faster due to caching
    expect(secondTime).toBeLessThan(firstTime);
  });
});

describe("Integration - Complex Templates", () => {
  test("renders complex nested structures", () => {
    const template = `
      {% for user in users %}
        <div class="user">
          <h2>{{ user.name }}</h2>
          {% if user.posts %}
            {% for post in user.posts %}
              <p>{{ post.title }}</p>
            {% endfor %}
          {% endif %}
        </div>
      {% endfor %}
    `;
    
    const knob = new Knob(template);
    const result = knob.render({
      users: [
        { name: "Alice", posts: [{ title: "Post 1" }] },
        { name: "Bob", posts: [] }
      ]
    });
    
    expect(result).toContain("Alice");
    expect(result).toContain("Post 1");
    expect(result).toContain("Bob");
  });

  test("handles islands", () => {
    const template = '{% island "nav" %}<nav>Navigation</nav>{% endisland %}';
    const knob = new Knob(template);
    const result = knob.render({});
    expect(result).toContain('data-island="nav"');
    expect(result).toContain('data-island-static');
    expect(result).toContain('Navigation');
  });

  test("handles transitions", () => {
    const template = '{% transition "fade" %}<div>Content</div>{% endtransition %}';
    const knob = new Knob(template);
    const result = knob.render({});
    expect(result).toContain('data-transition-type="fade"');
    expect(result).toContain('Content');
  });

  test("processes meta tags", () => {
    const template = '@meta {{ title: "Test Page", description: "A test" }}';
    const knob = new Knob(template);
    const context = { meta: {}, scripts: [] };
    knob.render({}, context);
    expect(context.meta).toHaveProperty('title');
    expect(context.meta).toHaveProperty('description');
  });

  test("collects script tags", () => {
    const template = '@script(src="/app.js" defer)';
    const knob = new Knob(template);
    const context = { meta: {}, scripts: [] };
    knob.render({}, context);
    expect(context.scripts.length).toBeGreaterThan(0);
  });
});

describe("Integration - Edge Cases", () => {
  test("handles empty template", () => {
    const knob = new Knob("");
    const result = knob.render({});
    expect(result).toBe("");
  });

  test("handles template with only whitespace", () => {
    const knob = new Knob("   \n  \t  ");
    const result = knob.render({});
    expect(result).toMatch(/^\s+$/);
  });

  test("handles missing data gracefully", () => {
    const knob = new Knob("{{ missing.prop.deep }}");
    const result = knob.render({});
    expect(result).toBe("");
  });

  test("handles arrays in templates", () => {
    const knob = new Knob("{% for item in items %}{{ item }}{% endfor %}");
    const result = knob.render({ items: [] });
    expect(result.trim()).toBe("");
  });

  test("handles boolean conditions", () => {
    const knob = new Knob("{% if flag %}yes{% endif %}");
    expect(knob.render({ flag: true })).toContain("yes");
    expect(knob.render({ flag: false })).not.toContain("yes");
    expect(knob.render({ flag: 0 })).not.toContain("yes");
    expect(knob.render({ flag: "" })).not.toContain("yes");
  });

  test("handles special characters in text", () => {
    const knob = new Knob("© 2024 & Company™");
    const result = knob.render({});
    expect(result).toContain("©");
    expect(result).toContain("&");
    expect(result).toContain("™");
  });
});
