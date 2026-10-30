// Starts the demo on node:http, adapting each incoming request to the web Request/Response API.
// Run from the repository root:  npm run demo -w @swv/demo-store
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { buffer } from 'node:stream/consumers';

import { type App, createApp } from './app/app.ts';
import { DEMO_TOKEN } from './seed.ts';

const HOST = '127.0.0.1';

function homePage(app: App, baseUrl: string): string {
  const body = JSON.stringify({
    items: [{ productId: 'p_1', quantity: 1 }],
    shippingAddress: { line1: '1 Lovelace Lane', city: 'Pune', postcode: '411001' },
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${app.config.shopName}</title></head>
<body style="font-family:system-ui;max-width:48rem;margin:3rem auto;line-height:1.5">
<h1>${app.config.shopName}</h1>
<p>This is the small, real project behind the Sequence Walkthrough demo flow "Place an order".
Everything runs in memory: the database, Redis, the event bus, the mail queue and the mailer are
stand-ins, so the only endpoint is <code>POST /api/orders</code>. Try it, then watch this terminal
for the confirmation email the worker sends.</p>
<pre>curl -X POST ${baseUrl}/api/orders \\
  -H "Authorization: Bearer ${DEMO_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '${body}'</pre>
</body></html>
`;
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const method = req.method ?? 'GET';
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (value) headers.set(name, value.join(', '));
  }
  const body = method === 'GET' || method === 'HEAD' ? null : await buffer(req);
  return new Request(`http://${req.headers.host ?? HOST}${req.url ?? '/'}`, { method, headers, body });
}

async function respond(app: App, baseUrl: string, req: IncomingMessage, res: ServerResponse) {
  try {
    const response =
      req.method === 'GET' && req.url === '/'
        ? new Response(homePage(app, baseUrl), { headers: { 'content-type': 'text/html' } })
        : await app.handle(await toWebRequest(req));
    res.writeHead(response.status, response.statusText, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500).end();
  }
}

function startServer(): void {
  const app = createApp({
    onMail: (mail) => {
      process.stdout.write(`\n[mail] to ${mail.to}\n[mail] ${mail.subject}\n[mail] ${mail.text}\n`);
    },
  });
  const baseUrl = `http://${HOST}:${app.config.port}`;
  const server = createServer((req, res) => {
    void respond(app, baseUrl, req, res);
  });
  // The worker and the cron run every second, as they would in a real deployment.
  setInterval(() => {
    app.worker.runOnce();
    app.cron.tick(Date.now());
  }, 1000);
  server.listen(app.config.port, HOST, () => {
    process.stdout.write(`${app.config.shopName} is listening on ${baseUrl}\n`);
  });
}

startServer();
