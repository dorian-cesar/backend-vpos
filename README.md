# 🏦 Bancard vPOS Backend — Node.js

Backend para integración con el **vPOS de Bancard** (eCommerce Compra Simple v1.22), implementando los patrones de diseño **Strategy** y **Adapter**.

---

## 🏗️ Arquitectura de Patrones

```
┌─────────────────────────────────────────────────────────┐
│                        Cliente                          │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP Request
┌──────────────────────────▼──────────────────────────────┐
│                   Express Routes                        │
│              /api/bancard/*                             │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                bancardController.js                     │
│            (Validación + Formato Respuesta)             │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│           BancardService.js  [ORQUESTADOR]              │
│                                                         │
│  ┌────────────────────┐   ┌─────────────────────────┐  │
│  │   STRATEGY         │   │   ADAPTER               │  │
│  │                    │   │                         │  │
│  │ BancardStrategy    │──▶│ BancardHttpAdapter      │  │
│  │   (interfaz base)  │   │   (axios + interceptors)│  │
│  │                    │   │                         │  │
│  │ ┌────────────────┐ │   │  .singleBuy()           │  │
│  │ │ Staging        │ │   │  .rollback()            │  │
│  │ │ Strategy       │ │   │  .getConfirmation()     │  │
│  │ └────────────────┘ │   │  .chargeBack()          │  │
│  │ ┌────────────────┐ │   └─────────────┬───────────┘  │
│  │ │ Production     │ │                 │              │
│  │ │ Strategy       │ │                 │              │
│  │ └────────────────┘ │                 │              │
│  └────────────────────┘                 │              │
└─────────────────────────────────────────┼──────────────┘
                                          │ HTTPS
┌─────────────────────────────────────────▼──────────────┐
│               API de Bancard vPOS                       │
│   Staging:    https://vpos.infonet.com.py:8888          │
│   Production: https://vpos.infonet.com.py               │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Estructura del Proyecto

```
backend-vpos/
├── src/
│   ├── config/
│   │   └── bancard.config.js         # Configuración centralizada
│   ├── strategies/
│   │   ├── BancardStrategy.js        # Interfaz base (Strategy)
│   │   ├── BancardStagingStrategy.js # Estrategia staging
│   │   └── BancardProductionStrategy.js # Estrategia producción
│   ├── adapters/
│   │   └── BancardHttpAdapter.js     # Adapter HTTP ↔ Bancard API
│   ├── services/
│   │   └── BancardService.js         # Lógica de negocio
│   ├── controllers/
│   │   └── bancardController.js      # Handlers Express
│   ├── routes/
│   │   └── bancard.routes.js         # Definición de rutas + validaciones
│   ├── middleware/
│   │   ├── errorHandler.js           # Manejo global de errores
│   │   └── requestLogger.js          # Logging de requests
│   └── utils/
│       └── tokenGenerator.js         # Generación de tokens MD5
├── .env.example
├── .gitignore
├── package.json
├── server.js                         # Entry point
└── README.md
```

---

## 🚀 Instalación y Configuración

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con tus credenciales de Bancard:

```env
PORT=3000
NODE_ENV=staging

BANCARD_PUBLIC_KEY=tu_clave_publica
BANCARD_PRIVATE_KEY=tu_clave_privada

BANCARD_STAGING_URL=https://vpos.infonet.com.py:8888
BANCARD_PRODUCTION_URL=https://vpos.infonet.com.py

APP_URL=http://localhost:3000
RETURN_URL=http://localhost:3000/payment/success
CANCEL_URL=http://localhost:3000/payment/cancel
```

### 3. Iniciar el servidor

```bash
# Desarrollo (con auto-reload)
npm run dev

