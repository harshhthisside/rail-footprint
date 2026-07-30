// ==========================================
// Rail Footprint
// Routing Engine — optimized nearest-node
// ==========================================

import { shortestPath } from "./dijkstra.js";

export let graphNodes = [];
export let graphEdges = [];

/** Coarse spatial grid for fast nearest-node (cell size ~0.05° ≈ 5.5 km) */
const GRID_CELL = 0.05;
let spatialGrid = null;
const nearestCache = new Map();

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

    // Parallel fetch — major load-time win on mobile networks
    const [nodeResponse, edgeResponse] = await Promise.all([
        fetch("assets/data/graph_nodes.json"),
        fetch("assets/data/graph_edges.json")
    ]);
    if (!nodeResponse.ok) throw new Error("Unable to load graph_nodes.json");
    if (!edgeResponse.ok) throw new Error("Unable to load graph_edges.json");

    // Parse sequentially with a yield between to keep UI responsive
    graphNodes = await nodeResponse.json();
    await new Promise((r) => setTimeout(r, 0));
    graphEdges = await edgeResponse.json();
    await new Promise((r) => setTimeout(r, 0));

    buildSpatialGrid();
    nearestCache.clear();

    console.log("✓ Nodes :", graphNodes.length);
    console.log("✓ Edges :", graphEdges.length);
    console.log("✓ Spatial grid cells:", spatialGrid.size);
    console.log("=================================");
    console.log("Routing Ready");
    console.log("=================================");
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
// Calculate Route
// ==========================================

export function calculateRoute(stations) {
    if (stations.length < 2) return [];

    let fullCoordinates = [];

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

        if (!nodePath || nodePath.length === 0) {
            return [];
        }

        const coordinates = nodePath.map((id) => [
            graphNodes[id][0],
            graphNodes[id][1],
        ]);

        if (i > 0) coordinates.shift();

        fullCoordinates.push(...coordinates);
    }

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

    return fullCoordinates;
}
