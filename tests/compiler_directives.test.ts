import { describe, test, expect } from 'bun:test';
import Knob from '../src/knob';
import { JSDOM } from 'jsdom';

describe('Compiler Directives', () => {
  const compileToDOM = (template: string) => {
    const knob = new Knob(template);
    const html = knob.render({}, { meta: {}, scripts: [] }).trim();
    const dom = new JSDOM(html);
    return dom.window.document.body.firstChild as HTMLElement;
  };

  test('@sync compilation', () => {
    const el = compileToDOM('<div @sync="user-data">Content</div>');

    expect(el.getAttribute('data-sync')).toBe('user-data');
    expect(el.hasAttribute('@sync')).toBe(false);
  });

  test('@sync with single quotes', () => {
    const el = compileToDOM("<div @sync='user-data'>Content</div>");
    expect(el.getAttribute('data-sync')).toBe('user-data');
  });

  test('@click compilation', () => {
    const el = compileToDOM('<button @click="handleClick()">Click Me</button>');

    expect(el.getAttribute('data-on-click')).toBe('handleClick()');
    expect(el.hasAttribute('@click')).toBe(false);
  });

  test('@input compilation', () => {
    const el = compileToDOM('<input @input="$state.val = $el.value" />');
    expect(el.getAttribute('data-on-input')).toBe('$state.val = $el.value');
  });

  test('Multiple directives', () => {
    const el = compileToDOM('<div @sync="item" @click="select()"></div>');

    expect(el.getAttribute('data-sync')).toBe('item');
    expect(el.getAttribute('data-on-click')).toBe('select()');
  });

  test('Mouse events', () => {
    const el = compileToDOM(
      '<div @mouseenter="hover()" @mouseleave="leave()"></div>',
    );

    expect(el.getAttribute('data-on-mouseenter')).toBe('hover()');
    expect(el.getAttribute('data-on-mouseleave')).toBe('leave()');
  });

  test('Custom/Generic events', () => {
    // Should verify that ANY event is supported
    const el = compileToDOM(
      '<div @custom-event="handle()" @add="addItem()"></div>',
    );

    expect(el.getAttribute('data-on-custom-event')).toBe('handle()');
    expect(el.getAttribute('data-on-add')).toBe('addItem()');
    expect(el.hasAttribute('@custom-event')).toBe(false);
  });

  test('Reserved directives are transformed correctly (Order Check)', () => {
    // @state should become data-state, NOT data-on-state
    const el = compileToDOM('<input @state="user.name" @click="save()">');

    expect(el.getAttribute('data-state')).toBe('user.name');
    expect(el.hasAttribute('data-on-state')).toBe(false);

    // @click should still become data-on-click
    expect(el.getAttribute('data-on-click')).toBe('save()');
  });

  test('Reserved directives are NOT transformed to events', () => {
    // @sync, @state, etc should be handled by their specific rules, NOT the generic event rule
    // The generic rule should skip them so the specific rules can pick them up (or vice versa depending on order)
    // In my implementation, I made the generic rule explicitly skip them.
    const el = compileToDOM('<div @sync="foo" @state="bar"></div>');

    expect(el.getAttribute('data-sync')).toBe('foo');
    expect(el.getAttribute('data-state')).toBe('bar');

    // Should NOT have data-on-sync
    expect(el.hasAttribute('data-on-sync')).toBe(false);
  });
});
