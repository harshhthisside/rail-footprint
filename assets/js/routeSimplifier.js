// ==========================================
// Rail Footprint
// Route Simplifier (fast uniform + endpoint keep)
// ==========================================

/**
 * Downsample a coordinate route for map rendering.
 * Keeps first/last points and steps uniformly so long corridors stay smooth.
 * @param {Array<[number,number]>} route
 * @param {number} maxPoints
 */
export function simplifyRoute(route, maxPoints = 2500) {
    if (!route || route.length <= maxPoints) return route;

    const step = Math.ceil(route.length / maxPoints);
    const simplified = [route[0]];

    for (let i = step; i < route.length - 1; i += step) {
        simplified.push(route[i]);
    }

    const last = route[route.length - 1];
    if (simplified[simplified.length - 1] !== last) {
        simplified.push(last);
    }

    return simplified;
}
