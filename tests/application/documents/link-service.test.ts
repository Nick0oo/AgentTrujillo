import { describe, expect, it, vi } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../../agent/lib/access/authorized-child-scope.ts";
import { createDocumentLinkService, type DocumentLinkRepository } from "../../../src/application/documents/link-service.ts";

const ACTOR="00000000-0000-4000-8000-000000000001", SPACE="00000000-0000-4000-8000-000000000002", CHILD="00000000-0000-4000-8000-000000000003";
const DOCUMENT="00000000-0000-4000-8000-000000000004", RESOURCE="00000000-0000-4000-8000-000000000005", DIGEST="a".repeat(64);
const NOW=new Date("2026-08-23T12:00:00Z");
const scope=createAuthorizedChildScopeFromTrustedRow({actorUserId:ACTOR,careSpaceId:SPACE,childId:CHILD,permissions:["read","manage_documents"],countryOfCare:"CO",timezone:"America/Bogota",authorizationVersion:"m:1:a:1",issuedAt:new Date("2026-08-23T11:56:00Z"),expiresAt:new Date("2026-08-23T12:01:00Z")});
const input={documentId:DOCUMENT,resourceType:"vaccine_administration" as const,resourceId:RESOURCE,purpose:"vaccine_record" as const,confirmationSha256:DIGEST,idempotencyKey:"link-1"};

function repository(overrides:Partial<DocumentLinkRepository>={}):DocumentLinkRepository{return{
  loadDocument:vi.fn().mockResolvedValue({documentId:DOCUMENT,careSpaceId:SPACE,childId:CHILD,purpose:"vaccine_record",lifecycle:"active",scanState:"clean",sha256:DIGEST}),
  resolveResource:vi.fn().mockResolvedValue({resourceId:RESOURCE,careSpaceId:SPACE,childId:CHILD,resourceType:"vaccine_administration",visible:true}),
  linkAtomic:vi.fn().mockResolvedValue({outcome:"created",linkedAt:"2026-08-23T12:00:00.000Z"}),
  unlinkAtomic:vi.fn().mockResolvedValue({outcome:"unlinked"}),
  list:vi.fn().mockResolvedValue([]),...overrides};}

describe("DocumentLinkService",()=>{
  it("links an active clean document to one same-child compatible resource",async()=>{
    const repo=repository(); const result=await createDocumentLinkService({authorize:vi.fn().mockResolvedValue(true),repository:repo},{now:()=>NOW}).link(scope,input);
    expect(result).toMatchObject({ok:true,status:"linked",outcome:"created",link:{documentId:DOCUMENT,resourceId:RESOURCE,lifecycle:"active"}});
    expect(repo.linkAtomic).toHaveBeenCalledWith(scope,expect.objectContaining({confirmationSha256:DIGEST,idempotencyKey:"link-1"}));
  });
  it.each([
    ["cross child document",{loadDocument:vi.fn().mockResolvedValue({documentId:DOCUMENT,careSpaceId:SPACE,childId:"00000000-0000-4000-8000-000000000099",purpose:"vaccine_record",lifecycle:"active",scanState:"clean",sha256:DIGEST})}],
    ["cross child resource",{resolveResource:vi.fn().mockResolvedValue({resourceId:RESOURCE,careSpaceId:SPACE,childId:"00000000-0000-4000-8000-000000000099",resourceType:"vaccine_administration",visible:true})}],
    ["unscanned",{loadDocument:vi.fn().mockResolvedValue({documentId:DOCUMENT,careSpaceId:SPACE,childId:CHILD,purpose:"vaccine_record",lifecycle:"processing",scanState:"pending",sha256:DIGEST})}],
    ["deleted",{loadDocument:vi.fn().mockResolvedValue({documentId:DOCUMENT,careSpaceId:SPACE,childId:CHILD,purpose:"vaccine_record",lifecycle:"deleted",scanState:"clean",sha256:DIGEST})}],
  ])("rejects %s",async(_label,override)=>{expect(await createDocumentLinkService({authorize:vi.fn().mockResolvedValue(true),repository:repository(override)},{now:()=>NOW}).link(scope,input)).toEqual(expect.objectContaining({ok:false}));});
  it("rejects incompatible purpose, unknown resource and caller authority",async()=>{
    expect(await createDocumentLinkService({authorize:vi.fn().mockResolvedValue(true),repository:repository()},{now:()=>NOW}).link(scope,{...input,purpose:"clinical_attachment"})).toEqual(expect.objectContaining({ok:false}));
    for(const injected of [{childId:CHILD},{objectPath:"private"},{publicUrl:"https://example.invalid"}])expect(await createDocumentLinkService({authorize:vi.fn().mockResolvedValue(true),repository:repository()},{now:()=>NOW}).link(scope,{...input,...injected})).toEqual(expect.objectContaining({ok:false,code:"INVALID_INPUT"}));
  });
  it("rechecks current access and exposes idempotent unlink/list without object metadata",async()=>{
    const denied=repository(); expect(await createDocumentLinkService({authorize:vi.fn().mockResolvedValue(false),repository:denied},{now:()=>NOW}).link(scope,input)).toEqual({ok:false,status:"unavailable",code:"NOT_AUTHORIZED"});
    const repo=repository({list:vi.fn().mockResolvedValue([{documentId:DOCUMENT,resourceType:"vaccine_administration",resourceId:RESOURCE,purpose:"vaccine_record",confirmationSha256:DIGEST,linkedAt:"2026-08-23T12:00:00.000Z",lifecycle:"active"}])});
    const service=createDocumentLinkService({authorize:vi.fn().mockResolvedValue(true),repository:repo},{now:()=>NOW});
    expect(await service.unlink(scope,{documentId:DOCUMENT,resourceType:"vaccine_administration",resourceId:RESOURCE,idempotencyKey:"unlink-1"})).toEqual({ok:true,status:"unlinked"});
    expect(await service.list(scope)).toMatchObject({ok:true,links:[{documentId:DOCUMENT,resourceId:RESOURCE}]});
    expect(JSON.stringify(await service.list(scope))).not.toContain("objectPath");
  });
  it("fails closed on replay conflict and storage errors",async()=>{
    expect(await createDocumentLinkService({authorize:vi.fn().mockResolvedValue(true),repository:repository({linkAtomic:vi.fn().mockResolvedValue({outcome:"conflict"})})},{now:()=>NOW}).link(scope,input)).toEqual({ok:false,status:"unavailable",code:"IDEMPOTENCY_CONFLICT"});
    expect(await createDocumentLinkService({authorize:vi.fn().mockResolvedValue(true),repository:repository({linkAtomic:vi.fn().mockRejectedValue(new Error("db"))})},{now:()=>NOW}).link(scope,input)).toEqual({ok:false,status:"unavailable",code:"STORAGE_UNAVAILABLE"});
  });
});
