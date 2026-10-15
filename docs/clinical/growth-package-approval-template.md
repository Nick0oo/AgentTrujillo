# Plantilla de aprobación clínica — paquete de crecimiento y antropometría

**Uso:** completar por el Dr. Trujillo y entregar al agente root junto con el
manifiesto de revisión y los artefactos exactos.  
**Estado de esta plantilla:** `TEMPLATE_ONLY`  
**Paquete aprobado por este documento:** ninguno hasta que el formulario esté
completo, firmado, verificado y registrado contra sus hashes.  
**No contiene:** datos de pacientes, credenciales, secretos ni una firma
generada por el sistema.

> Importante: esta plantilla no convierte una investigación en aprobación
> clínica, no asigna la identidad del doctor automáticamente y no activa un
> paquete. La aprobación debe referirse a los bytes exactos que el doctor
> revisó. La activación/release es una decisión operativa separada.

## 1. Instrucciones para el revisor clínico

1. Revise el manifiesto, los datasets, el algoritmo, los fixtures y el copy
   que se enumeran aquí; no apruebe solamente un resumen o una captura.
2. Compruebe que cada hash corresponde al archivo exacto revisado. Si un hash
   está vacío, no es válido o cambia después de la revisión, seleccione
   `changes_requested` o `rejected`.
3. Marque cada alcance de forma independiente. Una aprobación de Colombia no
   aprueba Estados Unidos y una aprobación de un indicador no aprueba otros.
4. Especifique cualquier restricción, exclusión, población no cubierta o
   texto que deba permanecer en revisión profesional.
5. Firme y feche la decisión. La firma puede ser manuscrita o un mecanismo de
   firma verificable aceptado por el proceso institucional; el sistema no la
   inventa ni la atribuye al doctor.

## 2. Identificación del paquete revisado

| Campo | Valor que debe completar el operador |
| --- | --- |
| Dominio | `anthropometry_growth` |
| Package ID | `[COMPLETAR: identificador inmutable]` |
| Versión del paquete | `[COMPLETAR]` |
| País/jurisdicción | `CO` / `US` — no ambos en una misma decisión |
| Locale/copy | `[COMPLETAR: es-CO, en-US, etc.]` |
| Fecha de vigencia desde | `[COMPLETAR: ISO-8601]` |
| Fecha de vigencia hasta | `[COMPLETAR o indicar sin vencimiento autorizado]` |
| Schema version | `[COMPLETAR]` |
| Commit de revisión | `[COMPLETAR: SHA del commit]` |
| Manifiesto presentado al doctor | `[COMPLETAR: ruta/identificador, no URL mutable]` |
| Manifest SHA-256 | `[COMPLETAR: 64 hex]` |
| Artifact/source bytes SHA-256 | `[COMPLETAR: 64 hex]` |
| Dataset normalizado SHA-256 | `[COMPLETAR: 64 hex]` |
| Algorithm ID | `[COMPLETAR]` |
| Algorithm SHA-256 | `[COMPLETAR: 64 hex]` |
| Source-set SHA-256 | `[COMPLETAR: 64 hex]` |
| Clinical-copy SHA-256 | `[COMPLETAR: 64 hex]` |
| Golden-fixtures SHA-256 | `[COMPLETAR: 64 hex]` |

## 3. Fuentes primarias y derechos

Agregue una fila por cada archivo o publicación que realmente entre al
paquete. No basta con enlazar una página general si el cálculo usa un archivo
descargable distinto.

