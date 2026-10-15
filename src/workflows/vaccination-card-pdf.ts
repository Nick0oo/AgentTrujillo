import { FatalError, RetryableError } from "workflow";

export type VaccinationCardPdfInput = Readonly<{
  ownerUserId: string; careSpaceId: string; childId: string; sessionId: string;
  documentId: string; factsDigest: string; country: "CO" | "US"; templateVersion: string;
}>;
export type VaccinationSnapshot = Readonly<{ documentId: string; factsDigest: string; country: "CO" | "US"; rows: number }>;
export type PdfRender = Readonly<{ renderId: string; bytesSha256: string; sizeBytes: number }>;
export type VaccinationCardPdfPorts = Readonly<{
  loadSnapshot(input: VaccinationCardPdfInput): Promise<VaccinationSnapshot | null>;
  renderPdf(snapshot: VaccinationSnapshot, templateVersion: string): Promise<PdfRender>;
  uploadPrivateObject(input: VaccinationCardPdfInput, render: PdfRender): Promise<"uploaded" | "idempotent_replay">;
  finalizeDocument(input: VaccinationCardPdfInput, render: PdfRender): Promise<"finalized" | "idempotent_replay">;
  cleanupPartial(input: VaccinationCardPdfInput, render: PdfRender): Promise<void>;
}>;

let ports: VaccinationCardPdfPorts | null = null;
export function configureVaccinationCardPdfPorts(value: VaccinationCardPdfPorts | null): void { ports = value; }
function runtime(): VaccinationCardPdfPorts { if (!ports) throw new FatalError("VACCINATION_PDF_RUNTIME_UNCONFIGURED"); return ports; }
function valid(input: VaccinationCardPdfInput): boolean { return Object.values(input).every((v) => typeof v === "string" && v.length > 0 && v.length <= 512) && /^[a-f0-9]{64}$/u.test(input.factsDigest) && (input.country === "CO" || input.country === "US"); }

export async function loadSnapshot(input: VaccinationCardPdfInput): Promise<VaccinationSnapshot> {
  "use step";
  if (!valid(input)) throw new FatalError("VACCINATION_PDF_INVALID_INPUT");
  let snapshot: VaccinationSnapshot | null;
  try { snapshot = await runtime().loadSnapshot(input); } catch { throw new RetryableError("VACCINATION_PDF_SOURCE_UNAVAILABLE", { retryAfter: "10s" }); }
  if (!snapshot || snapshot.documentId !== input.documentId || snapshot.factsDigest !== input.factsDigest || snapshot.country !== input.country || !Number.isInteger(snapshot.rows) || snapshot.rows < 0 || snapshot.rows > 500) throw new FatalError("VACCINATION_PDF_SNAPSHOT_INVALID");
  return snapshot;
}

export async function renderPdf(snapshot: VaccinationSnapshot, templateVersion: string): Promise<PdfRender> {
  "use step";
  if (!snapshot || snapshot.rows < 0 || typeof templateVersion !== "string" || templateVersion.length === 0) throw new FatalError("VACCINATION_PDF_TEMPLATE_INVALID");
  try {
    const render = await runtime().renderPdf(snapshot, templateVersion);
    if (!render || !/^[-A-Za-z0-9._:]{1,256}$/u.test(render.renderId) || !/^[a-f0-9]{64}$/u.test(render.bytesSha256) || !Number.isInteger(render.sizeBytes) || render.sizeBytes <= 0 || render.sizeBytes > 52_428_800) throw new FatalError("VACCINATION_PDF_RENDER_INVALID");
    return render;
  } catch (error) { if (error instanceof FatalError) throw error; throw new RetryableError("VACCINATION_PDF_RENDER_UNAVAILABLE", { retryAfter: "30s" }); }
}

export async function uploadPrivateObject(input: VaccinationCardPdfInput, render: PdfRender): Promise<"uploaded" | "idempotent_replay"> {
  "use step";
  if (!valid(input) || !render) throw new FatalError("VACCINATION_PDF_UPLOAD_INVALID");
  try { return await runtime().uploadPrivateObject(input, render); } catch { throw new RetryableError("VACCINATION_PDF_STORAGE_UNAVAILABLE", { retryAfter: "10s" }); }
}

export async function finalizeDocument(input: VaccinationCardPdfInput, render: PdfRender): Promise<"finalized" | "idempotent_replay"> {
  "use step";
  if (!valid(input) || !render) throw new FatalError("VACCINATION_PDF_FINALIZE_INVALID");
  try { return await runtime().finalizeDocument(input, render); } catch { throw new RetryableError("VACCINATION_PDF_FINALIZE_UNAVAILABLE", { retryAfter: "10s" }); }
}

export async function cleanupPartial(input: VaccinationCardPdfInput, render: PdfRender): Promise<void> {
  "use step";
  if (!valid(input) || !render) throw new FatalError("VACCINATION_PDF_CLEANUP_INVALID");
  await runtime().cleanupPartial(input, render);
}

export async function vaccinationCardPdfWorkflow(input: VaccinationCardPdfInput): Promise<Readonly<{ status: "finalized" | "idempotent_replay" }>> {
  "use workflow";
  const snapshot = await loadSnapshot(input);
  const render = await renderPdf(snapshot, input.templateVersion);
  try {
    await uploadPrivateObject(input, render);
    return Object.freeze({ status: await finalizeDocument(input, render) });
  } catch (error) {
    await cleanupPartial(input, render);
    throw error;
  }
}
