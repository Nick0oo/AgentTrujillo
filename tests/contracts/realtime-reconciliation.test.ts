import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONTRACT = readFileSync(new URL("../../docs/contracts/realtime-reconciliation-v1.md", import.meta.url), "utf8");

describe("Realtime reconciliation v1 contract", () => {
  it("pins the version and scope-derived private topic", () => {
    expect(CONTRACT).toContain("creciendo.realtime-invalidation.v1");
    expect(CONTRACT).toContain("private-creciendo-v1:<careSpaceId>:<childId>");
    expect(CONTRACT).toContain("El ID del tópico nunca sustituye el JWT ni el contexto infantil.");
  });

  it("keeps the event to opaque invalidation metadata", () => {
    expect(CONTRACT).toContain('"resourceKind"');
    expect(CONTRACT).toContain('"resourceVersion"');
    expect(CONTRACT).toContain('"sequence"');
    expect(CONTRACT).toContain('"sourceEventId"');
    expect(CONTRACT).toMatch(/No son campos permitidos:.*contenido clínico/isu);
  });

  it("defines the closed resource registry and monotonic handling", () => {
    for (const resource of ["child", "dashboard", "growth", "immunization", "medication", "development", "document", "conversation", "nutrition", "settings"]) {
      expect(CONTRACT).toContain(`\`${resource}\``);
    }
    expect(CONTRACT).toContain("sequence <= lastSequence");
    expect(CONTRACT).toContain("resourceVersion <= lastResourceVersion");
    expect(CONTRACT).toContain("Nunca se aplica una versión menor sobre una mayor.");
  });

  it("requires authorized refetch and atomic scope matching", () => {
    expect(CONTRACT).toMatch(/refetcher autorizado/iu);
    expect(CONTRACT).toMatch(/reemplazar atómicamente la caché/iu);
    expect(CONTRACT).toContain("(careSpaceId, childId, scopeVersion)");
    expect(CONTRACT).toMatch(/401.*403.*limpia inmediatamente el scope/isu);
    expect(CONTRACT).toMatch(/404.*eliminación\/no disponible/isu);
  });

  it("covers reconnect, foreground, offline failure and outbox gaps", () => {
    expect(CONTRACT).toMatch(/conectar, reconectar o volver al foreground/iu);
    expect(CONTRACT).toMatch(/hueco.*cursor.*vencido.*outbox.*expiró/isu);
    expect(CONTRACT).toContain("proveedor conserva la caché marcada como stale");
    expect(CONTRACT).toMatch(/backoff limitado/iu);
  });

  it("makes child switching and revocation an isolation barrier", () => {
    expect(CONTRACT).toMatch(/cancelar suscripciones, abortar/iu);
    expect(CONTRACT).toMatch(/Ningún resultado tardío del niño anterior/iu);
    expect(CONTRACT).toMatch(/revocación, logout, cambio de tutor o expiración/iu);
    expect(CONTRACT).toMatch(/No se\s+reintenta con el contexto anterior/iu);
  });

  it("forbids urgent effects and PHI in telemetry or Realtime", () => {
    expect(CONTRACT).toMatch(/no transporta PHI ni decisiones urgentes/iu);
    expect(CONTRACT).toMatch(/nunca\s+crea una alarma, notificación, llamada/iu);
    expect(CONTRACT).toMatch(/Nunca contienen IDs de niño[\s\S]*nombres[\s\S]*payloads[\s\S]*tokens/iu);
    expect(CONTRACT).toMatch(/Un contrato desconocido desactiva Realtime/iu);
  });
});
