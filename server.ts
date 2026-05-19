import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';

async function startServer() {
  const app = express();
  let PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  let currentState: any = null;
  let clients: express.Response[] = [];

  // API to get current state immediately
  app.get('/api/state', (req, res) => {
    res.json(currentState || {});
  });

  // API to update state
  app.post('/api/state', (req, res) => {
    currentState = req.body;
    // Notify all SSE clients
    let deadClients: express.Response[] = [];
    clients.forEach(client => {
      try {
        client.write(`data: ${JSON.stringify(currentState)}\n\n`);
      } catch (e) {
        deadClients.push(client);
      }
    });
    clients = clients.filter(c => !deadClients.includes(c));
    res.json({ success: true });
  });

  // SSE endpoint for presentation listeners
  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial state immediately
    if (currentState) {
      res.write(`data: ${JSON.stringify(currentState)}\n\n`);
    }

    clients.push(res);

    req.on('close', () => {
      clients = clients.filter(c => c !== res);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const startListening = () => {
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
    server.on('error', (e: any) => {
      if (e.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is in use, trying ${PORT + 1}...`);
        PORT++;
        startListening();
      } else {
        console.error('Server error:', e);
      }
    });
  };
  startListening();
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
