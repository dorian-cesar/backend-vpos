# Documentación del Flujo de Preautorización en Gateway `/api/pagosimple`

Esta documentación detalla los endpoints, payloads de petición y respuestas crudas que se intercambian para realizar el flujo de preautorización utilizando el **Gateway Unificado (`/api/pagosimple`)**.

El flujo consta de tres fases principales:
1. **Inicio de Preautorización (single-buy)**
2. **Webhook de confirmación de retención (confirm_payment)** *(Ejecutado por Bancard de forma asíncrona)*
3. **Captura Final (preauth-confirm)** o **Cancelación (rollback)**

---

## 1. Inicialización de la Preautorización (`single-buy`)

El frontend inicia el proceso solicitando una preautorización (bloqueo temporal de fondos). El backend procesa los datos, genera el token hash y solicita el identificador a Bancard.

- **Endpoint:** `POST /api/pagosimple`
- **Descripción:** Registra la intención de compra e indica a Bancard que retenga los fondos enviando la propiedad `"preauthorization": true`.

### Petición del Frontend (Request Payload)
```json
{
  "action": "single-buy",
  "servicio": "Tester Panel",
  "canal": "web",
  "id": "TEST-FRONT-1783692729395",
  "amount": 15000,
  "currency": "PYG",
  "preauthorization": true,
  "description": "Compra de prueba con Factura Electronica",
  "returnUrl": "http://localhost:3002/confirm_payment",
  "cancelUrl": "http://localhost:3002/confirm_payment",
  "billing": {
    "client_ruc": "123456-7",
    "client_name": "JUAN GONZALEZ",
    "client_email": "juangonzalez@mail.com.py",
    "details": [
      {
        "description": "Item de Prueba Facturacion 10 IVA",
        "amount": "15000.00",
        "iva_rate": 10,
        "total_items": 1
      }
    ]
  }
}
```

### Respuesta del Backend (Response Payload)
*Respuesta cruda e intacta provista por Bancard:*
```json
{
  "status": "success",
  "process_id": "*1peOb.UYgnW3KI.UQST"
}
```

> [!NOTE]
> El frontend debe utilizar el valor devuelto en `process_id` (por ejemplo, `*1peOb.UYgnW3KI.UQST`) para inicializar el SDK Javascript de Infonet y renderizar el iframe donde el cliente completará sus datos bancarios.

---

## 2. Webhook de Notificación de Retención (`confirm_payment`)

Una vez que el usuario ingresa sus datos y confirma el pago dentro del iframe, Bancard llama de forma asíncrona al webhook de nuestro backend para notificar que los fondos fueron exitosamente retenidos en la tarjeta del cliente.

- **Endpoint:** `POST /confirm_payment` (o `POST /api/bancard/confirm`)
- **Descripción:** Notificación asíncrona enviada por Bancard a nuestro servidor.

### Petición de Bancard hacia el Webhook (Request Payload)
```json
{
  "operation": {
    "co_id": 12345,
    "shop_process_id": 169135188815673,
    "response": "S",
    "response_details": "Procesado Satisfactoriamente",
    "amount": "15000.00",
    "currency": "PYG",
    "authorization_number": "915677",
    "ticket_number": "2119175218",
    "response_code": "00",
    "response_description": "Transaccion aprobada",
    "extended_response_description": "",
    "security_information": {
      "card_source": "L",
      "customer_ip": "200.111.155.148",
      "card_country": "PARAGUAY",
      "version": "0.3",
      "risk_index": 0
    }
  }
}
```

### Respuesta del Backend hacia Bancard (Response Payload)
```json
{
  "status": "success"
}
```

---

## 3. Fase Final: Captura o Liberación de Fondos

Dependiendo de si el servicio del comercio se pudo proveer correctamente o falló, el frontend debe solicitar la captura de fondos o su liberación inmediata.

### OPCIÓN A: Confirmación y Captura Final (`preauth-confirm`)
Se llama a este endpoint para consolidar el cobro de la preautorización. En este paso Bancard también asienta la facturación electrónica en el sistema integrado (TAXIT).

- **Endpoint:** `POST /api/pagosimple`
- **Descripción:** Confirma el cobro de los fondos previamente retenidos.

#### Petición del Frontend (Request Payload)
```json
{
  "action": "preauth-confirm",
  "processId": "*1peOb.UYgnW3KI.UQST",
  "amount": 15000
}
```

#### Respuesta del Backend (Response Payload)
*Respuesta cruda e intacta provista por Bancard:*
```json
{
  "status": "success",
  "operation": {
    "token": "8644f184c99ae9401205ed0519be53d7",
    "shop_process_id": 169135188815673,
    "response": "S",
    "response_details": "Procesado Satisfactoriamente",
    "amount": "15000.00",
    "currency": "PYG",
    "authorization_number": "915678",
    "ticket_number": "2119175220",
    "response_code": "00",
    "response_description": "Transaccion aprobada",
    "extended_response_description": "",
    "security_information": {
      "card_source": "L",
      "customer_ip": "200.111.155.148",
      "card_country": "PARAGUAY",
      "version": "0.3",
      "risk_index": 0
    },
    "billing_response": {
      "status": "success",
      "description": "Factura generada correctamente",
      "data": {
        "invoice_number": "001-001-0013986"
      }
    }
  }
}
```

---

### OPCIÓN B: Liberación de fondos (`rollback`)
Si el boleto no pudo emitirse o el usuario canceló el servicio, se debe anular la preautorización para liberar el bloqueo sobre la tarjeta de forma inmediata.

- **Endpoint:** `POST /api/pagosimple`
- **Descripción:** Libera instantáneamente el saldo retenido al cliente sin cobrarle comisiones.

#### Petición del Frontend (Request Payload)
```json
{
  "action": "rollback",
  "processId": "*1peOb.UYgnW3KI.UQST"
}
```

#### Respuesta del Backend (Response Payload)
*Respuesta cruda e intacta provista por Bancard:*
```json
{
  "status": "success"
}
```

---

## 4. Consulta de Shop Process ID (Endpoint de Soporte)

Dado que Bancard sólo devuelve el `process_id` al frontend durante la inicialización del `single-buy`, el frontend carece del identificador interno unificado (`shop_process_id`). Para facilitar que el frontend obtenga este dato para uso interno (ej. para sus propios registros o consultas), hemos expuesto un endpoint.

- **Endpoint:** `GET /api/bancard/shop-process-id/:processId`
- **Descripción:** Devuelve el `shop_process_id` interno a partir de un `process_id` previamente devuelto por Bancard.

### Petición del Frontend (Path Parameter)
```text
GET /api/bancard/shop-process-id/*1peOb.UYgnW3KI.UQST
```

### Respuesta del Backend (Éxito - 200 OK)
```json
{
  "status": "success",
  "data": {
    "shopProcessId": 169135188815673
  }
}
```

### Respuesta del Backend (Error - 404 Not Found)
```json
{
  "status": "error",
  "message": "shopProcessId no encontrado para el processId proveido."
}
```
