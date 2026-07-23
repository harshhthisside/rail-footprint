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
// (Fallback only)
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
// Get Graph Node
// Uses graph_node from station_index.json
// Falls back to nearest search if absent
// ==========================================

function getGraphNode(station) {

    if (
        station.graph_node !== undefined &&
        station.graph_node !== null
    ) {

        return station.graph_node;

    }

    console.warn(
        "Station has no graph_node. Falling back to nearest search:",
        station.code
    );

    return findNearestNode(
        station.lat,
        station.lon
    );

}

// ==========================================
// Calculate Route
// ==========================================

export function calculateRoute(stations) {

    if (stations.length < 2)
        return [];

    let fullCoordinates = [];

    for (let i = 0; i < stations.length - 1; i++) {

        const startNode = getGraphNode(stations[i]);
        const endNode = getGraphNode(stations[i + 1]);

        console.log(
            `Segment ${i + 1}: ${startNode} → ${endNode}`
        );

        if (
            startNode < 0 ||
            endNode < 0 ||
            startNode >= graphNodes.length ||
            endNode >= graphNodes.length
        ) {

            console.error("Invalid graph node", {
                startNode,
                endNode
            });

            return [];

        }

        const nodePath = shortestPath(
            startNode,
            endNode
        );

        if (!nodePath || nodePath.length === 0) {

            console.warn("No route found.");

            return [];

        }

        const coordinates = nodePath.map(id => [

            graphNodes[id][0],
            graphNodes[id][1]

        ]);

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