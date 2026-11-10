function normalizeMethod(method) {
  if (typeof method !== 'string' || method.trim() === '') {
    throw new TypeError('Route method must be a non-empty string.');
  }
  return method.toUpperCase();
}

function routeSegments(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new TypeError('Route path must start with "/".');
  }
  return path.split('/').filter(Boolean);
}

export class Router {
  #routes = [];

  add(method, path, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Route handler must be a function.');
    }

    const normalizedMethod = normalizeMethod(method);
    const segments = routeSegments(path);
    if (this.#routes.some((route) =>
      route.method === normalizedMethod && route.path === path
    )) {
      throw new TypeError(`Route ${normalizedMethod} ${path} is already registered.`);
    }
    this.#routes.push({ method: normalizedMethod, path, segments, handler });
    return this;
  }

  match(method, pathname) {
    const normalizedMethod = normalizeMethod(method);
    const segments = routeSegments(pathname);

    for (const route of this.#routes) {
      if (route.method !== normalizedMethod || route.segments.length !== segments.length) {
        continue;
      }

      const params = {};
      let matched = true;
      for (let index = 0; index < segments.length; index += 1) {
        const expected = route.segments[index];
        const actual = segments[index];
        if (expected.startsWith(':')) {
          if (expected.length === 1) {
            throw new TypeError('Route parameter names cannot be empty.');
          }
          params[expected.slice(1)] = decodeURIComponent(actual);
        } else if (expected !== actual) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return { handler: route.handler, params };
      }
    }

    return null;
  }
}
