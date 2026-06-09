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
import bancardRoutes, { pagoSimpleRouter } from './routes/bancard.routes.js';
import { paymentSuccessHandler, confirmWebhook } from './controllers/bancardController.js';
import errorHandler from './middleware/errorHandler.js';
import requestLogger from './middleware/requestLogger.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.config.js';
import { checkDbConnection } from './config/db.config.js';
import { PagoSimpleAudit } from './models/PagoSimpleAudit.js';

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
app.use('/api', pagoSimpleRouter);

// Ruta para la redirección después del iframe (Bancard returnUrl)
app.get('/confirm_payment', paymentSuccessHandler);
// Ruta para el Webhook de confirmación que envía Bancard
app.post('/confirm_payment', confirmWebhook);

// Swagger
if (process.env.SWAGGER_VISIBLE === 'true') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

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

app.listen(PORT, async () => {
  const baseUrl = process.env.APP_BASE_URL ?? `http://localhost:${PORT}`;

  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   🏦  Bancard vPOS Backend (TypeScript)    ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`\n🚀 Servidor escuchando en el puerto: ${PORT}`);
  console.log(`🔗 URL Base del API: ${baseUrl}`);
  console.log(`📦 Entorno Bancard: ${(process.env.BANCARD_ENVIRONMENT ?? 'staging').toUpperCase()}`);
  console.log('\n📋 Endpoints:');
  console.log(`   GET  ${baseUrl}/api/bancard/health`);
  console.log(`   POST ${baseUrl}/api/pagosimple`);
  console.log(`   POST ${baseUrl}/api/bancard/single-buy`);
  console.log(`   POST ${baseUrl}/api/bancard/rollback`);
  console.log(`   GET  ${baseUrl}/api/bancard/confirmation/:shopProcessId`);
  console.log(`   POST ${baseUrl}/api/bancard/charge-back`);
  console.log(`   POST ${baseUrl}/api/bancard/confirm  ← Webhook`);
  if (process.env.SWAGGER_VISIBLE === 'true') {
    console.log(`   📚   ${baseUrl}/api-docs  ← Swagger UI`);
  }
  console.log('\n⚙️  Revisa tu .env para confirmar configuraciones.\n');

  // ─── Inicialización de la base de datos ─────────────────────────────────
  console.log('\n🗄️  Verificando conexión a base de datos AWS...');
  const dbOk = await checkDbConnection();
  if (dbOk) {
    // Crea las tablas si no existen (idempotente, seguro de re-ejecutar)
    await PagoSimpleAudit.initTable();
  } else {
    console.warn('[DB] ⚠️  El servidor inicia SIN base de datos. Los logs de auditoría no se guardarán.');
  }
});

export default app;
