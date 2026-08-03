// ==========================================
// Rail Footprint
// Dijkstra Routing Engine (buffer-reused)
// ==========================================

import { graphEdges } from "./routing.js";
import { MinHeap } from "./minHeap.js";

// Reuse typed arrays across calls to cut GC pressure on mobile
let distanceBuf = null;
let previousBuf = null;
let visitedBuf = null;
let bufSize = 0;
const touched = []; // nodes we wrote to — only reset those

function ensureBuffers(n) {
    if (bufSize >= n && distanceBuf) return;
    distanceBuf = new Float64Array(n);
    previousBuf = new Int32Array(n);
    visitedBuf = new Uint8Array(n);
    bufSize = n;
    distanceBuf.fill(Infinity);
    previousBuf.fill(-1);
    // visited is 0 by default
}

/**
 * Shortest path between two graph node ids.
 * Returns array of node ids (empty if unreachable).
 */
export function shortestPath(startNode, endNode) {
    if (startNode === endNode) return [startNode];

    const nodeCount = graphEdges.length;
    ensureBuffers(nodeCount);

    // Reset only previously touched nodes (O(path) not O(N))
    for (let i = 0; i < touched.length; i++) {
        const t = touched[i];
        distanceBuf[t] = Infinity;
        previousBuf[t] = -1;
        visitedBuf[t] = 0;
    }
    touched.length = 0;

    const distance = distanceBuf;
    const previous = previousBuf;
    const visited = visitedBuf;
    const heap = new MinHeap();

    distance[startNode] = 0;
    previous[startNode] = -1;
    touched.push(startNode);
    heap.push(startNode, 0);

    while (!heap.isEmpty()) {
        const current = heap.pop();
        const u = current.node;

        if (visited[u]) continue;
        visited[u] = 1;

        if (u === endNode) break;

        const neighbours = graphEdges[u];
        if (!neighbours) continue;

        for (let i = 0; i < neighbours.length; i++) {
            const edge = neighbours[i];
            const v = edge[0];
            const weight = edge[1];
            const alt = distance[u] + weight;

            if (alt < distance[v]) {
                if (distance[v] === Infinity) touched.push(v);
                distance[v] = alt;
                previous[v] = u;
                heap.push(v, alt);
            }
        }
    }

    if (previous[endNode] === -1 && startNode !== endNode) return [];

    const path = [];
    let current = endNode;
    while (current !== -1) {
        path.push(current);
        current = previous[current];
    }
    path.reverse();
    return path;
}
