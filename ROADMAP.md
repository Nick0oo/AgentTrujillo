# Roadmap de Agent Trujillo

Este archivo es la entrada canónica al plan de ejecución del backend clínico y del agente.

El roadmap detallado, con fases, criterios de salida, dependencias y estado verificable, vive en [docs/roadmap.md](docs/roadmap.md).

## Orden de ejecución

1. Fundación de datos y seguridad en Supabase.
2. Núcleo clínico determinista y fuentes versionadas.
3. Agente Eve, canales y catálogo de tools.
4. Integración desacoplada con Creciendo.
5. Validación clínica, observabilidad y lanzamiento controlado.

Toda implementación debe respetar el contrato de seguridad descrito en [docs/clinical/safety-contract.md](docs/clinical/safety-contract.md): el agente orienta, no diagnostica; recomienda pediatra cuando corresponde y, ante urgencias, indica acudir directamente a urgencias.
