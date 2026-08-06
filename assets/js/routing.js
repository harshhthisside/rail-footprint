// ==========================================
// Rail Footprint
// Routing Engine — optimized nearest-node + route cache
// ==========================================

import { shortestPath } from "./dijkstra.js";
import { createLRU } from "./perf.js";
import { loadGraphData } from "./dataCache.js";

export let graphNodes = [];
export let graphEdges = [];

/** Coarse spatial grid for fast nearest-node (cell size ~0.05° ≈ 5.5 km) */
const GRID_CELL = 0.05;
let spatialGrid = null;
const nearestCache = new Map();

/** Resolves once loadGraph() finishes successfully — used by Premium priority init */
let _graphReadyResolve = null;
export const graphReadyPromise = new Promise((resolve) => {
    _graphReadyResolve = resolve;
});
/** True after graph nodes + edges are loaded and spatial grid built */
export function isGraphReady() {
    return Array.isArray(graphNodes) && graphNodes.length > 0 &&
        Array.isArray(graphEdges) && graphEdges.length > 0;
}

/** Cache full multi-stop route geometries keyed by station graph nodes / codes */
const routeGeomCache = createLRU(256);
/** Cache node-id paths for shared-segment / ribbon rendering */
const routeNodeCache = createLRU(256);
function cellKey(lat, lon) {
    return `${Math.floor(lat / GRID_CELL)},${Math.floor(lon / GRID_CELL)}`;
}

function buildSpatialGrid() {
    spatialGrid = new Map();
    for (let i = 0; i < graphNodes.length; i++) {
        const n = graphNodes[i];
        const key = cellKey(n[0], n[1]);
        let bucket = spatialGrid.get(key);
        if (!bucket) {
            bucket = [];
            spatialGrid.set(key, bucket);
        }
        bucket.push(i);
    }
}

// ==========================================
// Load Graph
// ==========================================

export async function loadGraph() {
    console.log("=================================");
    console.log("Loading Routing Graph...");
    console.log("=================================");

    // Shared loader + IndexedDB cache (fast on repeat visits, single-flight)
    const { nodes, edges, fromCache } = await loadGraphData();
    graphNodes = nodes;
    graphEdges = edges;

    // Yield so first paint / UI stays responsive after large parse
    await new Promise((r) => setTimeout(r, 0));
    buildSpatialGrid();
    nearestCache.clear();

    console.log("✓ Nodes :", graphNodes.length, fromCache ? "(cache)" : "(network)");
    console.log("✓ Edges :", graphEdges.length);
    console.log("✓ Spatial grid cells:", spatialGrid.size);
    console.log("=================================");
    console.log("Routing Ready");
    console.log("=================================");

    // Notify Premium (and any other waiters) that priority/corridor rendering can run
    if (typeof _graphReadyResolve === "function") {
        _graphReadyResolve();
        _graphReadyResolve = null;
    }
}

// ==========================================
// Find Nearest Graph Node (grid-accelerated)
// ==========================================

export function findNearestNode(lat, lon) {
    const cacheKey = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (nearestCache.has(cacheKey)) return nearestCache.get(cacheKey);

    let nearest = -1;
    let best = Infinity;

    if (spatialGrid && spatialGrid.size) {
        const ci = Math.floor(lat / GRID_CELL);
        const cj = Math.floor(lon / GRID_CELL);
        // Expand ring until we find candidates (usually ring 0–1 is enough)
        for (let ring = 0; ring <= 4; ring++) {
            for (let di = -ring; di <= ring; di++) {
                for (let dj = -ring; dj <= ring; dj++) {
                    if (ring > 0 && Math.abs(di) !== ring && Math.abs(dj) !== ring) continue;
                    const bucket = spatialGrid.get(`${ci + di},${cj + dj}`);
                    if (!bucket) continue;
                    for (let k = 0; k < bucket.length; k++) {
                        const i = bucket[k];
                        const node = graphNodes[i];
                        const dx = node[0] - lat;
                        const dy = node[1] - lon;
                        const d = dx * dx + dy * dy;
                        if (d < best) {
                            best = d;
                            nearest = i;
                        }
                    }
                }
            }
            if (nearest >= 0 && ring >= 1) break;
        }
    }

    // Fallback full scan if grid missed (should be rare)
    if (nearest < 0) {
        for (let i = 0; i < graphNodes.length; i++) {
            const node = graphNodes[i];
            const dx = node[0] - lat;
            const dy = node[1] - lon;
            const d = dx * dx + dy * dy;
            if (d < best) {
                best = d;
                nearest = i;
            }
        }
    }

    if (nearestCache.size > 2000) nearestCache.clear();
    nearestCache.set(cacheKey, nearest);
    return nearest;
}

