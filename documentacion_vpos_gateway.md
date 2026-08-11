# 📖 Documentación de Endpoints del Gateway Bancard vPOS

Esta documentación detalla los endpoints REST y la API unificada del Gateway **`backend-vpos`** para procesar cobros, devoluciones, consultas, facturación electrónica (CDC) y catastro de tarjetas con **Bancard vPOS**.

---

## 🚀 1. Gateway Unificado de Pago Simple (`POST /api/pagosimple`)

El endpoint principal del sistema es **`POST /api/pagosimple`**. Centraliza todas las operaciones de la pasarela mediante el parámetro `"action"` en el JSON del cuerpo de la petición.

---

### 1.1 Iniciar Pago (`action: "single-buy"`)
Inicia una transacción de compra. El backend genera internamente un `shopProcessId` numérico de 15 dígitos con prefijo por canal y retorna la URL del iframe y SDK de Bancard.

* **Método:** `POST`
* **URL:** `/api/pagosimple`
* **Payload:**
```json
{
  "action": "single-buy",
  "amount": 25000,
  "currency": "PYG",
  "description": "Compra de Boleto de Bus",
  "preauthorization": false,
  "billing": {
    "client_ruc": "12345678-9",
    "client_name": "MARIA PEREZ",
    "client_email": "maria@ejemplo.com",
    "details": [
      {
        "description": "Pasaje Asunción -> CDE",
        "amount": 25000,
        "iva_rate": 10,
        "total_items": 1
      }
    ]
  },
  "returnUrl": "https://mi-frontend.com/pago/exitoso",
  "cancelUrl": "https://mi-frontend.com/pago/cancelado",
  "servicio": "boletos",
  "canal": "totem-100",
  "id": "VENTA-1001"
}
```

* **Respuesta Exitosa (`200 OK`):**
```json
{
  "status": "success",
  "action": "single-buy",
  "message": "Compra iniciada exitosamente.",
  "data": {
    "processId": "0o6QLO.BserHj8RP-rVX",
    "shopProcessId": 269185123132948,
    "iframeUrl": "https://vpos.infonet.com.py/payment/single_buy?process_id=0o6QLO.BserHj8RP-rVX",
    "sdkUrl": "https://vpos.infonet.com.py/checkout/javascript/dist/bancard-checkout-4.0.0.js",
    "environment": "production"
  }
}
```

---

### 1.2 Consultar Estado / Obtener CDC (`action: "confirmation"`)
Consulta el estado de una transacción. Si la compra fue aprobada y se recibió el Webhook, retorna la confirmación del pago junto con el **Número de Factura** y **CDC** extraídos automáticamente por el servicio de scraping.

* **Método:** `POST`
* **URL:** `/api/pagosimple`
* **Payload:**
```json
{
  "action": "confirmation",
  "processId": "0o6QLO.BserHj8RP-rVX"
}
```

* **Respuesta Exitosa (`200 OK`):**
```json
{
  "status": "success",
  "action": "confirmation",
  "message": "Confirmación obtenida correctamente.",
  "data": {
    "processId": "0o6QLO.BserHj8RP-rVX",
    "status": "success",
    "confirmation": {
      "responseCode": "00",
      "responseDescription": "Transaccion aprobada",
      "ticketNumber": "5577771220",
      "authorizationNumber": "254375",
      "amount": 25000,
      "currency": "PYG",
      "cardBrand": "VISA",
      "cardMaskedNumber": "411111******1111",
      "electronicBillNumber": "001-001-0000019",
      "electronicBillCdc": "01801715709001001000001912026072819538538588",
      "commerceStamp": "18903263"
    }
  }
}
```

---

### 1.3 Reversión / Anulación Pendiente (`action: "rollback"`)
Revierte una transacción en caso de cancelación del usuario o abandono del flujo antes de finalizar.

* **Método:** `POST`
* **URL:** `/api/pagosimple`
* **Payload:**
```json
{
  "action": "rollback",
  "processId": "0o6QLO.BserHj8RP-rVX"
}
```

* **Respuesta Exitosa (`200 OK`):**
```json
{
  "status": "success",
  "action": "rollback",
  "message": "Rollback ejecutado correctamente.",
  "data": {
    "processId": "0o6QLO.BserHj8RP-rVX",
    "processed": true,
    "messages": [
      {
        "key": "RollbackSuccessful",
        "level": "info",
        "dsc": "Transacción Aprobada"
      }
    ]
  }
}
```

---

### 1.4 Contracargo / Devolución (`action: "charge-back"`)
Ejecuta la devolución del dinero cargado a la tarjeta de un cliente para una compra ya cobrada.

* **Método:** `POST`
* **URL:** `/api/pagosimple`
* **Payload:**
```json
{
  "action": "charge-back",
  "processId": "0o6QLO.BserHj8RP-rVX",
  "amount": 25000,
  "currency": "PYG"
}
```

