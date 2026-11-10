import { PORT } from './config.js';
import { createHttpServer } from './http/app.js';

const server = createHttpServer();

server.listen(PORT, () => {
  console.log(`Ticketing server listening on port ${PORT}`);
});