# Producción
npm start
```

---

## 📋 Endpoints

### `GET /api/bancard/health`
Health check del servicio.

**Respuesta:**
```json
{
  "status": "ok",
  "service": "Bancard vPOS",
  "environment": "staging",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### `POST /api/bancard/single-buy`
Inicia una compra simple. Retorna `process_id` y URL del iframe.

**Body:**
```json
{
  "shopProcessId": 12345,
  "amount": 150000.00,
  "currency": "PYG",
  "description": "Compra de producto X",
  "additionalData": "opcional",
  "returnUrl": "https://tu-sitio.com/pago/exito",
  "cancelUrl": "https://tu-sitio.com/pago/cancelado"
}
```

**Respuesta exitosa:**
```json
{
  "status": "success",
  "message": "Compra iniciada exitosamente.",
  "data": {
    "processId": "abc123xyz",
    "iframeUrl": "https://vpos.infonet.com.py:8888/payment/card/new_hp?process_id=abc123xyz",
    "environment": "staging"
  }
}
```

**Flujo en el frontend:** Usar `iframeUrl` para renderizar el iframe de pago de Bancard.

---

### `POST /api/bancard/rollback`
Revierte una transacción no confirmada.

**Body:**
```json
{ "shopProcessId": 12345 }
```

---

### `GET /api/bancard/confirmation/:shopProcessId`
Consulta el estado de una transacción.

**Ejemplo:** `GET /api/bancard/confirmation/12345`

---

### `POST /api/bancard/charge-back`
Realiza un contracargo (devolución).

**Body:**
```json
{
  "shopProcessId": 12345,
  "amount": 150000.00,
  "currency": "PYG"
}
```

---

### `POST /api/bancard/confirm` ⚠️ Webhook
Endpoint que **Bancard llama automáticamente** cuando un pago se completa.

> ⚠️ **Esta URL debe registrarse en el Portal de Comercios de Bancard.**
> En desarrollo local, usar [ngrok](https://ngrok.com) para exponerla:
> ```bash
> ngrok http 3000
> # Registrar: https://xxxx.ngrok.io/api/bancard/confirm
> ```

---

## 🔐 Seguridad de Tokens (MD5)

Los tokens se generan según la documentación oficial de Bancard v1.22:

| Operación | Fórmula |
|---|---|
| `single_buy` | `md5(private_key + shop_process_id + amount + currency)` |
| `rollback` | `md5(private_key + shop_process_id + "rollback" + "0.00" + "PYG")` |
| `get_confirmation` | `md5(private_key + shop_process_id + "get_confirmation")` |
| `charge_back` | `md5(private_key + shop_process_id + "charge_back" + amount + currency)` |

---

## 🧪 Prueba con curl

```bash
# Health check
curl http://localhost:3000/api/bancard/health

# Iniciar compra
curl -X POST http://localhost:3000/api/bancard/single-buy \
  -H "Content-Type: application/json" \
  -d '{
    "shopProcessId": 99999,
    "amount": 10000,
    "currency": "PYG",
    "description": "Prueba de pago"
  }'

# Consultar confirmación
curl http://localhost:3000/api/bancard/confirmation/99999

# Rollback
curl -X POST http://localhost:3000/api/bancard/rollback \
  -H "Content-Type: application/json" \
  -d '{ "shopProcessId": 99999 }'
```

---

## 📦 Dependencias

| Paquete | Versión | Uso |
|---|---|---|
| `express` | ^4.19 | Servidor HTTP |
| `axios` | ^1.7 | Cliente HTTP para Bancard API |
| `md5` | ^2.3 | Generación de tokens de seguridad |
| `dotenv` | ^16.4 | Variables de entorno |
| `cors` | ^2.8 | Cross-Origin Resource Sharing |
| `morgan` | ^1.10 | Logging HTTP |
| `express-validator` | ^7.1 | Validación de requests |
| `nodemon` | ^3.1 | Auto-reload en desarrollo |

---

## 📚 Documentación Oficial

- [Portal de Comercios Bancard](https://comercios.bancard.com.py)
- Documentación: `eCommerce_bancard_compra_simple_version_1.22.pdf`
