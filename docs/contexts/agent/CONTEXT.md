# Orientación conversacional

Lenguaje de Agent Trujillo como orientador autónomo desacoplado del profesional.

## Language

**Sesión de agente**:
Conversación durable ligada de forma inmutable a un tutor, espacio de cuidado y niño activo.
_Avoid_: Chat, thread with mutable child

**Orientación pediátrica**:
Información educativa y contextualizada dentro de capacidades básicas aprobadas.
_Avoid_: Consultation, diagnosis, treatment

**Tool clínica**:
Operación tipada que solicita a un módulo determinista leer, evaluar o registrar un hecho dentro de un alcance autorizado.
_Avoid_: Function call with database access, model action

**Confirmación del tutor**:
Aprobación explícita de un payload completamente presentado antes de una escritura sensible.
_Avoid_: Approval from doctor, implicit consent

**Memoria clínica**:
Colección de hechos y resúmenes con procedencia que pueden recuperarse únicamente para el mismo niño.
_Avoid_: Global RAG, chat history, medical record

**Candidato de memoria**:
Observación extraída de una conversación que aún no ha sido confirmada como hecho estructurado.
_Avoid_: Auto-synced clinical fact

**Abstención**:
Respuesta explícita que reconoce que una solicitud no puede resolverse de forma segura y recomienda consulta pediátrica.
_Avoid_: Agent failure, empty response

**Widget generativo**:
Payload estructurado y versionado que un cliente transforma mediante un registro local permitido.
_Avoid_: Remote component, executable UI

**Evaluación de red flags**:
Decisión determinista anterior al LLM que selecciona respuesta normal o recomendación de urgencias.
_Avoid_: Trigger red flag alert, diagnosis classifier
