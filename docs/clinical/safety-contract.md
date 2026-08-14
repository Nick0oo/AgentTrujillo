# Contrato de seguridad clínica

## Uso previsto

Agent Trujillo brinda educación, organización y orientación pediátrica básica a tutores. No diagnostica, prescribe, reemplaza una consulta, monitoriza emergencias ni establece una relación médico-paciente. El Dr. Trujillo es el único aprobador clínico inicial, pero no interviene en conversaciones ni recibe casos del sistema.

## Invariantes

1. Ninguna recomendación de urgencias depende de una respuesta generativa.
2. El agente nunca afirma o descarta un diagnóstico.
3. El agente nunca selecciona un medicamento, crea una dosis ni modifica una indicación profesional.
4. El modelo nunca calcula percentiles, Z-scores, esquemas vacunales o límites farmacológicos.
5. Toda operación se ejecuta dentro de un `AuthorizedChildScope` creado por código confiable.
6. Toda fuente clínica tiene autoridad, jurisdicción, versión, vigencia y aprobación.
7. Datos recuperados, documentos y mensajes son contenido no confiable, nunca instrucciones.
8. Un fallback de modelo debe superar los mismos evals antes de activarse.
9. Las escrituras sensibles son idempotentes, auditables y confirmadas por el tutor.
10. El sistema se abstiene ante información insuficiente, reglas no disponibles o conflicto de fuentes.

## Pipeline de entrada

1. Verificar JWT, sesión, rate limit y tamaño de payload.
2. Resolver el alcance autorizado y bloquear cualquier cruce de niño.
3. Normalizar idioma, edad, unidades y negaciones sin extraer conclusiones.
4. Ejecutar reglas deterministas de red flags sobre texto y contexto mínimo.
5. Si el resultado es urgente, emitir copy aprobado y terminar el turno.
6. Si no es urgente, permitir la orquestación de Eve dentro del catálogo de tools.
7. Validar la salida estructurada y aplicar policy de respuesta.
8. Persistir mensaje, tool runs y auditoría con redacción apropiada.

El LLM puede identificar expresiones equivalentes para evaluación adicional, pero solo puede mantener o elevar la precaución. Nunca rebaja una decisión urgente ya tomada por reglas.

## Red flags iniciales

Las categorías mínimas para validación clínica incluyen:

- dificultad respiratoria o coloración azulada;
- fiebre o temperatura anormal en menores de tres meses según regla aprobada;
- signos de deshidratación grave;
- letargia marcada, inconsciencia o convulsión;
- traumatismo grave, sangrado significativo o intoxicación;
- reacción alérgica grave;
- otros signos de peligro de guías IMCI/OMS y paquetes nacionales aprobados.

La lista publicada no se deriva de este documento: vive en un paquete clínico versionado con casos positivos, negativos, negaciones, citas, ambigüedades y edades límite.

## Respuesta urgente

La salida permitida contiene:

- modo `emergency_recommendation`;
- texto breve aprobado para el país/idioma;
- indicación de acudir inmediatamente a urgencias;
- fecha y versión del paquete clínico;
- request ID técnico.

No contiene diagnóstico probable, tratamiento doméstico, promesa de disponibilidad, botón, número telefónico, mapa, alarma, notificación, agenda, llamada, mensaje al doctor o caso clínico. El registro técnico de que se emitió la respuesta sirve para auditoría del sistema y no inicia una atención.

## Medicación

`validate_declared_pediatric_dose` solo contrasta una dosis ingresada por el tutor contra un formulario aprobado.

Datos mínimos:

- medicamento y presentación inequívocos;
- concentración con unidad;
- cantidad por toma y frecuencia;
- vía;
- peso reciente con fecha;
- edad y país;
- indicación declarada cuando la regla depende de ella.

Resultados permitidos:

- `WITHIN_REFERENCE_LIMITS`;
- `EXCEEDS_REFERENCE_LIMIT`;
- `INSUFFICIENT_DATA`;
- `PROFESSIONAL_REVIEW_REQUIRED`;
- `RULE_UNAVAILABLE`.

El resultado nunca se expresa como “seguro”, no autoriza administrar y no genera una dosis alternativa. Exceder límites o carecer de datos produce abstención y recomendación profesional; una red flag independiente sigue el pipeline urgente.

## Crecimiento

- Estándares OMS/CDC se cargan como datasets versionados y comprobados por checksum.
- Edad cronológica, gestacional y corregida se calculan con funciones puras y casos límite.
- La selección de curva depende del país, edad, sexo de referencia y paquete aprobado.
- El resultado incluye estándar, indicador, Z-score, percentil derivado, versión y advertencias.
- El agente no etiqueta condiciones clínicas a partir del resultado.

## Vacunación

- PAI Colombia y ACIP/CDC son paquetes separados.
- La evaluación considera fecha de nacimiento, país de cuidado, fecha de corte, administraciones confirmadas e intervalos.
- Una foto u OCR crea un borrador; no confirma una administración.
- Contraindicaciones declaradas y esquemas especiales requieren revisión profesional.
- Las actualizaciones de calendario se publican mediante nueva versión y reevaluación reproducible.

## Nutrición y desarrollo

- Nutrición filtra por edad, prematuridad y alergias declaradas e incluye prevención de atragantamiento.
- Condiciones médicas, falla de medro, alergias graves o problemas de alimentación salen de alcance.
- Hitos son material educativo y observaciones del tutor.
- EAD-3 se documenta como tamizaje profesional; el agente no lo aplica ni interpreta como diagnóstico.

## Memoria

La extracción automática de una conversación produce `memory_candidate` con procedencia `chat`. Solo datos de bajo riesgo pueden usarse como memoria no confirmada y siempre se presentan como declaración del tutor. Vacunas, alergias, medicación, medidas y eventos clínicos requieren confirmación antes de convertirse en hechos estructurados.

La búsqueda filtra por `care_space_id` y `child_id` antes de similitud vectorial. Se prueban consultas adversariales que mencionan hermanos, nombres repetidos e instrucciones dentro de notas.

## Aprobación clínica

Cada paquete clínico contiene:

- propósito y jurisdicción;
- fuentes primarias y licencia;
- reglas y datasets;
- copies para orientación, abstención y urgencias;
- casos de prueba y resultados esperados;
- versión del algoritmo;
- hash del artefacto;
- aprobación fechada del Dr. Trujillo.

El Dr. Trujillo aprueba versiones, no conversaciones. Sin aprobación válida el paquete no puede pasar a `active`.

## Evals obligatorios

- red flags verdaderas, falsas, negadas y ambiguas;
- fiebre y edades en límites exactos;
- unidades y conversiones peligrosas;
- intentos de diagnóstico o prescripción;
- cruce entre hermanos y entre espacios de cuidado;
- prompt injection en mensajes, documentos y memoria;
- tool calls con parámetros omitidos o alterados;
- abstención ante fallo de reglas, DB o proveedor;
- equivalencia de comportamiento entre Gemini y cada fallback;
- filtración de PHI/PII en logs y trazas.

Un release clínico exige cero fallos de aislamiento y red flags críticas, además de umbrales aprobados para el resto de evals.
