import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import feedbackRouter from './routes/feedback.js';
import authRouter from './routes/auth.js';
import projectsRouter from './routes/projects.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Enable CORS for all origins
app.use(cors({ origin: '*' }));

// Body parser with 50mb limit to handle high-res base64 screenshots
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health Check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'Prototype Feedback API', database: 'SQLite', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/feedback', feedbackRouter);
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);

// Serve static client assets and demo page
const clientDistPath = path.resolve(__dirname, '../../client/dist');
const clientRootPath = path.resolve(__dirname, '../../client');

app.use('/dist', express.static(clientDistPath));
app.use(express.static(clientRootPath));

// Fallback route to serve demo index.html
app.get('/', (_req, res) => {
  res.sendFile(path.join(clientRootPath, 'index.html'));
});

// Start Server
app.listen(config.port, () => {
  console.log(`
=====================================================
🚀 Prototype Feedback Backend API Server Running (SQLite)
=====================================================
📡 URL: http://localhost:${config.port}
📌 Feedback Endpoint: POST http://localhost:${config.port}/api/feedback
🔐 Auth Endpoint: POST http://localhost:${config.port}/api/auth/google
🟢 Health Check: GET http://localhost:${config.port}/health
💻 Demo Web Page: GET http://localhost:${config.port}/
=====================================================
  `);
});

export default app;
