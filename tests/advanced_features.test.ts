import { describe, test, expect, beforeAll } from "bun:test";
import JigSaw from "../src/jigsaw";
import Knob from "../src/knob";

describe("Jigsaw Advanced Features", () => {
  beforeAll(() => {
    JigSaw.definePipe("upper", (val: any) => String(val).toUpperCase());
    JigSaw.definePipe("lower", (val: any) => String(val).toLowerCase());
    JigSaw.definePipe("reverse", (val: any) => String(val).split('').reverse().join(''));
    JigSaw.definePipe("double", (val: number) => val * 2);
  });

  test("Binary Expressions: Addition", () => {
    const template = "{{ 1 + 2 }}";
    const knob = new Knob(template);
    expect(knob.render({})).toBe("3");
  });

  test("Binary Expressions: Multiplication", () => {
    const template = "{{ 5 * 4 }}";
    const knob = new Knob(template);
    expect(knob.render({})).toBe("20");
  });

  test("Complex Expressions with Parentheses", () => {
    const template = "{{ (1 + 2) * 3 }}";
    const knob = new Knob(template);
    expect(knob.render({})).toBe("9");
  });

  test("Pipes: Simple", () => {
    const template = "{{ name |> upper }}";
    const knob = new Knob(template);
    expect(knob.render({ name: "jigsaw" })).toBe("JIGSAW");
  });
  
  test("Pipes: Chained", () => {
      const template = "{{ name |> upper |> reverse }}";
      const knob = new Knob(template);
      expect(knob.render({ name: "jigsaw" })).toBe("WASGIJ");
  });

  test("Logic Operators in If", () => {
    const template = "{% if age >= 18 && hasLicense %}Can Drive{% else %}Cannot Drive{% endif %}";
    const knob = new Knob(template);
    expect(knob.render({ age: 20, hasLicense: true })).toBe("Can Drive");
    expect(knob.render({ age: 16, hasLicense: true })).toBe("Cannot Drive");
    expect(knob.render({ age: 25, hasLicense: false })).toBe("Cannot Drive");
  });
  
  test("Dot Notation in Expressions", () => {
      const template = "{{ user.name |> upper }}";
      const knob = new Knob(template);
      expect(knob.render({ user: { name: "alice" } })).toBe("ALICE");
  });

  test("Comparison Operators", () => {
      const template = "{% if count > 10 %}High{% else %}Low{% endif %}";
      const knob = new Knob(template);
      expect(knob.render({ count: 15 })).toBe("High");
      expect(knob.render({ count: 5 })).toBe("Low");
  });
  
  test("For Loop with Index", () => {
      // Note: My compiler implementation for ForLoop needs to ensure _index is available.
      const template = "{% for item in items %}{{ item_index }}:{{ item }} {% endfor %}";
      const knob = new Knob(template);
      expect(knob.render({ items: ["a", "b", "c"] })).toBe("0:a 1:b 2:c ");
  });

  test("Component Rendering", () => {
      JigSaw.getComponent = (name: string) => {
          if (name === 'my-comp') return "Component: {{ value }}";
          return "";
      };
      
      const template = "{{{ 'my-comp' }}}";
      const knob = new Knob(template);
      expect(knob.render({ value: "Worked" })).toBe("Component: Worked");
  });

  test("Comments", () => {
      const template = "Before{# This is a comment #}After";
      const knob = new Knob(template);
      expect(knob.render({})).toBe("BeforeAfter");
  });
});
