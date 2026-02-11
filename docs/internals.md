# Jigsaw Internals: Compiler & Router

This document explains how Jigsaw converts your templates into working, reactive HTML.

## 1. The Compiler Pipeline

Jigsaw uses a 3-stage compilation process:

1.  **Lexer (`src/lexer.ts`)**: Scans the template string and converts it into a stream of tokens (Text, OpenTag, CloseTag, Identifier, etc.).
2.  **Parser (`src/parser.ts`)**: Consumes tokens to build an Abstract Syntax Tree (AST).
    - It understands structure (`IfStatement`, `ForLoop`).
    - It handles HTML attributes vs Directives (`@fn`, `@click`).
    - **Crucial Detail**: Interpolations like `{{ value }}` are treated as separate AST nodes, splitting text content.
3.  **Compiler (`src/compiler.ts`)**: Traverses the AST and generates JavaScript code.
    - This code returns a string (the rendered HTML).
    - It transforms directives into standard HTML attributes that the client runtime can understand.

### Directive Transformation

Directives are syntax sugar that gets compiled into `data-` attributes.

| Template Syntax | Compiled Output              |
| :-------------- | :--------------------------- |
| `@init="value"` | `data-init="value"`          |
| `@state="user"` | `data-state="user"`          |
| `@ref="box"`    | `data-ref="box"`             |
| `@sync`         | `data-sync`                  |
| `@click="code"` | `data-on-click="handler_id"` |

**Refactoring Note**: Previously, the compiler tried to match `@init="..."` using a strict Regex. This failed when the value contained interpolations (like `@init='{{ data | json }}'`) because the parser split the value into multiple nodes. The fix relaxed this to just replace the `@init=` prefix, allowing the value to be complex.

## 2. The Runtime (`jigsaw-router.js`)

The client-side runtime is a lightweight (24KB) library that brings the static HTML to life.

### Initialization Phase (`DOMContentLoaded`)

1.  **Event Delegation**: Sets up a global listener on `document` for all standard events (`click`, `input`, etc.).
2.  **`initState()`**: Scans for elements with `[data-init]`.
    - Reads the value.
    - If it starts with `{` or `[`, it parses it as JSON.
    - Populates the global `appState` reactive proxy.
    - _This is where your `addToCart` fix lives: ensuring `data-init` is valid so `$state.product` is populated._
3.  **`scanFunctions()`**: Looks for `<script type="jigsaw/fn">` blocks (compiled from `@fn`).
    - Registers them in a `functionRegistry` paired with their DOM element.
    - Allows scoping logic to specific parts of the DOM.
4.  **`runInitHandlers()`**: Executes any custom init logic.

### Reactivity System

Jigsaw uses a `Proxy` based state system (`appState`).

- **Get**: Accessing `$state.user` reads from the proxy.
- **Set**: Writing `$state.user = ...` triggers:
  - **Effects**: Runs any `$effect(() => ...)` registered functions.
  - **Bindings**: Updates any DOM elements with `data-state="user"` (two-way binding).

### Navigation (SPA Mode)

When clicking a link:

1.  Intercepts the click.
2.  Fetches the new HTML page via `fetch()`.
3.  **Smart Sync**: Before swapping content, it captures the state of "Islands" (`[data-island]`).
4.  Updates the DOM (using View Transitions if available).
5.  **Restore**: Re-injects the preserved island state into the new DOM, merging it with new server data.
6.  Re-runs `initState()` for new elements.

## 3. The `addToCart` Fix

Your issue was:

1.  Template: `<button @init='{{ product | json }}'>`
2.  Compiler (Old): Failed to regex match `@init`, so output was `<button @init='{...}'>`.
3.  Browser: Has non-standard attribute `@init`.
4.  Runtime: `initState` looks for `data-init`. Finds nothing.
    - `$state.product` remains `undefined`.
5.  Click: `addToCart($state.product)` passes `undefined`.
6.  Handler: `JSON.parse(JSON.stringify(undefined))` crashes with Syntax Error.

**Fixed Flow:**

1.  Compiler (New): Sees `@init=`, replaces with `data-init=`.
2.  Output: `<button data-init='{"id": 1, ...}'>`.
3.  Runtime: `initState` finds `data-init`. Parses JSON. Sets `$state.product`.
4.  Click: Works!
