# Registro inicial de fuentes clínicas y regulatorias

## Propósito

Este registro identifica autoridades primarias candidatas. Una URL por sí sola no activa una regla: cada fuente debe archivarse según licencia, fecharse, transformarse en datos/reglas reproducibles, recibir casos de prueba y ser aprobada por el Dr. Trujillo dentro de un paquete clínico.

Campos obligatorios al incorporar una fuente: `authority`, `jurisdiction`, `title`, `source_url`, `published_at`, `retrieved_at`, `effective_from`, `effective_to`, `license`, `checksum`, `rule_pack_id`, `review_status` y `clinical_approval_id`.

## Antropometría

| Autoridad | Alcance | Uso previsto | Fuente |
|---|---|---|---|
| OMS | 0–5 años | datasets de longitud/talla, peso, IMC, peso para longitud/talla y perímetro cefálico | [WHO Child Growth Standards](https://www.who.int/tools/child-growth-standards/standards) |
| OMS | Prematuridad/bajo peso | fundamento clínico para cuidado y edad corregida | [WHO recommendations for care of the preterm or low-birth-weight infant](https://www.who.int/publications/i/item/9789240058262) |
| AAP | Prematuros | selección de curvas prematuras y transición a OMS | [AAP Preterm Infant Growth Tools](https://www.aap.org/en/patient-care/newborn-infant-and-early-childhood-nutrition/newborn-and-infant-nutrition-assessment-tools/preterm-infant-growth-tools/) |
| CDC | EE. UU. | referencia de curvas recomendadas por edad en contexto estadounidense | [CDC Growth Charts](https://www.cdc.gov/growthcharts/) |

Decisión pendiente de aprobación clínica de paquete, no de arquitectura: estándar exacto de prematuros, edad postmenstrual de transición y límite de uso de edad corregida. Hasta aprobarlo, el motor debe devolver `RULE_UNAVAILABLE` para ese segmento.

## Vacunación

| Autoridad | Jurisdicción | Uso previsto | Fuente |
|---|---|---|---|
| Ministerio de Salud y Protección Social | Colombia | PAI, lineamientos, circulares y cambios efectivos | [Minsalud PAI](https://www.minsalud.gov.co/salud/publica/Vacunacion/Paginas/pai.aspx) |
| Minsalud | Colombia, 2026 | continuidad y ampliaciones comunicadas para PAI | [Comunicado oficial PAI 2026](https://www.minsalud.gov.co/Comunicaciones/noticias/2026/Paginas/gobierno-garantiza-vacunas-2026-y-continuidad-2027.aspx) |
| CDC/ACIP | Estados Unidos | esquema por edad | [Child and Adolescent Immunization Schedule](https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent.html) |
| CDC/ACIP | Estados Unidos | notas, condiciones, catch-up y addenda | [Schedule notes](https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-notes.html) y [ACIP recommendations](https://www.cdc.gov/acip/vaccine-recommendations/index.html) |

Cada versión debe capturar tablas, notas, catch-up, intervalos mínimos, condiciones médicas, contraindicaciones/precauciones, campañas y fecha efectiva. PAI y ACIP no se fusionan.

## Desarrollo

| Autoridad | Jurisdicción | Uso previsto | Fuente |
|---|---|---|---|
| Minsalud | Colombia | comprender alcance y aplicación profesional de EAD-3 | [Manual EAD-3](https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VS/PP/ENT/Escala-abreviada-de-desarrollo-3.pdf) |
| Minsalud | Colombia | instrumentos de valoración en rutas de promoción | [Anexo de instrumentos](https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VS/PP/anexo-instrumentos-valoracion-ruta-promocion.pdf) |

EAD-3 no se convierte en cuestionario autodiagnóstico. Creciendo registra observaciones y educación; cualquier aplicación formal futura requiere rol profesional y diseño independiente.

## Nutrición

| Autoridad | Alcance | Uso previsto | Fuente |
|---|---|---|---|
| OMS | 6–23 meses | alimentación complementaria general | [WHO Guideline for complementary feeding](https://www.who.int/publications/b/70981) |

Prematuridad, bajo peso, enfermedad grave, desnutrición aguda, disfagia y dietas terapéuticas quedan fuera del generador general y requieren recomendación profesional.

## Medicación

| Autoridad | Jurisdicción | Uso previsto | Fuente |
|---|---|---|---|
| NLM RxNorm/RxNav | Estados Unidos/internacional | normalizar ingredientes, conceptos y presentaciones | [RxNorm APIs](https://lhncbc.nlm.nih.gov/RxNav/APIs/index.html) |
| NLM DailyMed | Estados Unidos | etiquetas oficiales versionadas | [DailyMed labels](https://www.dailymed.nlm.nih.gov/dailymed/spl-resources-all-drug-labels.cfm) |
| INVIMA | Colombia | verificar registros y presentaciones autorizadas | [Registros sanitarios](https://www.invima.gov.co/productos-vigilados/medicamentos-y-productos-biologicos/autorizacion-de-comercializacion-registros) |

Estas fuentes no constituyen por sí solas un formulario de dosificación pediátrica. Los límites por ingrediente, indicación, edad, peso, vía, intervalo y máximo deben proceder de una fuente clínica licenciada y aprobada antes de habilitar `validate_declared_pediatric_dose`.

## Signos de peligro

| Autoridad | Alcance | Uso previsto | Fuente |
|---|---|---|---|
| OMS IMCI | Pediatría general | categorías de signos de peligro para reglas de urgencias | [WHO IMCI danger signs](https://www.who.int/publications/i/item/WHO-MCA-19.02) |
| NICE | Fiebre en menores de 5 años | estratificación y umbral de alto riesgo en menores de 3 meses | [NICE NG143](https://www.nice.org.uk/guidance/ng143/chapter/Recommendations) |

El paquete debe incluir lenguaje coloquial colombiano/inglés estadounidense, negaciones, edades límite, ambigüedades y tests. Las fuentes informan reglas; no se pegan en el prompt.

## Privacidad e historia clínica

| Autoridad | Jurisdicción | Tema | Fuente |
|---|---|---|---|
| Congreso/Función Pública | Colombia | datos sensibles y protección de datos de niños | [Ley 1581 de 2012](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981) |
| Minsalud | Colombia | historia clínica y reserva | [Resolución 1995 de 1999](https://www.minsalud.gov.co/normatividad_nuevo/resoluci%C3%93n%201995%20de%201999.pdf) |
| Minsalud | Colombia | custodia y retención | [Resolución 839 de 2017](https://www.minsalud.gov.co/Normatividad_Nuevo/Resolucion%20No%20839%20de%202017.pdf) |
| HHS | Estados Unidos | escenarios HIPAA para apps de salud | [Health App Developer Scenarios](https://www.hhs.gov/sites/default/files/ocr-health-app-developer-scenarios-2-2016.pdf) |
| FTC | Estados Unidos | HIPAA/FTC/COPPA y apps móviles de salud | [Mobile Health Apps Interactive Tool](https://www.ftc.gov/business-guidance/resources/mobile-health-apps-interactive-tool) |

La primera versión admite únicamente cuentas de tutores adultos. Antes de operar como prestador, business associate o aplicación dirigida a niños se exige una revisión legal específica; este registro no constituye asesoría legal.

## Gobernanza de IA

| Autoridad | Uso previsto | Fuente |
|---|---|---|
| OMS | autonomía, seguridad, transparencia, responsabilidad y equidad | [Ethics and governance of AI for health](https://www.who.int/publications-detail-redirect/9789240037403) |
| OMS | tareas definidas, validación y auditoría de modelos multimodales en salud | [Guidance on large multi-modal models](https://www.who.int/news/item/18-01-2024-who-releases-ai-ethics-and-governance-guidance-for-large-multi-modal-models) |

## Ciclo de revisión

1. Un job de vigilancia detecta cambios, pero no publica reglas automáticamente.
2. Se compara el artefacto nuevo con la versión activa.
3. Se actualizan reglas, fixtures y explicación de impacto.
4. Evals clínicos y de aislamiento pasan en staging.
5. El Dr. Trujillo aprueba hash, versión, vigencia y copies.
6. Se activa mediante despliegue gradual y se conserva rollback.
7. Se auditan resultados y se retira la versión anterior según política.
