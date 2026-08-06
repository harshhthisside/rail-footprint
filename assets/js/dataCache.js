// ==========================================
// Rail Footprint — Shared data loaders + IndexedDB graph cache
// Single-flight fetches so stations/graph are not loaded twice.
// ==========================================

const STATION_INDEX_URL = "assets/data/station_index.json";
const GRAPH_NODES_URL = "assets/data/graph_nodes.json";
const GRAPH_EDGES_URL = "assets/data/graph_edges.json";

const IDB_NAME = "rf_graph_cache_v1";
const IDB_STORE = "blobs";
/** Bump when graph files change on server */
const GRAPH_CACHE_KEY = "graph_v1";
/** Cache graph for 7 days — still revalidates in background when stale */
const GRAPH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let _stationPromise = null;
let _graphPromise = null;

function openIdb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
            resolve(null);
            return;
        }
        try {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch (_) {
            resolve(null);
        }
    });
}

function idbGet(db, key) {
    return new Promise((resolve) => {
        if (!db) {
            resolve(null);
            return;
        }
        try {
            const tx = db.transaction(IDB_STORE, "readonly");
            const req = tx.objectStore(IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        } catch (_) {
            resolve(null);
        }
    });
}

function idbSet(db, key, value) {
    return new Promise((resolve) => {
        if (!db) {
            resolve(false);
            return;
        }
        try {
            const tx = db.transaction(IDB_STORE, "readwrite");
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        } catch (_) {
            resolve(false);
        }
    });
}

/**
 * Shared station index — one network request for the whole app.
 * @returns {Promise<Array>}
 */
export function loadStationIndex() {
    if (_stationPromise) return _stationPromise;
    _stationPromise = (async () => {
        const response = await fetch(STATION_INDEX_URL);
        if (!response.ok) throw new Error("Unable to load station_index.json");
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    })().catch((err) => {
        _stationPromise = null;
        throw err;
    });
    return _stationPromise;
}

/**
 * Load routing graph with IndexedDB cache for fast repeat visits.
 * Returns { nodes, edges }. Always yields to the main thread between heavy parses.
 */
export function loadGraphData() {
    if (_graphPromise) return _graphPromise;
    _graphPromise = (async () => {
        const db = await openIdb();
        const cached = await idbGet(db, GRAPH_CACHE_KEY);
        const now = Date.now();

        if (
            cached &&
            Array.isArray(cached.nodes) &&
            cached.nodes.length &&
            Array.isArray(cached.edges) &&
            cached.edges.length &&
            typeof cached.at === "number" &&
            now - cached.at < GRAPH_TTL_MS
        ) {
            // Warm path: return cached graph immediately
            await new Promise((r) => setTimeout(r, 0));
            return { nodes: cached.nodes, edges: cached.edges, fromCache: true };
        }

        // Cold path (or expired): fetch both files in parallel
        const [nodeResponse, edgeResponse] = await Promise.all([
            fetch(GRAPH_NODES_URL),
            fetch(GRAPH_EDGES_URL)
        ]);
        if (!nodeResponse.ok) throw new Error("Unable to load graph_nodes.json");
        if (!edgeResponse.ok) throw new Error("Unable to load graph_edges.json");

        const nodes = await nodeResponse.json();
        await new Promise((r) => setTimeout(r, 0));
        const edges = await edgeResponse.json();
        await new Promise((r) => setTimeout(r, 0));

        // Persist for next visit (best-effort, non-blocking)
        idbSet(db, GRAPH_CACHE_KEY, { nodes, edges, at: Date.now() }).catch(() => {});

        return { nodes, edges, fromCache: false };
    })().catch((err) => {
        _graphPromise = null;
        throw err;
    });
    return _graphPromise;
}

/**
 * Dynamically load a script once (html2canvas / jspdf on demand).
 */
const _scriptLoads = new Map();
export function loadScriptOnce(src) {
    if (_scriptLoads.has(src)) return _scriptLoads.get(src);
    const p = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            if (existing.dataset.loaded === "1") {
                resolve();
                return;
            }
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error("script fail: " + src)), { once: true });
            return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => {
            s.dataset.loaded = "1";
            resolve();
        };
        s.onerror = () => reject(new Error("script fail: " + src));
        document.head.appendChild(s);
    });
    _scriptLoads.set(src, p);
    return p;
}

export async function ensureExportLibs() {
    const tasks = [];
    if (typeof window.html2canvas !== "function") {
        tasks.push(
            loadScriptOnce(
                "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
            )
        );
    }
    if (typeof window.jspdf === "undefined" && typeof window.jsPDF === "undefined") {
        tasks.push(
            loadScriptOnce(
                "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
            )
        );
    }
    if (tasks.length) await Promise.all(tasks);
}
