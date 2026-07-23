export interface RouteMatch {
    matched: boolean;
    params: Record<string, string>;
}

function splitPath(path: string): string[] {
    return path.split("/").filter(Boolean)
}

export function matchRoute(routePath: string, requestPath: string): RouteMatch {
    const routeSegments = splitPath(routePath);
    const requestSegments = splitPath(requestPath);

    if (routeSegments.length != requestSegments.length) {
        return {
            matched: false,
            params: {}
        }
    }

    const params: Record<string, string> = {};

    for (let index = 0; index < routeSegments.length; index += 1) {
        const routeSegment = routeSegments[index];
        const requestSegment = requestSegments[index];

        if (routeSegment.startsWith(":")) {
            const paramterName = routeSegment.slice(1);
            params[paramterName] = decodeURIComponent(requestSegment)
            continue;
        }

        if (routeSegment !== requestSegment) {
            return {
                matched: false,
                params: {}
            }
        }
    }

    return {
        matched: true,
        params: {}
    }

}