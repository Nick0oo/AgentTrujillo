# Acceso y cuidado

Lenguaje del aislamiento entre tutores y niños.

## Language

**Tutor**:
Adulto autenticado con permiso explícito sobre uno o más niños.
_Avoid_: User, parent, patient

**Espacio de cuidado**:
Contenedor aislado que reúne tutores, niños, permisos y acceso comercial.
_Avoid_: Tenant, organization, family account

**Niño**:
Persona menor de edad sobre la que se registran observaciones y seguimiento.
_Avoid_: Patient, dependent, child profile

**Membresía de cuidado**:
Relación que permite a un tutor participar en un espacio de cuidado con un rol definido.
_Avoid_: Organization role, account permission

**Acceso al niño**:
Relación explícita entre un tutor y un niño que delimita acciones permitidas, incluso dentro del mismo espacio de cuidado; no representa custodia legal.
_Avoid_: Ownership, custody, parent ID

**Niño activo**:
Niño único al que queda ligada una consulta, conversación o comando después de revalidar el acceso al niño.
_Avoid_: Current patient, global child

**Alcance autorizado**:
Prueba inmutable y de corta duración de que un tutor puede ejecutar una operación concreta dentro de un espacio de cuidado y para un niño.
_Avoid_: Child ID, tenant ID, session variable

**Consentimiento**:
Decisión versionada y revocable que documenta propósito, alcance, tutor responsable y momento de aceptación.
_Avoid_: Checkbox, terms accepted
