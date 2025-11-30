import { expect, test, describe } from "bun:test";
import Knob from '../src/knob';

describe("Knob Engine", () => {
  test("renders basic variables", () => {
    const template = "<h1>{{ title }}</h1>";
    const data = { title: "Hello World" };
    const knob = new Knob(template);
    expect(knob.render(data)).toBe("<h1>Hello World</h1>");
  });

  test("renders nested properties (dot notation)", () => {
    const template = "<p>{{ user.name }}</p>";
    const data = { user: { name: "Alice" } };
    const knob = new Knob(template);
    expect(knob.render(data)).toBe("<p>Alice</p>");
  });

  test("handles if statements", () => {
    const template = "{% if show %}Visible{% else %}Hidden{% endif %}";
    const knob = new Knob(template);
    expect(knob.render({ show: true })).toBe("Visible");
    expect(knob.render({ show: false })).toBe("Hidden");
  });

  test("handles for loops", () => {
    const template = "<ul>{% for user in users %}<li>{{ user.name }}</li>{% endfor %}</ul>";
    const data = { users: [{ name: "Alice" }, { name: "Bob" }] };
    const knob = new Knob(template);
    const result = knob.render(data);
    expect(result).toContain("<li>Alice</li>");
    expect(result).toContain("<li>Bob</li>");
  });
  
  test("handles complex nesting", () => {
      const template = `
        {% for user in users %}
            {% if user.isAdmin %}
                Admin: {{ user.name }}
            {% endif %}
        {% endfor %}
      `;
      const data = {
          users: [
              { name: "Alice", isAdmin: true },
              { name: "Bob", isAdmin: false }
          ]
      };
      const knob = new Knob(template);
      const result = knob.render(data);
      expect(result).toContain("Admin: Alice");
      expect(result).not.toContain("Admin: Bob");
  });
});