// ==========================================
// Get Graph Node
// ==========================================

function getGraphNode(station) {
    if (station.graph_node !== undefined && station.graph_node !== null) {
        const gn = Number(station.graph_node);
        if (Number.isFinite(gn) && gn >= 0 && gn < graphNodes.length) {
            return gn;
        }
    }

    console.warn(
        "Station has no valid graph_node. Falling back to nearest search:",
        station.code
    );

    return findNearestNode(Number(station.lat), Number(station.lon));
}

// ==========================================
// Calculate Route (with geometry cache)
// ==========================================

function routeCacheKey(stations) {
    const parts = [];
    for (let i = 0; i < stations.length; i++) {
        const s = stations[i];
        if (s.graph_node != null && Number.isFinite(Number(s.graph_node))) {
            parts.push("n" + s.graph_node);
        } else if (s.code) {
            parts.push("c" + String(s.code).toUpperCase());
        } else {
            parts.push(
                "p" +
                    Number(s.lat).toFixed(4) +
                    "," +
                    Number(s.lon).toFixed(4)
            );
        }
    }
    return parts.join("|");
}

/**
 * Internal: compute full node-id path across multi-stop stations.
 * Returns [] on failure.
 */
function computeNodePath(stations) {
    if (!stations || stations.length < 2) return [];
    let fullNodes = [];
    for (let i = 0; i < stations.length - 1; i++) {
        const startNode = getGraphNode(stations[i]);
        const endNode = getGraphNode(stations[i + 1]);
        if (
            startNode < 0 ||
            endNode < 0 ||
            startNode >= graphNodes.length ||
            endNode >= graphNodes.length
        ) {
            return [];
        }
        const nodePath = shortestPath(startNode, endNode);
        if (!nodePath || nodePath.length === 0) return [];
        if (i > 0) {
            for (let k = 1; k < nodePath.length; k++) fullNodes.push(nodePath[k]);
        } else {
            fullNodes.push(...nodePath);
        }
    }
    return fullNodes;
}

export function calculateRoute(stations) {
    if (!stations || stations.length < 2) return [];

    const key = routeCacheKey(stations);
    const cached = routeGeomCache.get(key);
    if (cached) return cached;

    const nodePath = computeNodePath(stations);
    if (!nodePath.length) return [];

    // Also seed the node cache
    routeNodeCache.set(key, nodePath.slice());

    let fullCoordinates = nodePath.map((id) => [
        graphNodes[id][0],
        graphNodes[id][1],
    ]);

    // Snap route ends to true station coordinates so markers & polylines
    // align with the actual station.
    if (fullCoordinates.length > 0 && stations.length >= 2) {
        fullCoordinates[0] = [
            Number(stations[0].lat),
            Number(stations[0].lon),
        ];
        fullCoordinates[fullCoordinates.length - 1] = [
            Number(stations[stations.length - 1].lat),
            Number(stations[stations.length - 1].lon),
        ];
    }

    // Cache a shallow copy so callers cannot mutate the cached array
    if (fullCoordinates.length) {
        routeGeomCache.set(key, fullCoordinates.slice());
    }

    return fullCoordinates;
}

/**
 * Return the graph node-id sequence for a multi-stop route.
 * Used by Premium Shared Route Ribbon Rendering.
 * Cached alongside geometry.
 */
export function calculateRouteNodes(stations) {
    if (!stations || stations.length < 2) return [];
    const key = routeCacheKey(stations);
    const cached = routeNodeCache.get(key);
    if (cached) return cached.slice();
    const nodes = computeNodePath(stations);
    if (nodes.length) routeNodeCache.set(key, nodes.slice());
    return nodes;
}

/** Clear route geometry cache (e.g. after graph hot-reload). */
export function clearRouteCache() {
    routeGeomCache.clear();
    routeNodeCache.clear();
}