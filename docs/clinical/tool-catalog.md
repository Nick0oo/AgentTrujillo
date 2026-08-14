# Catálogo de tools de Agent Trujillo

## Política común

Las tools son adapters tipados de interfaces deterministas. Eve suministra el `AuthorizedChildScope`; el modelo no recibe `care_space_id`, `guardian_id` ni `child_id` como parámetros de autoridad.

Toda tool declara:

- versión de schema;
- permisos requeridos;
- efecto `read`, `propose` o `write`;
- necesidad de confirmación;
- idempotency key para escrituras;
- paquete clínico aplicable;
- resultado discriminado y errores seguros;
- campos permitidos para auditoría.

## Tools iniciales

### `register_anthropometry`

Registra una medición confirmada y solicita la evaluación de crecimiento.

- Efecto: `write`.
- Permiso: `record`.
- Confirmación: obligatoria mostrando niño, tipo, fecha, valor y unidad.
- Inputs del modelo: tipo, valor, unidad, fecha declarada, método y procedencia.
- Validaciones: unidad UCUM permitida, rango físico de captura, fecha no futura, duplicado e idempotencia.
- Output: medición persistida, evaluación versionada o advertencia de medición no evaluable.
- No hace: diagnosticar ni corregir silenciosamente un valor implausible.

### `evaluate_vaccination_schedule`

Evalúa administraciones confirmadas contra el paquete de país y fecha aplicable.

- Efecto: `read`.
- Permiso: `read`.
- Confirmación: no.
- Contexto: país de cuidado, nacimiento y fecha de corte provienen del backend.
- Output: dosis aplicadas, próximas, pendientes, atrasadas, no aplicables y que requieren revisión, con reglas y fuentes.
- No hace: combinar PAI/ACIP, confirmar OCR ni decidir contraindicaciones.

### `suggest_pediatric_nutrition`

Genera orientación alimentaria básica dentro de un marco aprobado.

- Efecto: `read`.
- Permiso: `read`.
- Confirmación: no.
- Contexto: edad exacta/corregida, alergias declaradas, país y preferencias autorizadas.
- Output: pautas, menú o recetas, advertencias de textura/atragantamiento y fuentes.
- Abstiene: alergias graves, dietas terapéuticas, falla de medro, disfagia o datos críticos faltantes.
- No hace: tratar una condición o prometer adecuación nutricional individual.

### `validate_declared_pediatric_dose`

Nombre canónico que sustituye `validate_pediatric_safety_dosage`: evita afirmar seguridad absoluta y aclara que la dosis ya existe.

- Efecto: `read` con auditoría clínica.
- Permiso: `read`.
- Confirmación: no para validar; sí antes de crear un plan separado.
- Inputs: medicamento/presentación, concentración, cantidad, frecuencia, vía e indicación declarada.
- Contexto: edad y peso reciente verificado se obtienen del backend.
- Output: uno de los estados definidos en el contrato de seguridad, límites comparados, peso/fecha y versión del formulario.
- No hace: proponer medicamento, dosis alternativa o autorización para administrar.

### `capture_clinical_memory_candidate`

Nombre canónico que reemplaza la escritura automática implícita de `sync_clinical_record`.

- Efecto: `propose`.
- Permiso: `record`.
- Confirmación: según tipo de dato.
- Inputs: observación extraída, fecha aproximada, procedencia del mensaje y confianza de extracción.
- Output: candidato con estado `unconfirmed` o hecho confirmado después de un paso explícito.
- Confirmación siempre requerida: alergias, vacunas, medicación, antropometría y eventos clínicos.
- No hace: convertir texto del chat en diagnóstico o nota profesional.

### `evaluate_red_flags`

Reemplaza `trigger_red_flag_alert`, ya que el producto no crea alertas. Es una operación interna anterior al LLM y no una tool elegible libremente por el modelo.

- Efecto: `read`.
- Permiso: sesión autenticada.
- Confirmación: no.
- Inputs: mensaje normalizado y contexto mínimo de edad.
- Output: `NORMAL`, `NEEDS_CLARIFICATION` o `EMERGENCY_RECOMMENDATION`, con regla y versión.
- En urgente: termina el flujo generativo y emite el copy aprobado.
- No hace: diagnosticar, contactar, notificar, agendar ni recomendar esperar al doctor.

## Tools adicionales necesarias

### `get_growth_summary`

Devuelve series, evaluaciones y advertencias listas para `growth_summary`. Es solo lectura y nunca expone mediciones de otro niño.

### `record_vaccine_administration`

Registra una dosis declarada después de confirmación. OCR y fotos solo precargan un borrador; producto, fecha y procedencia deben confirmarse.

### `create_medication_plan`

Crea un plan a partir de una indicación ya existente. Requiere confirmación completa e idempotencia. Si la validación de referencia no puede ejecutarse, conserva el plan como `requires_professional_review` y no afirma seguridad.

### `record_medication_intake`

Registra tomada, omitida o pospuesta. Acepta reintentos sin duplicar y no modifica el plan original.

### `record_development_observation`

Guarda una observación del tutor con dominio, fecha, texto y adjuntos confirmados. No calcula EAD-3 ni etiqueta retrasos.

### `search_child_clinical_memory`

Recupera memoria del niño activo mediante filtros estructurales previos a similitud. Es interna al agente y devuelve procedencia y estado de confirmación.

### `prepare_private_document_upload`

Entrega un permiso efímero, tipo/tamaño permitidos y object key asignado por backend. No acepta URLs arbitrarias y previene SSRF.

### `generate_vaccination_card`

Inicia un workflow idempotente para generar un PDF no oficial con procedencia y versión. Devuelve estado del trabajo; no bloquea el chat.

## Matriz de efectos

| Tool | Efecto | Confirmación | Motor/modelo puede decidir |
|---|---|---|---|
| `evaluate_red_flags` | read | no | motor determinista, siempre antes del modelo |
| `evaluate_vaccination_schedule` | read | no | Eve puede solicitarla |
| `get_growth_summary` | read | no | Eve puede solicitarla |
| `suggest_pediatric_nutrition` | read | no | Eve dentro de policy |
| `validate_declared_pediatric_dose` | read auditado | no | Eve solo con inputs completos |
| `register_anthropometry` | write | sí | tutor confirma |
| `record_vaccine_administration` | write | sí | tutor confirma |
| `create_medication_plan` | write | sí | tutor confirma |
| `record_medication_intake` | write | no, gesto explícito | tutor inicia |
| `record_development_observation` | write | sí | tutor confirma |
| `capture_clinical_memory_candidate` | propose/write | depende del dato | policy + tutor |
| `generate_vaccination_card` | workflow | sí | tutor inicia |

## Widgets asociados

Las tools devuelven datos; un presenter separado produce widgets versionados. La tool no decide colores, navegación o acciones móviles. El registro inicial coincide con el contrato de Creciendo y rechaza kinds desconocidos.

## Tools excluidas

- diagnóstico diferencial;
- recomendación o prescripción de medicamentos;
- contacto con el Dr. Trujillo;
- agendamiento;
- llamada o mensaje de emergencias;
- modificación masiva de historia sin confirmación;
- consulta vectorial global;
- ejecución de SQL o URLs arbitrarias desde argumentos del modelo.
