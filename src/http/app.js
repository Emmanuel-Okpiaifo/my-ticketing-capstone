import { realpath, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DomainError } from '../domain/errors.js';
import { Router } from './router.js';

const DEFAULT_PUBLIC_DIRECTORY = fileURLToPath(new URL('../../public/', import.meta.url));
const MAX_JSON_BYTES = 1_048_576;
const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function sendError(response, statusCode, code, message) {
  sendJson(response, statusCode, { error: { code, message } });
}

async function readJsonBody(request) {
  const contentType = request.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return undefined;
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_JSON_BYTES) {
      throw new DomainError('JSON request body is too large.', 'PAYLOAD_TOO_LARGE');
    }
    chunks.push(chunk);
  }

  if (bytes === 0) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new DomainError('Request body must contain valid JSON.', 'INVALID_JSON');
  }
}

async function serveStatic(response, publicDirectory, pathname, method) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendError(response, 400, 'INVALID_PATH', 'Request path is invalid.');
    return;
  }
  if (decodedPath.includes('\0')) {
    sendError(response, 400, 'INVALID_PATH', 'Request path is invalid.');
    return;
  }

  const root = path.resolve(publicDirectory);
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^[/\\]+/, '');
  const target = path.resolve(root, relativePath);
  const relativeTarget = path.relative(root, target);
  if (
    relativeTarget === '..' ||
    relativeTarget.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeTarget)
  ) {
    sendError(response, 404, 'NOT_FOUND', 'Resource not found.');
    return;
  }

  try {
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
    const realRelativeTarget = path.relative(realRoot, realTarget);
    if (
      realRelativeTarget === '..' ||
      realRelativeTarget.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelativeTarget)
    ) {
      sendError(response, 404, 'NOT_FOUND', 'Resource not found.');
      return;
    }

    const fileInfo = await stat(realTarget);
    if (!fileInfo.isFile()) {
      sendError(response, 404, 'NOT_FOUND', 'Resource not found.');
      return;
    }

    const contentType =
      CONTENT_TYPES.get(path.extname(realTarget).toLowerCase()) ?? 'application/octet-stream';
    const contents = method === 'HEAD' ? null : await readFile(realTarget);
    response.writeHead(200, {
      'content-length': fileInfo.size,
      'content-type': contentType,
      'x-content-type-options': 'nosniff',
    });
    response.end(contents);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      sendError(response, 404, 'NOT_FOUND', 'Resource not found.');
      return;
    }
    throw error;
  }
}

function createApplicationRouter() {
  const router = new Router();
  router.add('GET', '/health', (_context) => ({
    statusCode: 200,
    body: { status: 'ok' },
  }));
  return router;
}

export function createApp({ publicDirectory = DEFAULT_PUBLIC_DIRECTORY } = {}) {
  const router = createApplicationRouter();

  return async function app(request, response) {
    try {
      const requestUrl = new URL(request.url, 'http://localhost');
      const body = await readJsonBody(request);
      if (requestUrl.pathname === '/health' && request.method === 'GET') {
        const route = router.match(request.method, requestUrl.pathname);
        const result = await route.handler({
          request,
          params: route.params,
          query: requestUrl.searchParams,
          body,
        });
        sendJson(response, result.statusCode ?? 200, result.body);
        return;
      }

      if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
        sendError(response, 404, 'NOT_FOUND', 'API route not found.');
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendError(response, 404, 'NOT_FOUND', 'Resource not found.');
        return;
      }
      await serveStatic(response, publicDirectory, requestUrl.pathname, request.method);
    } catch (error) {
      if (error instanceof DomainError) {
        const statusCode =
          error.code === 'INVALID_JSON' || error.code === 'INVALID_PATH'
            ? 400
            : error.code === 'PAYLOAD_TOO_LARGE'
              ? 413
              : 400;
        sendError(response, statusCode, error.code, error.message);
        return;
      }
      sendError(response, 500, 'INTERNAL_ERROR', 'Internal server error.');
    }
  };
}

export function createHttpServer(options) {
  return createServer(createApp(options));
}
