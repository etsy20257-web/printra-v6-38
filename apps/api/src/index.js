import 'dotenv/config';
import { createApp } from './server.js';

const port = Number(process.env.PORT || 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`[printra-api] listening on http://localhost:${port}`);
});
