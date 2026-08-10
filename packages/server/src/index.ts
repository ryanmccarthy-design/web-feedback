import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import feedbackRouter from './routes/feedback.js';

const app = express();

// Enable CORS for all origins (supports prototypes on Netlify, Vercel, localhost, etc.)
app.use(cors({ origin: '*' }));

// Body parser with 50mb limit to handle high-res base64 screenshots
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'Prototype Feedback API', timestamp: new Date().toISOString() });
});

app.use('/api/feedback', feedbackRouter);

// Start Server
app.listen(config.port, () => {
  console.log(`
=====================================================
🚀 Prototype Feedback Backend API Server Running
=====================================================
📡 URL: http://localhost:${config.port}
📌 Feedback Endpoint: POST http://localhost:${config.port}/api/feedback
🟢 Health Check: GET http://localhost:${config.port}/health
=====================================================
  `);
});

export default app;
