import path from 'node:path';

function parsePort(value) {
  if (value === undefined || value === '') {
    return 3000;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
}

export const PORT = parsePort(process.env.PORT);
export const DATABASE_PATH = process.env.DATABASE_PATH ?? path.resolve('data', 'ticketing.db');
