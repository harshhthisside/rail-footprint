// ==========================================
// Rail Footprint
// Dijkstra Routing Engine
// ==========================================

import { graphEdges } from "./routing.js";
import { MinHeap } from "./minHeap.js";

// ==========================================
// Shortest Path
// ==========================================

export function shortestPath(startNode, endNode) {

    if (startNode === endNode)
        return [startNode];

    const nodeCount = graphEdges.length;

    const distance = new Float64Array(nodeCount);
    distance.fill(Infinity);

    const previous = new Int32Array(nodeCount);
    previous.fill(-1);

    const visited = new Uint8Array(nodeCount);

    const heap = new MinHeap();

    distance[startNode] = 0;

    heap.push(startNode, 0);

    while (!heap.isEmpty()) {

        const current = heap.pop();

        const u = current.node;

        if (visited[u])
            continue;

        visited[u] = 1;

        if (u === endNode)
            break;

        const neighbours = graphEdges[u];

        for (let i = 0; i < neighbours.length; i++) {

            const edge = neighbours[i];

            const v = edge[0];

            const weight = edge[1];

            const alt = distance[u] + weight;

            if (alt < distance[v]) {

                distance[v] = alt;

                previous[v] = u;

                heap.push(v, alt);

            }

        }

    }

    if (previous[endNode] === -1)
        return [];

    const path = [];

    let current = endNode;

    while (current !== -1) {

        path.push(current);

        current = previous[current];

    }

    path.reverse();

    return path;

}