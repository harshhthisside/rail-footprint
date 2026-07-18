// ==========================================
// Rail Footprint
// Routing Engine
// ==========================================

import { shortestPath } from "./dijkstra.js";

export let graphNodes = [];
export let graphEdges = [];

// ==========================================
// Load Graph
// ==========================================

export async function loadGraph() {

    console.log("=================================");
    console.log("Loading Routing Graph...");
    console.log("=================================");

    const nodeResponse = await fetch("assets/data/graph_nodes.json");

    if (!nodeResponse.ok)
        throw new Error("Unable to load graph_nodes.json");

    graphNodes = await nodeResponse.json();

    const edgeResponse = await fetch("assets/data/graph_edges.json");

    if (!edgeResponse.ok)
        throw new Error("Unable to load graph_edges.json");

    graphEdges = await edgeResponse.json();

    console.log("✓ Nodes :", graphNodes.length);
    console.log("✓ Edges :", graphEdges.length);

    console.log("=================================");
    console.log("Routing Ready");
    console.log("=================================");

}

// ==========================================
// Find Nearest Graph Node
// ==========================================

export function findNearestNode(lat, lon) {

    let nearest = -1;
    let best = Infinity;

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

    return nearest;

}

// ==========================================
// Calculate Route
// Accepts:
// [
//   origin,
//   stop1,
//   stop2,
//   destination
// ]
// ==========================================

export function calculateRoute(stations) {

    if (stations.length < 2)
        return [];

    let fullCoordinates = [];

    for (let i = 0; i < stations.length - 1; i++) {

        const startNode = findNearestNode(

            stations[i].lat,
            stations[i].lon

        );

        const endNode = findNearestNode(

            stations[i + 1].lat,
            stations[i + 1].lon

        );

        console.log(
            `Segment ${i + 1}: ${startNode} → ${endNode}`
        );

        const nodePath = shortestPath(
            startNode,
            endNode
        );

        if (nodePath.length === 0) {

            console.warn("No route found.");

            return [];

        }

        const coordinates = nodePath.map(id => [

            graphNodes[id][0],
            graphNodes[id][1]

        ]);

        // Avoid duplicate connection point
        if (i > 0)
            coordinates.shift();

        fullCoordinates.push(...coordinates);

    }

    console.log(
        "Total Route Points:",
        fullCoordinates.length
    );

    return fullCoordinates;

}