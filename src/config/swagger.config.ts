import swaggerJSDoc from 'swagger-jsdoc';
import 'dotenv/config';

const baseUrl = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3002}`;

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Bancard vPOS - Integración',
      version: '1.0.0',
      description: 'Documentación de los endpoints para la integración con Bancard vPOS (Compra Simple).',
      contact: {
        name: 'Soporte',
      },
    },
    servers: [
      {
        url: baseUrl,
        description: 'Servidor Actual',
      },
    ],
  },
  // Documentamos las rutas buscando anotaciones JSDoc en los archivos especificados
  apis: ['./src/routes/*.ts', './src/server.ts'],
};

export const swaggerSpec = swaggerJSDoc(options);
