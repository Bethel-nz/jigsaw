// Client-side router with Island persistence, Smart Sync, and View Transitions
(function () {
	'use strict';

	// Check if View Transitions API is supported
	const supportsViewTransitions = 'startViewTransition' in document;

	// Store for island state preservation
	const islandStates = new Map();

	// Store functions mapped by DOM element
	const functionRegistry = new WeakMap();

	// Reveal-on-scroll observer.
	// Any element with `@observe` (compiled to `data-observe`) gets the class
	// named in its value (default "visible") added when it intersects the
	// viewport. The CSS owns the transition; the engine just flips the class.
	// Optional `data-stagger` (in ms) sets transition-delay so siblings reveal
	// sequentially.
	function setupRevealObserver() {
		const items = document.querySelectorAll('[data-observe]:not([data-observed])');
		if (!items.length) return;
		if (typeof IntersectionObserver === 'undefined') {
			items.forEach(el => {
				el.setAttribute('data-observed', '');
				const cls = el.getAttribute('data-observe') || 'visible';
				el.classList.add(cls);
			});
			return;
		}
		const obs = new IntersectionObserver((entries) => {
			entries.forEach(e => {
				if (e.isIntersecting) {
					const cls = e.target.getAttribute('data-observe') || 'visible';
					e.target.classList.add(cls);
					obs.unobserve(e.target);
				}
			});
		}, { threshold: 0.05 });
		items.forEach((el, i) => {
			el.setAttribute('data-observed', '');
			const stagger = parseInt(el.getAttribute('data-stagger') || '0', 10);
			if (stagger > 0) el.style.transitionDelay = (i * stagger) + 'ms';
			obs.observe(el);
		});
	}

	function scanFunctions(rootElement = document) {
		const scripts = rootElement.querySelectorAll('script[type="jigsaw/fn"]');

		// First pass: collect all function definitions per parent
		const parentFunctions = new Map();
		scripts.forEach(script => {
			const name = script.getAttribute('data-name');
			const args = script.getAttribute('data-args') || '';
			const body = script.textContent;
			const parent = script.parentElement || document.body;

			if (!parentFunctions.has(parent)) {
				parentFunctions.set(parent, []);
			}
			parentFunctions.get(parent).push({ name, args, body });
		});

		// Second pass: create functions with access to siblings
		parentFunctions.forEach((funcs, parent) => {
			let scope = functionRegistry.get(parent) || {};

			// Build list of all sibling function names
			const siblingNames = funcs.map(f => f.name);

			// Create function factories
			funcs.forEach(({ name, args, body }) => {
				scope[name] = () => {
					// Check if body is an ID (pre-compiled @fn support)
					if (body.trim().startsWith('jg_')) {
						const handlerId = body.trim();
						return function (...args) {
							// Lazy lookup allows handlers to be loaded asynchronously
							const handler = window.__JIGSAW_HANDLERS && window.__JIGSAW_HANDLERS[handlerId];

							if (typeof handler === 'function') {
								// Apply 'this' context ($el, $state, siblings) to the compiled handler
								return handler.apply(this, args);
							} else {
								console.error(`[Jigsaw] Handler "${handlerId}" for function "${name}" not found in registry.`);
							}
						};
					}

					// Legacy behavior (unsafe-eval)
					const params = args.split(',').map(a => a.trim()).filter(a => a);

					// Build preamble with context values
					let preamble = 'const $el = this.$el; const $state = this.$state; const $ref = this.$ref; const $effect = this.$effect; const $http = this.$http;';

					// Add all sibling function references from context
					siblingNames.forEach(sibName => {
						preamble += `\nconst ${sibName} = this.${sibName};`;
					});

					try {
						return new Function(...params, preamble + '\n' + body);
					} catch (e) {
						console.error('[Jigsaw] Error creating function:', name, e);

						return () => { }; // return broken fn to prevent crash
					}
				};
			});

			functionRegistry.set(parent, scope);
		});
	}

	// --- Reactive State Management ---
	const stateData = {};
	const globalEffects = []; // Array of {fn, watch} objects

	// Batching System
	const pendingKeys = new Set();
	let isFlushPending = false;

	function flushEffects() {
		if (pendingKeys.size === 0) return;

		const keysToProcess = Array.from(pendingKeys);
		pendingKeys.clear();
		isFlushPending = false;



		// Find all effects that need to run
		const effectsToRun = new Set();

		globalEffects.forEach(effect => {
			if (!effect.watch) {
				// No watch = run on any change
				effectsToRun.add(effect);
			} else if (effect.watch !== 'strict') {
				// Watch list: check if any changed key is in the watch list
				const shouldRun = keysToProcess.some(key => effect.watch.includes(key));
				if (shouldRun) effectsToRun.add(effect);
			}
		});

		effectsToRun.forEach(e => {
			try {
				e.fn(appState);
			} catch (err) {
				console.error('[effect] Error:', err);
			}
		});
	}

	function scheduleUpdate(key) {
		pendingKeys.add(key);
		if (!isFlushPending) {
			isFlushPending = true;
			queueMicrotask(flushEffects);
		}
	}

	// $effect(fn) - runs on all state changes
	// $effect(fn, ['tasks']) - only runs when 'tasks' changes
	// $effect(fn, 'strict') - never auto-runs, only initial
	function $effect(fn, watch = null) {
		if (watch === 'strict') {
			// Strict mode: run once, never auto-trigger
			fn(appState);
			return;
		}
		globalEffects.push({ fn, watch });
		fn(appState); // Initial run
	}

	function $http(url, options = {}) {
		return fetch(url, options).then(res => {
			if (!res.ok) throw new Error(res.statusText);
			const contentType = res.headers.get("content-type");
			if (contentType && contentType.includes("application/json")) {
				return res.json();
			}
			return res.text();
		});
	}

	/* 
		CSP Note: Jigsaw now uses pre-compiled event handlers to avoid 'unsafe-eval'.
		Handlers are stored in window.__JIGSAW_HANDLERS and referenced by ID.
	*/

	function notifyEffects(changedKey) {
		scheduleUpdate(changedKey);
	}

	function reactive(obj, path = '') {
		if (typeof obj !== 'object' || obj === null) return obj;

		return new Proxy(obj, {
			get(target, prop) {
				// Skip tracking for Symbol properties (like Symbol.iterator)
				if (typeof prop === 'symbol') {
					return target[prop];
				}
				const value = target[prop];
				const cleanPath = path ? `${path}.${prop}` : prop;
				if (typeof value === 'object' && value !== null) {
					return reactive(value, cleanPath);
				}
				return value;
			},
			set(target, prop, value) {
				const oldVal = target[prop];
				target[prop] = value;

				if (oldVal !== value) {
					// Notify effects watching this key
					const rootKey = path ? path.split('.')[0] : prop;
					notifyEffects(rootKey);

					// Dynamic UI Binding for nested keys
					const fullPath = path ? `${path}.${prop}` : prop;
					updateStateBindings(fullPath, value);

				}
				return true;
			}
		});
	}

	const appState = reactive(stateData);

	// Expose state on root element for global helpers (e.g., cart functions)
	const _root = document.getElementById('jigsaw-root');
	if (_root) _root.__jigsaw_state = appState;

	function updateStateBindings(key, value) {
		const elements = document.querySelectorAll(`[data-state="${key}"]`);
		elements.forEach(el => {
			if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
				if (el.value !== String(value)) el.value = value;
			} else {
				if (value !== null && typeof value === 'object') return;
				el.textContent = value;
			}
		});
	}

	function initState() {
		const elements = document.querySelectorAll('[data-init]');
		elements.forEach(el => {
			const key = el.getAttribute('data-state');
			const initVal = el.getAttribute('data-init');
			if (key && initVal !== null) {
				// Try to parse number or boolean, otherwise string
				let val = initVal;

				if (initVal === 'undefined') {
					val = undefined;
				} else if (!isNaN(Number(initVal))) {
					val = Number(initVal);
				} else if (initVal === 'true') {
					val = true;
				} else if (initVal === 'false') {
					val = false;
				} else if (initVal.startsWith('{') || initVal.startsWith('[')) {
					try {
						val = JSON.parse(initVal);
					} catch (e) {
						console.warn('[Jigsaw] Failed to parse init val:', initVal, e);
					}
				}

				if (appState[key] === undefined) { appState[key] = val; } else { updateStateBindings(key, appState[key]); }
			}
		});
	}

	// Sync reactive data in islands (Smart Islands)
	function syncIslands(newDoc) {
		const liveIslands = document.querySelectorAll('[data-island-static]');
		liveIslands.forEach(liveIsland => {
			const name = liveIsland.getAttribute('data-island');
			const newIsland = newDoc.querySelector(`[data-island="${name}"]`);

			if (newIsland) {
				// Find elements requesting updates via data-bind
				const boundElements = newIsland.querySelectorAll('[data-bind]');
				boundElements.forEach(newEl => {
					const bindKey = newEl.getAttribute('data-bind');
					const liveEl = liveIsland.querySelector(`[data-bind="${bindKey}"]`);

					if (liveEl) {
						// Update content and attributes
						liveEl.innerHTML = newEl.innerHTML;
						if (newEl.hasAttribute('class')) liveEl.className = newEl.className;
					}
				});
			}
		});
	}

	// Save state of all islands before navigation
	function saveIslandStates() {
		const islands = document.querySelectorAll('[data-island-static]');
		islands.forEach(island => {
			const islandName = island.getAttribute('data-island');
			if (islandName) {
				// Store the ACTUAL node to preserve state
				islandStates.set(islandName, island);
			}
		});
	}

	// Restore island states after new content loads
	function restoreIslandStates(newDoc) {
		islandStates.forEach((savedIsland, islandName) => {
			// 1. Find the NEW version of this island from server response
			const newIslandVersion = newDoc.querySelector(`[data-island="${islandName}"]`);

			// 2. **SMART SYNC**: Patch the saved island with new data
			if (newIslandVersion) {
				// Find all elements with data-sync in the NEW island
				const newSyncs = newIslandVersion.querySelectorAll('[data-sync]');

				newSyncs.forEach(newEl => {
					const syncKey = newEl.getAttribute('data-sync');

					// Find the matching element in the OLD (saved) island
					const oldEl = savedIsland.querySelector(`[data-sync="${syncKey}"]`);

					if (oldEl) {
						// Update content while keeping the element alive
						if (oldEl.innerHTML !== newEl.innerHTML) {
							oldEl.innerHTML = newEl.innerHTML;
						}
					}
				});
			}

			// 3. Now put the (patched) saved island back into the DOM
			const currentIsland = document.querySelector(`[data-island="${islandName}"][data-island-static]`);
			if (currentIsland && currentIsland.parentNode) {
				currentIsland.parentNode.replaceChild(savedIsland, currentIsland);
			}
		});

		// 4. Re-apply preserved state to all data-state bindings.
		// Fresh DOM (from innerHTML reset) shows server placeholders even though
		// appState still holds live values. The proxy's `set` trap only fires
		// bindings on actual change, so push current values manually.
		Object.keys(stateData).forEach(key => {
			const value = stateData[key];
			if (value !== undefined && (typeof value !== 'object' || value === null)) {
				updateStateBindings(key, value);
			}
		});
	}

	// Execute scripts in the new content
	function executeScripts(container) {
		const scripts = container.querySelectorAll('script');
		scripts.forEach(oldScript => {
			const newScript = document.createElement('script');
			Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
			newScript.textContent = oldScript.textContent;
			oldScript.parentNode.replaceChild(newScript, oldScript);
		});
	}

	// Navigate to a new page
	                async function navigate(url, transitionType) {
                try {
                        window.dispatchEvent(new CustomEvent('jigsaw:unload'));
                        const response = await fetch(url);
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        const html = await response.text();
                        const parser = new DOMParser();
                        const newDoc = parser.parseFromString(html, 'text/html');

                        const updateDOM = () => {
                                document.title = newDoc.title;
                                syncIslands(newDoc);
                                saveIslandStates();
                                const currentRoot = document.getElementById('jigsaw-root');
                                const newRoot = newDoc.getElementById('jigsaw-root');
                                if (currentRoot && newRoot) {
                                        currentRoot.innerHTML = newRoot.innerHTML;
                                        restoreIslandStates(newDoc);
                                } else {
                                        document.body.innerHTML = newDoc.body.innerHTML;
                                        restoreIslandStates(newDoc);
                                }
                        };

                        const postUpdate = () => {
                                const currentRoot = document.getElementById('jigsaw-root') || document.body;
                                const allScripts = newDoc.querySelectorAll('script');
                                allScripts.forEach(script => {
                                        if (script.textContent && script.textContent.includes('__JIGSAW_HANDLERS')) {
                                                const newScript = document.createElement('script');
                                                newScript.textContent = script.textContent;
                                                document.body.appendChild(newScript);
                                        }
                                });
                                executeScripts(currentRoot);
                                scanFunctions(currentRoot);
                                // Drop effects registered by the previous page's @init runs;
                                // runInitHandlers() below will re-register them fresh.
                                globalEffects.length = 0;
                                pendingKeys.clear();
                                isFlushPending = false;
                                initState();
                                runInitHandlers();
                                setupRevealObserver();
                                window.dispatchEvent(new CustomEvent('jigsaw:loaded'));
                        };

                        if (supportsViewTransitions && transitionType !== 'none') {
                                document.documentElement.dataset.transition = transitionType || 'default';
                                const transition = document.startViewTransition(updateDOM);
                                try { await transition.finished; } catch(e) {}
                                delete document.documentElement.dataset.transition;
                                postUpdate();
                        } else {
                                updateDOM();
                                postUpdate();
                        }
                        window.history.pushState({}, '', url);
                } catch (error) {
                        console.error('Navigation failed:', error);
                        window.location.href = url;
                }
        }

        function attachLinkListeners() {

		function initEventDelegation() {
			// 1. Map "Jigsaw Events" to "Native Events"
			const eventMap = {
				'mouseenter': 'mouseover',
				'mouseleave': 'mouseout'
			};

			// Two-way binding for data-state
			document.addEventListener('input', (e) => {
				if (e.target.matches('[data-state]')) {
					const key = e.target.getAttribute('data-state');

					if (key.includes('.')) {
						const parts = key.split('.');
						let current = appState;
						for (let i = 0; i < parts.length - 1; i++) {
							current = current[parts[i]];
							if (!current) return;
						}
						current[parts[parts.length - 1]] = e.target.value;
					} else {
						appState[key] = e.target.value;
					}
				}
			});

			// 2. Define all events we want to support
			const events = [
				'click', 'dblclick', 'input', 'change',
				'keydown', 'keyup', 'submit', 'reset',
				'focus', 'blur', // These require useCapture: true
				'mouseover', 'mouseout', // Required for mouseenter/leave emulation
				'dragstart', 'dragend', 'dragover', 'dragenter', 'dragleave', 'drop' // Drag and drop
			];

			events.forEach(nativeEvent => {
				document.addEventListener(nativeEvent, (e) => {

					// A. Determine which attribute to look for
					const attributesToCheck = [`data-on-${nativeEvent}`];

					// Reverse map for the special mouse events
					if (nativeEvent === 'mouseover') attributesToCheck.push('data-on-mouseenter');
					if (nativeEvent === 'mouseout') attributesToCheck.push('data-on-mouseleave');

					// B. Find the target
					if (!(e.target instanceof Element)) return;

					// We loop to find a match for ANY valid attribute
					let target = null;
					let code = null;

					for (const attr of attributesToCheck) {
						target = e.target.closest(`[${attr}]`);
						if (target) {
							code = target.getAttribute(attr);
							break;
						}
					}


					if (target && code) {
						// C. Handle Forms
						// ...

						// D. Execute the code
						// We verify the mouseenter target to ensure we don't fire when hovering children
						if (nativeEvent === 'mouseover' && code === target.getAttribute('data-on-mouseenter')) {
							// Logic to ensure we only fire when entering the PARENT, not bubbling from child
							const related = e.relatedTarget;
							if (target.contains(related)) return;
						}
						if (nativeEvent === 'mouseout' && code === target.getAttribute('data-on-mouseleave')) {
							const related = e.relatedTarget;
							if (target.contains(related)) return;
						}

						try {

							// --- Jigsaw DOM Helpers ---
							const wrapEl = (element) => {
								if (!element) return null;

								return new Proxy(element, {
									get(target, prop) {
										// Convenience shortcuts
										if (prop === 'text') return (v) => {
											if (v === undefined) return target.textContent;
											target.textContent = v;
											return wrapEl(target);
										};
										if (prop === 'html') return (v) => {
											if (v === undefined) return target.innerHTML;
											target.innerHTML = v;
											return wrapEl(target);
										};
										if (prop === 'css') return (k, v) => {
											if (v === undefined) return target.style[k];
											target.style[k] = v;
											return wrapEl(target);
										};
										if (prop === 'on') return (evt, fn) => { target.addEventListener(evt, fn); return wrapEl(target); };
										if (prop === 'addClass') return (c) => { target.classList.add(c); return wrapEl(target); };
										if (prop === 'removeClass') return (c) => { target.classList.remove(c); return wrapEl(target); };
										if (prop === 'toggle') return (c) => { target.classList.toggle(c); return wrapEl(target); };
										if (prop === 'attr') return (k, v) => {
											if (v === undefined) return target.getAttribute(k);
											target.setAttribute(k, v);
											return wrapEl(target);
										};
										if (prop === 'raw') return target;

										// Pass through to actual element
										const value = target[prop];
										return typeof value === 'function' ? value.bind(target) : value;
									},
									set(target, prop, value) {
										target[prop] = value;
										return true;
									}
								});
							};

							// $el: wrapped triggering element
							const $el = wrapEl(target);

							// $ref: lazy document-wide lookup, also wrapped
							const $ref = new Proxy({}, {
								get(_, name) {
									return wrapEl(document.querySelector(`[data-ref="${name}"]`));
								}
							});

							// $: scoped query, returns wrapped element
							const island = target.closest('[data-island]') || document;
							const $ = (sel) => wrapEl(island.querySelector(sel));

							// $state: Reactive state object
							const $state = appState;

							// Find Scoped Functions
							let current = target;
							let scopedFunctions = {};
							while (current) {
								if (functionRegistry.has(current)) {
									const fns = functionRegistry.get(current);

									// Build shared context with all sibling functions
									const context = { $el, $state, $ref, $effect, $http };
									for (const key of Object.keys(fns)) {
										context[key] = (...args) => {
											const sibFn = fns[key]();
											return sibFn.apply(context, args);
										};
									}

									// Now bind all functions to the shared context
									Object.keys(fns).forEach(key => {
										scopedFunctions[key] = context[key];
									});
									break;
								}
								current = current.parentElement;
							}

							const fnNames = Object.keys(scopedFunctions);
							const fnValues = Object.values(scopedFunctions);

							// Check if code is a handler ID (starts with jg_)
							if (code.startsWith('jg_')) {
								const handler = window.__JIGSAW_HANDLERS && window.__JIGSAW_HANDLERS[code];
								if (handler) {
									if (fnNames.length > 0 && handler.__code) {
										// Scoped functions exist: use new Function with stored code
										// so scoped function names are available as local variables
										try {
											const fn = new Function('event', 'el', '$el', '$ref', '$', '$state', '$effect', '$http', ...fnNames, handler.__code);
											fn(e, target, $el, $ref, $, $state, $effect, $http, ...fnValues);
										} catch (scopeErr) {
											console.error('[Jigsaw] Error in scoped handler construction/exec:', scopeErr);
											console.error('Code:', handler.__code);
											console.error('Scope:', fnNames);
										}
									} else {
										// No scoped functions: call pre-compiled handler directly
										handler.call({ $el, $state, $ref, $effect, $http }, e, $el, $state, $ref, $, $http, $effect);
									}
								} else {
									console.warn(`[Jigsaw] Handler not found: ${code}`, 'Available:', Object.keys(window.__JIGSAW_HANDLERS || {}));
								}
							} else {
								// Fallback to unsafe-eval for legacy or dynamic code (if CSP allows)
								try {
									const fn = new Function('event', 'el', '$el', '$ref', '$', '$state', '$effect', '$http', ...fnNames, code);
									fn(e, target, $el, $ref, $, $state, $effect, $http, ...fnValues);
								} catch (legacyErr) {
									console.error('[Jigsaw] Failed to execute legacy handler (CSP restriction?):', legacyErr);
								}
							}

						} catch (err) {
							console.error(`[Jigsaw] Error in handler:`, err);
						}
					}
				}, true); // USE CAPTURE: TRUE (Crucial for focus/blur)
			});
		}

		// Call this once on load
		initEventDelegation();

		// Navigation link handler
		document.addEventListener('click', (e) => {
			const link = e.target.closest('a');

			if (
				link &&
				link.href &&
				link.origin === window.location.origin &&
				!link.target &&
				!link.hasAttribute('data-no-transition') &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.shiftKey
			) {
				e.preventDefault();
				const transitionType = link.getAttribute('data-transition');
				navigate(link.href, transitionType);
			}
		});
	}

	// Handle browser back/forward buttons
	window.addEventListener('popstate', () => {
		navigate(window.location.href);
	});

	// HMR Handling
	if (window.location.hostname === 'localhost') {
		const socket = new WebSocket('ws://' + window.location.host);

		socket.onmessage = async (event) => {
			const data = JSON.parse(event.data);

			if (data.type === 'reload') {
				console.log('[HMR] Reloading via navigation...');
				if (typeof window.navigate === 'function') {
					window.navigate(window.location.href);
				} else {
					window.location.reload();
				}
			} else if (data.type === 'patch') {
				console.log('[HMR] Patching islands:', data.islands);

				// Fetch current page to get new HTML
				try {
					const response = await fetch(window.location.href);
					const html = await response.text();
					const parser = new DOMParser();
					const newDoc = parser.parseFromString(html, 'text/html');

					// Check for full body patch
					if (data.islands.includes('*')) {
						console.log('[HMR] Full body patch via morphdom');
						if (window.morphdom) {
							const currentRoot = document.getElementById('jigsaw-root') || document.body;
							const newRoot = newDoc.getElementById('jigsaw-root') || newDoc.body;

							window.morphdom(currentRoot, newRoot, {
								onBeforeElUpdated: (fromEl, toEl) => {
									// Preserve elements with data-island-static
									if (fromEl.hasAttribute('data-island-static')) return false;
									// Preserve focus if possible? morphdom does this by default usually
									return true;
								}
							});
						} else {
							console.warn('[HMR] morphdom not found, falling back to reload');
							window.location.reload();
						}
						scanFunctions();
						runInitHandlers();
						return;
					}

					data.islands.forEach(islandName => {
						const oldIsland = document.querySelector(`[data-island="${islandName}"]`);
						const newIsland = newDoc.querySelector(`[data-island="${islandName}"]`);

						if (oldIsland && newIsland) {
							// Use morphdom if available, otherwise replace
							if (window.morphdom) {
								window.morphdom(oldIsland, newIsland, {
									onBeforeElUpdated: (fromEl, toEl) => {
										// Preserve elements with data-island-static
										if (fromEl.hasAttribute('data-island-static')) return false;
										return true;
									}
								});
							} else {
								oldIsland.replaceWith(newIsland);
							}
						}
					});

					// Re-init scoped functions and init handlers after patch
					scanFunctions();
					runInitHandlers();
				} catch (e) {
					console.error('[HMR] Patch failed:', e);
				}
			} else if (data.type === 'css-update') {
				console.log('[HMR] CSS update:', data.file);
				const links = document.querySelectorAll('link[rel="stylesheet"]');
				links.forEach(link => {
					const url = new URL(link.href);
					url.searchParams.set('t', Date.now());
					link.href = url.toString();
				});
			}
		};
	}

	// Run init handlers - process data-init attributes that contain function names
	function runInitHandlers() {
		// Local wrapEl helper (same as in event handlers)
		const wrapEl = (element) => {
			if (!element) return null;
			return new Proxy(element, {
				get(target, prop) {
					if (prop === 'text') return (v) => { if (v === undefined) return target.textContent; target.textContent = v; return wrapEl(target); };
					if (prop === 'html') return (v) => { if (v === undefined) return target.innerHTML; target.innerHTML = v; return wrapEl(target); };
					if (prop === 'css') return (k, v) => { if (v === undefined) return target.style[k]; target.style[k] = v; return wrapEl(target); };
					if (prop === 'on') return (evt, fn) => { target.addEventListener(evt, fn); return wrapEl(target); };
					if (prop === 'addClass') return (c) => { target.classList.add(c); return wrapEl(target); };
					if (prop === 'removeClass') return (c) => { target.classList.remove(c); return wrapEl(target); };
					if (prop === 'toggle') return (c) => { target.classList.toggle(c); return wrapEl(target); };
					if (prop === 'attr') return (k, v) => { if (v === undefined) return target.getAttribute(k); target.setAttribute(k, v); return wrapEl(target); };
					if (prop === 'raw') return target;
					const value = target[prop];
					return typeof value === 'function' ? value.bind(target) : value;
				},
				set(target, prop, value) { target[prop] = value; return true; }
			});
		};

		const initElements = document.querySelectorAll('[data-init]');
		initElements.forEach(el => {
			const handler = el.getAttribute('data-init');
			// Skip if it's a value init (has data-state) rather than function init
			if (!handler || el.hasAttribute('data-state')) return;

			try {
				const $el = wrapEl(el);
				const $state = appState;
				const $ref = new Proxy({}, {
					get(_, name) {
						const refEl = document.querySelector(`[data-ref="${name}"]`);
						return refEl ? wrapEl(refEl) : null;
					}
				});

				// Walk up to find the nearest functionRegistry scope (for sibling fns)
				let scope = null;
				let scopeNode = el;
				while (scopeNode) {
					const found = functionRegistry.get(scopeNode);
					if (found) { scope = found; break; }
					scopeNode = scopeNode.parentElement;
				}

				// Branch A: handler ID (compiled from `@init="$effect(...)"` etc.)
				if (handler.startsWith('jg_')) {
					executeInitHandler(handler, el, $el, $state, $ref, scope);
					return;
				}

				// Branch B: bare function name in scope
				if (scope && scope[handler]) {
					const context = { $el, $state, $ref, $effect, $http };
					for (const fnName in scope) {
						context[fnName] = (...args) => {
							const sibFn = scope[fnName]();
							return sibFn.apply(context, args);
						};
					}
					const fn = scope[handler]();
					fn.call(context);
					return;
				}

				// Branch C: window-global function
				if (typeof window[handler] === 'function') {
					window[handler]();
					return;
				}

				console.warn(`[Jigsaw] Init handler '${handler}' not found`);
			} catch (err) {
				console.error('[Jigsaw] Error in init handler:', err);
			}
		});
	}

	// Execute a precompiled @init handler (jg_xxx) with full scoped-function context.
	// Mirrors the @click dispatch path in initEventDelegation.
	function executeInitHandler(handlerId, el, $el, $state, $ref, scope) {
		const compiled = window.__JIGSAW_HANDLERS && window.__JIGSAW_HANDLERS[handlerId];
		if (!compiled) {
			console.warn('[Jigsaw] @init handler ' + handlerId + ' not found in registry');
			return;
		}
		const fnNames = scope ? Object.keys(scope) : [];
		if (fnNames.length > 0 && compiled.__code) {
			const context = { $el, $state, $ref, $effect, $http };
			fnNames.forEach(name => {
				context[name] = function () {
					const sibFn = scope[name]();
					return sibFn.apply(context, arguments);
				};
			});
			const fnValues = fnNames.map(n => context[n]);
			const F = Function;
			const dyn = new F('$el', '$ref', '$state', '$effect', '$http', ...fnNames, compiled.__code);
			dyn($el, $ref, $state, $effect, $http, ...fnValues);
		} else {
			compiled.call({ $el: $el, $state: $state, $ref: $ref, $effect: $effect, $http: $http }, null, $el, $state, $ref, null, $http, $effect);
		}
	}

	// Initialize
	document.addEventListener('DOMContentLoaded', () => {
		attachLinkListeners();
		saveIslandStates();
		initState();
		scanFunctions();
		runInitHandlers();
		setupRevealObserver();
	});
})();