| ID | Fuente primaria / versión | URL oficial | Fecha de recuperación | Archivo exacto y tamaño | SHA-256 | Licencia/derechos verificados | Alcance aprobado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SRC-01 | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` |
| SRC-02 | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` |
| SRC-03 | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` |

Fuentes de referencia para la revisión, que deben reemplazarse por los
archivos y versiones exactos del paquete:

- [WHO Child Growth Standards](https://www.who.int/tools/child-growth-standards)
- [WHO methods and development](https://www.who.int/publications/i/item/924154693X)
- [WHO Anthro software](https://www.who.int/toolkits/child-growth-standards/software)
- [CDC recommended growth charts](https://www.cdc.gov/growth-chart-training/hcp/overview/recommended.html)
- [CDC WHO-to-CDC transition](https://www.cdc.gov/growth-chart-training/hcp/using-growth-charts/who-using.html)
- [CDC LMS data files](https://www.cdc.gov/growthcharts/cdc-data-files.htm)
- [Minsalud Resolution 2465 of 2016](https://www.minsalud.gov.co/Normatividad_Nuevo/Resoluci%C3%B3n%20No.%202465%20de%202016.pdf?ID=4908)

## 4. Alcance clínico aprobado

### 4.1 Jurisdicción y transición

- País aprobado: `[CO / US]`
- Estándar utilizado de nacimiento a `[COMPLETAR]`: `[COMPLETAR]`
- Estándar utilizado desde `[COMPLETAR]`: `[COMPLETAR]`
- Regla de transición y método de medición: `[COMPLETAR]`
- ¿Se prohíbe explícitamente el fallback al estándar más cercano?: `SÍ / NO`
- Exclusiones por edad, indicador, sexo de referencia o método: `[COMPLETAR]`

### 4.2 Indicadores y métodos

| Indicador | Método permitido | Rango de edad | Unidad de entrada | Resultado permitido | ¿Aprobado? |
| --- | --- | --- | --- | --- | --- |
| Peso para edad | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | Z-score/percentil descriptivo | `SÍ / NO` |
| Longitud/talla para edad | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | Z-score/percentil descriptivo | `SÍ / NO` |
| Peso para longitud/talla | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | Z-score/percentil descriptivo | `SÍ / NO` |
| Perímetro cefálico para edad | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | Z-score/percentil descriptivo | `SÍ / NO` |
| BMI para edad | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | Solo si el paquete lo representa | `SÍ / NO` |

Elimine filas no representadas por el artefacto exacto. No agregue indicadores
mediante esta plantilla.

### 4.3 Edad cronológica, prematuridad y edad corregida

| Decisión requerida | Especificación exacta |
| --- | --- |
| Datos gestacionales mínimos | `[COMPLETAR]` |
| Fórmula de edad corregida | `[COMPLETAR o indicar NO APROBADA]` |
| Unidad y precisión de edad | `[COMPLETAR]` |
| Inicio y fin de uso de edad corregida | `[COMPLETAR]` |
| Diferencias por indicador o jurisdicción | `[COMPLETAR]` |
| Edad que se muestra al tutor | `[COMPLETAR]` |
| Regla antes/después de edad equivalente a término | `[COMPLETAR]` |
| Exclusiones y revisión profesional | `[COMPLETAR]` |
| Fixtures de prematuridad revisados | `[COMPLETAR: IDs]` |

Si no existe una política clínica explícita y aprobada, la decisión correcta es
`RULE_UNAVAILABLE` para la evaluación dependiente de prematuridad; no se debe
completar esta sección con una fórmula improvisada.

## 5. Algoritmo determinista

| Elemento | Especificación revisada |
| --- | --- |
| Identificador y versión del algoritmo | `[COMPLETAR]` |
| Ecuación o método estadístico | `[COMPLETAR]` |
| Parámetros L/M/S y selección de fila | `[COMPLETAR]` |
| Interpolación permitida | `[COMPLETAR o NO PERMITIDA]` |
| Conversión de unidades | `[COMPLETAR]` |
| Dominio numérico y valores rechazados | `[COMPLETAR]` |
| Precisión interna | `[COMPLETAR]` |
| Redondeo únicamente de presentación | `[COMPLETAR]` |
| Cálculo del percentil desde Z | `[COMPLETAR]` |
| Comportamiento ante inestabilidad o dataset faltante | `[COMPLETAR]` |
| Implementación revisada y SHA-256 | `[COMPLETAR]` |

Confirmo que el algoritmo no diagnostica, no prescribe, no selecciona
tratamiento y no permite al modelo alterar el resultado: `SÍ / NO`.

## 6. Copy, advertencias y límites

Liste el identificador y hash de cada texto que pueda llegar al tutor.

| Copy ID | Texto o referencia exacta | Locale | SHA-256 | Revisión clínica |
| --- | --- | --- | --- | --- |
| COPY-01 | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `APROBADO / CAMBIAR` |
| COPY-02 | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `APROBADO / CAMBIAR` |
| COPY-03 | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `APROBADO / CAMBIAR` |

Confirme expresamente:

- [ ] El resultado se presenta como descriptivo y no como diagnóstico.
- [ ] No se declara que una medición sea “segura”, ni se prescribe tratamiento.
- [ ] No se inventan percentiles, Z-scores, edad corregida o interpretaciones.
- [ ] Se muestra estándar, indicador, fecha, unidad, versión y advertencias.
- [ ] Los datos insuficientes, no soportados o conflictivos producen
      `RULE_UNAVAILABLE`, `INSUFFICIENT_DATA`, `EXCLUDED` o revisión profesional.
- [ ] El copy de Colombia y Estados Unidos permanece separado.

## 7. Fixtures y evidencia de reproducibilidad

| Fixture ID | Caso cubierto | Entrada resumida sin datos personales | Resultado esperado | Resultado obtenido | Estado |
| --- | --- | --- | --- | --- | --- |
| FIX-01 | Edad/medición dentro de rango | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `PASS / FAIL` |
| FIX-02 | Límite inferior | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `PASS / FAIL` |
| FIX-03 | Límite superior | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `PASS / FAIL` |
| FIX-04 | Unidad/conversión | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `PASS / FAIL` |
| FIX-05 | Prematuridad/edad corregida | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `PASS / FAIL` |
| FIX-06 | Dato faltante o contradictorio | `[COMPLETAR]` | `[COMPLETAR]` | `[COMPLETAR]` | `PASS / FAIL` |
| FIX-07 | Fuente/dataset equivocado | `[COMPLETAR]` | Debe bloquear | `[COMPLETAR]` | `PASS / FAIL` |
| FIX-08 | Aislamiento entre niños/espacios | `[COMPLETAR]` | Debe bloquear | `[COMPLETAR]` | `PASS / FAIL` |

| Evidencia | Identificador / comando | SHA-256 o resultado | Revisado |
| --- | --- | --- | --- |
| Comparación independiente WHO/CDC | `[COMPLETAR]` | `[COMPLETAR]` | `SÍ / NO` |
| Evaluación backend | `[COMPLETAR]` | `[COMPLETAR]` | `SÍ / NO` |
| Evaluación de aislamiento | `[COMPLETAR]` | `[COMPLETAR]` | `SÍ / NO` |
| Evaluación de copy | `[COMPLETAR]` | `[COMPLETAR]` | `SÍ / NO` |

No incluya nombres, correos, UUID de niños, documentos, tokens ni datos de
salud en fixtures o capturas.

## 8. Decisión del revisor clínico

Seleccione exactamente una opción:

- [ ] `approved` — apruebo únicamente el paquete y el alcance hash-bound
      identificados en esta plantilla.
- [ ] `approved_with_restrictions` — apruebo solo con las restricciones del
      apartado 9; cualquier alcance no listado queda bloqueado.
- [ ] `changes_requested` — no debe liberarse hasta completar los cambios.
- [ ] `rejected` — no apruebo este paquete.

Declaración del revisor:

> Yo, **[NOMBRE LEGAL COMPLETO]**, en calidad de **[ROL/ESPECIALIDAD]**, declaro
> que revisé los artefactos exactos identificados por los hashes de las
> secciones 2–7. Mi decisión aplica exclusivamente a la jurisdicción, versión,
> indicadores, algoritmo, edad corregida, copy, fixtures y vigencia descritos
> aquí. No aprueba paquetes distintos, cambios posteriores, otra jurisdicción
> ni contenido agregado fuera de estos hashes.

| Campo de identidad y firma | Valor |
| --- | --- |
| Nombre legal | `[COMPLETAR POR EL DOCTOR]` |
| Rol/especialidad | `[COMPLETAR]` |
| Registro/licencia profesional, si aplica | `[COMPLETAR]` |
| Identidad clínica verificada por el operador | `[COMPLETAR: método/evidencia]` |
| Subject ID del aprobador verificado | `[COMPLETAR POR EL OPERADOR; no inventar]` |
| Fecha y hora de decisión | `[COMPLETAR: ISO-8601 y zona horaria]` |
| Firma | `[FIRMA DEL DOCTOR]` |
| SHA-256 de esta plantilla completa | `[COMPLETAR DESPUÉS DE FIRMAR]` |
| SHA-256 del registro de aprobación | `[COMPLETAR AL REGISTRAR]` |

## 9. Restricciones, cambios y expiración

| Tipo | Detalle obligatorio |
| --- | --- |
| Indicadores excluidos | `[COMPLETAR]` |
| Edades/poblaciones excluidas | `[COMPLETAR]` |
| Jurisdicción/locale excluido | `[COMPLETAR]` |
| Copy que requiere revisión profesional | `[COMPLETAR]` |
| Condiciones que producen `RULE_UNAVAILABLE` | `[COMPLETAR]` |
| Cambios exigidos antes de aprobar | `[COMPLETAR]` |
| Fecha de expiración o revisión | `[COMPLETAR]` |
| Evento que retira la aprobación | `[COMPLETAR]` |

## 10. Separación entre aprobación y release

La firma clínica no autoriza por sí sola la subida, activación, publicación ni
el cambio de estado en Supabase. El operador/root debe verificar nuevamente
todos los hashes, registrar la attestation append-only y generar el release
preview. Cualquier cambio de bytes requiere una nueva revisión.

| Control operativo | Resultado / evidencia |
| --- | --- |
| Artefacto almacenado en bucket privado content-addressed | `[COMPLETAR]` |
| Aprobación registrada contra manifest/artifact/source/algorithm | `[COMPLETAR]` |
| Release preview con digest coincidente | `[COMPLETAR]` |
| Rollback target verificado | `[COMPLETAR]` |
| Autorización operativa explícita para aplicar release | `[COMPLETAR]` |
| No se realizó mutación remota durante la revisión | `[SÍ / NO; explicar]` |

## 11. Evidencia requerida para intentar cerrar `CR-08-20`

Esta tabla no es una aprobación automática. El root agent debe adjuntar
evidencia fresca y marcar cada requisito solo después de verificarlo.

| Requisito del gate | Evidencia | Estado |
| --- | --- | --- |
| Contrato Agent Trujillo versionado | `[COMPLETAR: contrato/versión/hash]` | `PENDIENTE` |
| Paquete CO o US exacto y separado | `[COMPLETAR]` | `PENDIENTE` |
| Fuentes, derechos y hashes | `[COMPLETAR]` | `PENDIENTE` |
| Algoritmo y dataset reproducibles | `[COMPLETAR]` | `PENDIENTE` |
| Política de edad corregida aprobada o bloqueo explícito | `[COMPLETAR]` | `PENDIENTE` |
| Copy aprobado y hash-bound | `[COMPLETAR]` | `PENDIENTE` |
| Fixtures positivos, negativos, límites y aislamiento | `[COMPLETAR]` | `PENDIENTE` |
| Confirmación/idempotencia/cancelación | `[COMPLETAR]` | `PENDIENTE` |
| Exportación clínica validada | `[COMPLETAR]` | `PENDIENTE` |
| Android development-build | `[COMPLETAR: build/dispositivo/fecha]` | `PENDIENTE` |
| iOS development-build | `[COMPLETAR: build/dispositivo/fecha]` | `PENDIENTE` |
| Logs sin PHI/secretos y aislamiento verificado | `[COMPLETAR]` | `PENDIENTE` |
| Commit y evidencia del root agent | `[COMPLETAR]` | `PENDIENTE` |

Mientras quede un requisito `PENDIENTE`, `CR-08-20` no está cerrado. La ausencia
de dispositivo iOS no se debe ocultar ni convertir en una aprobación; debe
quedar como evidencia pendiente o requerir una decisión formal del contrato.

## 12. Registro del operador

Completar después de recibir el formulario firmado:

```yaml
approval_provenance: verified_clinical_approver | product_owner_conveyed
approval_record_sha256: [COMPLETAR]
approver_subject: [COMPLETAR; no usar un nombre como sustituto]
decision: approved | approved_with_restrictions | changes_requested | rejected
package_id: [COMPLETAR]
artifact_sha256: [COMPLETAR]
algorithm_id: [COMPLETAR]
algorithm_sha256: [COMPLETAR]
source_set_sha256: [COMPLETAR]
manifest_sha256: [COMPLETAR]
domain: anthropometry_growth
country: CO | US
locale: [COMPLETAR]
effective_from: [COMPLETAR]
effective_until: [COMPLETAR]
release_id: NONE_UNTIL_SEPARATE_RELEASE_GATE
```

## Referencias contractuales

- `AgentTrujillo/roadmap/03-clinical-governance/07-dr-trujillo-approval-gate.md`
- `AgentTrujillo/roadmap/03-clinical-governance/08-clinical-package-storage.md`
- `AgentTrujillo/roadmap/03-clinical-governance/09-clinical-package-release-workflow.md`
- `Creciendo-Movil/roadmap/08-anthropometry-and-growth/20-growth-gate.md`
- `AgentTrujillo/docs/clinical/approval-record-2026-08-21.md`

