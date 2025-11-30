// Client-side router with Island persistence, Smart Sync, and View Transitions
(function () {
	'use strict';

	// Check if View Transitions API is supported
	const supportsViewTransitions = 'startViewTransition' in document;

	// Store for island state preservation
	const islandStates = new Map();

	// Store functions mapped by DOM element
	const functionRegistry = new WeakMap();

	function scanFunctions(rootElement = document) {
		const scripts = rootElement.querySelectorAll('script[type="jigsaw/fn"]');
		scripts.forEach(script => {
			const name = script.getAttribute('data-name');
			const args = script.getAttribute('data-args') || '';
			const body = script.textContent;
			const parent = script.parentElement || document.body;

			const fnFactory = () => {
				return new Function(
					...args.split(',').map(a => a.trim()).filter(a => a),
					'const $el = this.$el; const $state = this.$state; const $ref = this.$ref;',
					body
				);
			};

			let scope = functionRegistry.get(parent) || {};
			scope[name] = fnFactory;
			functionRegistry.set(parent, scope);
		});
	}

	// --- Reactive State Management ---
	const stateData = {};
	const appState = new Proxy(stateData, {
		get(target, prop) {
			return target[prop];
		},
		set(target, prop, value) {
			target[prop] = value;
			updateStateBindings(prop, value);
			return true;
		}
	});

	function updateStateBindings(key, value) {
		const elements = document.querySelectorAll(`[data-state="${key}"]`);
		elements.forEach(el => {
			if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
				if (el.value !== String(value)) el.value = value;
			} else {
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
				if (!isNaN(Number(initVal))) val = Number(initVal);
				else if (initVal === 'true') val = true;
				else if (initVal === 'false') val = false;

				// Only set if not already set (preserve state across nav if needed? 
				// For now, re-init on page load is safer unless we want global persistence)
				appState[key] = val;
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
			// Signal that we are leaving the current page
			window.dispatchEvent(new CustomEvent('jigsaw:unload'));

			// Fetch the new page
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);

			const html = await response.text();
			const parser = new DOMParser();
			const newDoc = parser.parseFromString(html, 'text/html');

			// Function to update the DOM
			const updateDOM = () => {
				// Update title
				document.title = newDoc.title;

				// Sync reactive data in islands BEFORE swapping
				syncIslands(newDoc);

				// Save current island states (detach them)
				saveIslandStates();

				// Update App Shell Content (target #jigsaw-root)
				const currentRoot = document.getElementById('jigsaw-root');
				const newRoot = newDoc.getElementById('jigsaw-root');

				if (currentRoot && newRoot) {
					currentRoot.innerHTML = newRoot.innerHTML;

					// Restore preserved islands into the new structure
					restoreIslandStates(newDoc);

					// Execute any scripts in the new content
					executeScripts(currentRoot);
					scanFunctions(currentRoot);
				} else {
					// Fallback if root not found (e.g. error page)
					document.body.innerHTML = newDoc.body.innerHTML;
					restoreIslandStates(newDoc);
				}

				// Re-initialize state for new elements
				initState();
			};

			// Use View Transitions API if supported
			if (supportsViewTransitions && transitionType !== 'none') {
				document.documentElement.dataset.transition = transitionType || 'default';
				const transition = document.startViewTransition(updateDOM);
				transition.finished.finally(() => {
					delete document.documentElement.dataset.transition;
				});
			} else {
				updateDOM();
			}

			// Update browser history
			window.history.pushState({}, '', url);

		} catch (error) {
			console.error('Navigation failed:', error);
			window.location.href = url;
		}
	}

	// Attach link listeners and comprehensive event delegation
	function attachLinkListeners() {

		function initEventDelegation() {
			// 1. Map "Jigsaw Events" to "Native Events"
			const eventMap = {
				'mouseenter': 'mouseover',
				'mouseleave': 'mouseout'
			};

			// 2. Define all events we want to support
			const events = [
				'click', 'dblclick', 'input', 'change',
				'keydown', 'keyup', 'submit', 'reset',
				'focus', 'blur', // These require useCapture: true
				'mouseover', 'mouseout' // Required for mouseenter/leave emulation
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
									Object.keys(fns).forEach(key => {
										scopedFunctions[key] = fns[key]().bind({ $el, $state, $ref });
									});
									break;
								}
								current = current.parentElement;
							}

							const fnNames = Object.keys(scopedFunctions);
							const fnValues = Object.values(scopedFunctions);

							const fn = new Function('event', 'el', '$el', '$ref', '$', '$state', ...fnNames, code);
							fn(e, target, $el, $ref, $, $state, ...fnValues);
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
				} catch (e) {
					console.error('[HMR] Patch failed:', e);
				}
			}
		};
	}

	// Initialize
	document.addEventListener('DOMContentLoaded', () => {
		attachLinkListeners();
		saveIslandStates();
		initState();
		scanFunctions();
	});
})();

