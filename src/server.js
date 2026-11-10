import { DATABASE_PATH, PORT } from './config.js';
import { closeDatabase, openDatabase } from './db/connection.js';
import { createHttpServer } from './http/app.js';
import { createSQLiteRepository } from './repositories/sqlite.js';

const database = openDatabase(DATABASE_PATH);
const server = createHttpServer({
  repository: createSQLiteRepository(database),
});

server.listen(PORT, () => {
  console.log(`Ticketing server listening on port ${PORT}`);
});

server.once('close', () => closeDatabase(database));
