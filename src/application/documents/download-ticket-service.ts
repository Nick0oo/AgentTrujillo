import { createHash,randomUUID as nodeRandomUUID } from "node:crypto";
import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import { hasPermission,isAuthorizedChildScopeActive,type AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import { downloadTicketSchema,type DocumentLifecycle,type DocumentPurpose,type DownloadTicket,type PrivateDocumentBucket,type ScanState } from "../../clinical/documents/types.ts";

const UUID=z.string().uuid();
const INPUT=z.object({documentId:UUID,purpose:z.enum(["avatar","vaccine_record","clinical_attachment","generated_report","clinical_source"])}).strict();
export type DownloadableDocument=Readonly<{documentId:string;careSpaceId:string;childId:string;purpose:DocumentPurpose;bucket:PrivateDocumentBucket;objectPath:string;displayName:string;lifecycle:DocumentLifecycle;scanState:ScanState;linkedResourceVisible:boolean}>;
export interface DownloadDocumentRepository{
  loadAuthorized(scope:AuthorizedChildScope,documentId:string,purpose:DocumentPurpose):Promise<DownloadableDocument|null>;
  recordTicket(scope:AuthorizedChildScope,documentId:string,ticket:Readonly<{ticketId:string;ticketSha256:string;expiresAt:string}>):Promise<Readonly<{outcome:"recorded"|"rate_limited"|"conflict";auditId?:string}>>;
}
export interface PrivateDownloadProvider{createSignedDownload(bucket:PrivateDocumentBucket,objectPath:string,ttlSeconds:120,options:Readonly<{download:string}>):Promise<Readonly<{signedUrl:string}>>;}
export type PrivateDownloadDependencies=Readonly<{authorize(scope:AuthorizedChildScope):Promise<boolean>;repository:DownloadDocumentRepository;provider:PrivateDownloadProvider}>;
type Code="NOT_AUTHORIZED"|"INVALID_INPUT"|"DOCUMENT_UNAVAILABLE"|"PROVIDER_UNAVAILABLE"|"RATE_LIMITED"|"IDEMPOTENCY_CONFLICT";
type Result=Readonly<{ok:true;status:"issued";ticket:DownloadTicket}>|Readonly<{ok:false;status:"unavailable";code:Code}>;
function hash(value:unknown){return createHash("sha256").update(canonicalize(value),"utf8").digest("hex");}
function scopeValid(scope:AuthorizedChildScope,now:Date){try{return Object.isFrozen(scope)&&Object.isFrozen(scope.permissions)&&isAuthorizedChildScopeActive(scope,now)&&hasPermission(scope,"read",now);}catch{return false;}}
export class PrivateDownloadTicketService{
  private readonly now:()=>Date;private readonly randomUUID:()=>string;
  constructor(private readonly dependencies:PrivateDownloadDependencies,options:Readonly<{now?:()=>Date;randomUUID?:()=>string}>={}){this.now=options.now??(()=>new Date());this.randomUUID=options.randomUUID??nodeRandomUUID;}
  async issue(scope:AuthorizedChildScope,raw:unknown):Promise<Result>{
    const current=this.readNow();if(!current||!scopeValid(scope,current)||!await this.authorized(scope))return this.fail("NOT_AUTHORIZED");const parsed=INPUT.safeParse(raw);if(!parsed.success)return this.fail("INVALID_INPUT");
    try{
      const document=await this.dependencies.repository.loadAuthorized(scope,parsed.data.documentId,parsed.data.purpose);
      if(!document||document.careSpaceId!==scope.careSpaceId||document.childId!==scope.childId||document.documentId!==parsed.data.documentId||document.purpose!==parsed.data.purpose||document.lifecycle!=="active"||document.scanState!=="clean"||!document.linkedResourceVisible||!document.objectPath.startsWith(`${scope.careSpaceId}/${scope.childId}/${document.documentId}/`))return this.fail("DOCUMENT_UNAVAILABLE");
      const provider=await this.dependencies.provider.createSignedDownload(document.bucket,document.objectPath,120,{download:document.displayName});let url:URL;try{url=new URL(provider.signedUrl);}catch{return this.fail("PROVIDER_UNAVAILABLE");}if(url.protocol!=="https:")return this.fail("PROVIDER_UNAVAILABLE");
      const ticketId=this.randomUUID(),expiresAt=new Date(current.getTime()+120_000).toISOString(),nonceSha256=hash({schemaVersion:"private-download-nonce.v1",nonce:this.randomUUID()});
      const ticketSha256=hash({schemaVersion:"private-download-ticket.v1",ticketId,documentId:document.documentId,expiresAt,nonceSha256});
      const audit=await this.dependencies.repository.recordTicket(scope,document.documentId,{ticketId,ticketSha256,expiresAt});if(audit.outcome==="rate_limited")return this.fail("RATE_LIMITED");if(audit.outcome!=="recorded"||!audit.auditId||!UUID.safeParse(audit.auditId).success)return this.fail("IDEMPOTENCY_CONFLICT");
      const ticket=downloadTicketSchema.parse({kind:"download",id:ticketId,documentId:document.documentId,audience:"guardian",downloadUrl:provider.signedUrl,displayName:document.displayName,contentDisposition:"attachment",auditId:audit.auditId,issuedAt:current.toISOString(),expiresAt,nonceSha256}) as DownloadTicket;
      return Object.freeze({ok:true,status:"issued",ticket:Object.freeze(ticket)});
    }catch{return this.fail("PROVIDER_UNAVAILABLE");}
  }
  private readNow(){try{const value=this.now();return value instanceof Date&&Number.isFinite(value.getTime())?new Date(value.getTime()):null;}catch{return null;}}
  private async authorized(scope:AuthorizedChildScope){try{return await this.dependencies.authorize(scope);}catch{return false;}}
  private fail(code:Code):Result{return Object.freeze({ok:false,status:"unavailable",code});}
}
export function createPrivateDownloadTicketService(dependencies:PrivateDownloadDependencies,options:Readonly<{now?:()=>Date;randomUUID?:()=>string}>={}):PrivateDownloadTicketService{return new PrivateDownloadTicketService(dependencies,options);}
