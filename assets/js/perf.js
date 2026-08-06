// ==========================================
// Rail Footprint — Shared Performance Utilities
// Debounce, throttle, rAF batching, simple LRU
// ==========================================

/**
 * Debounce: invoke fn after ms of quiet.
 * Returns a function with .cancel() and .flush().
 */
export function debounce(fn, ms = 200) {
    let t = null;
    let lastArgs = null;
    const wrapped = function (...args) {
        lastArgs = args;
        if (t) clearTimeout(t);
        t = setTimeout(() => {
            t = null;
            const a = lastArgs;
            lastArgs = null;
            fn.apply(this, a);
        }, ms);
    };
    wrapped.cancel = () => {
        if (t) clearTimeout(t);
        t = null;
        lastArgs = null;
    };
    wrapped.flush = function () {
        if (!t) return;
        clearTimeout(t);
        t = null;
        const a = lastArgs;
        lastArgs = null;
        if (a) fn.apply(this, a);
    };
    return wrapped;
}

/**
 * Throttle: at most one call per ms (leading + trailing).
 */
export function throttle(fn, ms = 100) {
    let last = 0;
    let t = null;
    let lastArgs = null;
    return function (...args) {
        const now = Date.now();
        lastArgs = args;
        const remaining = ms - (now - last);
        if (remaining <= 0) {
            if (t) {
                clearTimeout(t);
                t = null;
            }
            last = now;
            fn.apply(this, args);
        } else if (!t) {
            t = setTimeout(() => {
                t = null;
                last = Date.now();
                fn.apply(this, lastArgs);
            }, remaining);
        }
    };
}

/**
 * Schedule work on next animation frame; coalesce multiple schedules.
 */
export function rafBatch(fn) {
    let scheduled = false;
    let pendingArgs = null;
    return function (...args) {
        pendingArgs = args;
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            const a = pendingArgs;
            pendingArgs = null;
            fn.apply(this, a || []);
        });
    };
}

/**
 * Simple LRU cache for route geometries / search results.
 */
export function createLRU(maxSize = 128) {
    const map = new Map();
    return {
        get(key) {
            if (!map.has(key)) return undefined;
            const v = map.get(key);
            map.delete(key);
            map.set(key, v);
            return v;
        },
        set(key, value) {
            if (map.has(key)) map.delete(key);
            map.set(key, value);
            while (map.size > maxSize) {
                const first = map.keys().next().value;
                map.delete(first);
            }
        },
        has(key) {
            return map.has(key);
        },
        clear() {
            map.clear();
        },
        get size() {
            return map.size;
        }
    };
}

/**
 * Yield to the main thread so long tasks don't block UI.
 */
export function yieldToMain() {
    return new Promise((r) => setTimeout(r, 0));
}

/**
 * Run async work in chunks with yields between.
 */
export async function mapInChunks(items, chunkSize, mapper) {
    const out = new Array(items.length);
    for (let i = 0; i < items.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, items.length);
        for (let j = i; j < end; j++) {
            out[j] = await mapper(items[j], j);
        }
        if (end < items.length) await yieldToMain();
    }
    return out;
}

/**
 * Safe remove Leaflet layer (no-op on missing / already removed).
 */
export function safeRemoveLayer(map, layer) {
    if (!map || !layer) return;
    try {
        if (map.hasLayer && map.hasLayer(layer)) map.removeLayer(layer);
        else if (typeof map.removeLayer === "function") map.removeLayer(layer);
    } catch (_) {}
}

/**
 * Prefer passive listeners for scroll/touch when possible.
 */
export function addPassiveListener(el, type, handler, opts) {
    if (!el) return () => {};
    const options = opts && typeof opts === "object" ? { ...opts, passive: true } : { passive: true };
    el.addEventListener(type, handler, options);
    return () => el.removeEventListener(type, handler, options);
}
