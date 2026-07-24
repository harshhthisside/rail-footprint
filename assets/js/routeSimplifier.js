// ==========================================
// Route Simplifier
// ==========================================

export function simplifyRoute(route, maxPoints = 2000) {

    if (!route || route.length <= maxPoints)
        return route;

    const step = Math.ceil(route.length / maxPoints);

    const simplified = [];

    for (let i = 0; i < route.length; i += step) {

        simplified.push(route[i]);

    }

    // Always keep last point

    if (
        simplified[simplified.length - 1] !==
        route[route.length - 1]
    ) {

        simplified.push(route[route.length - 1]);

    }

    return simplified;

}