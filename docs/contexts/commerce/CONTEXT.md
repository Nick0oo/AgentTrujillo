# Acceso comercial

Lenguaje del acceso Free/Premium independiente del proveedor de pago.

## Language

**Plan**:
Conjunto comercial versionado de capacidades, cuotas y límites ofrecidos a un espacio de cuidado.
_Avoid_: Stripe price, App Store product

**Compra**:
Transacción verificada que se origina en Apple, Google, Stripe o una asignación administrativa.
_Avoid_: Subscription, entitlement

**Evento de ledger**:
Hecho inmutable e idempotente recibido de un proveedor que modifica la historia comercial.
_Avoid_: Webhook row, current status

**Entitlement**:
Derecho vigente a una capacidad derivado del ledger comercial y no del estado local de un proveedor.
_Avoid_: Premium flag, Stripe subscription

**Capacidad**:
Acción concreta que un plan permite o limita, como análisis avanzado o seguimiento multi-niño.
_Avoid_: Feature flag, screen access
