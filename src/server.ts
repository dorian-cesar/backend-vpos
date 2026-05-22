/**
 * server.ts
 * Punto de entrada principal del backend Bancard vPOS (TypeScript).
 *
 * Arquitectura:
 * - Strategy Pattern → BancardStagingStrategy / BancardProductionStrategy
 * - Adapter Pattern  → BancardHttpAdapter encapsula la comunicación HTTP con Bancard
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import bancardRoutes from './routes/bancard.routes';
import errorHandler from './middleware/errorHandler';
import requestLogger from './middleware/requestLogger';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// ─── Middlewares ───────────────────────────────────────────────────────────

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
  app.use(requestLogger);
}

// ─── Rutas ─────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({
    service: 'Bancard vPOS Backend',
    version: '1.0.0',
    language: 'TypeScript',
    status: 'running',
    environment: process.env.NODE_ENV ?? 'staging',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/bancard', bancardRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
});

// Error handler global (siempre al final)
app.use(errorHandler);

// ─── Inicio del servidor ───────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   🏦  Bancard vPOS Backend (TypeScript)    ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`\n🚀 Servidor en http://localhost:${PORT}`);
  console.log(`📦 Entorno: ${(process.env.NODE_ENV ?? 'staging').toUpperCase()}`);
  console.log('\n📋 Endpoints:');
  console.log(`   GET  http://localhost:${PORT}/api/bancard/health`);
  console.log(`   POST http://localhost:${PORT}/api/bancard/single-buy`);
  console.log(`   POST http://localhost:${PORT}/api/bancard/rollback`);
  console.log(`   GET  http://localhost:${PORT}/api/bancard/confirmation/:shopProcessId`);
  console.log(`   POST http://localhost:${PORT}/api/bancard/charge-back`);
  console.log(`   POST http://localhost:${PORT}/api/bancard/confirm  ← webhook Bancard`);
  console.log('\n⚙️  Configura .env con tus credenciales de Bancard.\n');
});

export default app;