* **Respuesta Exitosa (`200 OK`):**
```json
{
  "status": "success",
  "action": "charge-back",
  "message": "Contracargo procesado correctamente.",
  "data": {
    "processId": "0o6QLO.BserHj8RP-rVX",
    "status": "success",
    "messages": []
  }
}
```

---

### 1.5 Confirmar Preautorización (`action: "preauth-confirm"`)
Captura y liquida una venta que fue iniciada previamente con `preauthorization: true`.

* **Método:** `POST`
* **URL:** `/api/pagosimple`
* **Payload:**
```json
{
  "action": "preauth-confirm",
  "processId": "0o6QLO.BserHj8RP-rVX",
  "amount": 25000
}
```

---

### 1.6 Iniciar Catastro de Tarjeta (`action: "cards-new"`)
Genera la sesión de iframe para registrar/guardar la tarjeta de un usuario de forma segura.

* **Método:** `POST`
* **URL:** `/api/pagosimple`
* **Payload:**
```json
{
  "action": "cards-new",
  "cardId": 12345,
  "userId": 99,
  "userCellPhone": "0981123456",
  "userMail": "usuario@ejemplo.com",
  "returnUrl": "https://mi-frontend.com/catastro/exito",
  "cancelUrl": "https://mi-frontend.com/catastro/cancelar"
}
```

---

### 1.7 Listar Tarjetas Guardadas (`action: "list-cards"`)
Retorna todas las tarjetas catastradas (`alias_token`) pertenecientes a un usuario.

* **Método:** `POST`
* **URL:** `/api/pagosimple`
* **Payload:**
```json
{
  "action": "list-cards",
  "userId": 99
}
```

---

### 1.8 Cobro con Tarjeta Guardada (`action: "charge"`)
Realiza un cobro directo sin mostrar iframe usando un `aliasToken` previamente catastrado.

* **Método:** `POST`
* **URL:** `/api/pagosimple`
* **Payload:**
```json
{
  "action": "charge",
  "aliasToken": "a1b2c3d4e5f6...",
  "amount": 25000,
  "currency": "PYG",
  "description": "Suscripción mensual"
}
```

---

### 1.9 Eliminar Tarjeta Guardada (`action: "delete-card"`)
Elimina una tarjeta catastrada del perfil del usuario.

* **Método:** `POST`
* **URL:** `/api/pagosimple`
* **Payload:**
```json
{
  "action": "delete-card",
  "userId": 99,
  "aliasToken": "a1b2c3d4e5f6..."
}
```

---

### 1.10 Cancelar Factura Electrónica (`action: "cancel-billing"`)
Solicita la anulación de la factura electrónica emitida en el sistema de Bancard.

* **Método:** `POST`
* **URL:** `/api/pagosimple`
* **Payload:**
```json
{
  "action": "cancel-billing",
  "processId": "0o6QLO.BserHj8RP-rVX"
}
```

---

## 🔔 2. Endpoints de Webhook y Callback Bancard

### 2.1 Webhook Notificador de Pago (`POST /confirm_payment`)
Endpoint registrado en la consola de Bancard donde sus servidores envían la notificación HTTP POST asíncrona una vez procesado el pago.

* **Método:** `POST`
* **URL:** `/confirm_payment`
* **Payload enviado por Bancard:**
```json
{
  "operation": {
    "token": "853973dce064006e699029c9a7f2d99f",
    "shop_process_id": 169185123132948,
    "response": "S",
    "response_details": "Procesado Satisfactoriamente",
    "amount": "25000.00",
    "currency": "PYG",
    "authorization_number": "254375",
    "ticket_number": "5577771220",
    "response_code": "00",
    "response_description": "Transaccion aprobada"
  }
}
```

---

## 🛠️ 3. Endpoints REST Directos Bancard (`/api/bancard/*`)

Además de la API unificada `/api/pagosimple`, el backend expone los endpoints REST directos equivalentes:

| Endpoint | Método | Acción Equivalente |
| :--- | :--- | :--- |
| `/api/bancard/single_buy` | `POST` | Iniciar pago directo |
| `/api/bancard/single_buy/confirmations` | `POST` | Consultar estado por `shopProcessId` |
| `/api/bancard/single_buy/rollback` | `POST` | Revertir pago por `shopProcessId` |
| `/api/bancard/single_buy/charge_back` | `POST` | Devolución por `shopProcessId` |
| `/api/bancard/cards/new` | `POST` | Iniciar catastro |
| `/api/bancard/users/:userId/cards` | `GET` | Listar tarjetas |
| `/api/bancard/charge` | `POST` | Cobrar con alias |
| `/api/bancard/users/:userId/cards/delete` | `POST` | Eliminar tarjeta |
| `/api/bancard/billing/cancel` | `POST` | Cancelar factura |
| `/api/bancard/preauthorizations/confirm` | `POST` | Confirmar preautorización |
