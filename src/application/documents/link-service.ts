import { z } from "zod";

import { hasPermission,isAuthorizedChildScopeActive,type AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import { documentLinkSchema,type DocumentLink,type DocumentPurpose,type ScanState,type DocumentLifecycle } from "../../clinical/documents/types.ts";

const UUID=z.string().uuid(), DIGEST=z.string().regex(/^[a-f0-9]{64}$/u), KEY=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u);
const RESOURCE=z.enum(["vaccine_administration","development_observation","clinical_memory","growth_measurement","medication_plan","generated_report"]);
const LINK=z.object({documentId:UUID,resourceType:RESOURCE,resourceId:UUID,purpose:z.enum(["avatar","vaccine_record","clinical_attachment","generated_report","clinical_source"]),confirmationSha256:DIGEST,idempotencyKey:KEY}).strict();
const UNLINK=z.object({documentId:UUID,resourceType:RESOURCE,resourceId:UUID,idempotencyKey:KEY}).strict();

export type LinkableDocument=Readonly<{documentId:string;careSpaceId:string;childId:string;purpose:DocumentPurpose;lifecycle:DocumentLifecycle;scanState:ScanState;sha256:string}>;
export type LinkableResource=Readonly<{resourceId:string;careSpaceId:string;childId:string;resourceType:z.infer<typeof RESOURCE>;visible:boolean}>;
export interface DocumentLinkRepository{
  loadDocument(scope:AuthorizedChildScope,documentId:string):Promise<LinkableDocument|null>;
  resolveResource(scope:AuthorizedChildScope,resourceType:z.infer<typeof RESOURCE>,resourceId:string):Promise<LinkableResource|null>;
  linkAtomic(scope:AuthorizedChildScope,input:Readonly<z.infer<typeof LINK>>):Promise<Readonly<{outcome:"created"|"idempotent_replay"|"conflict";linkedAt?:string}>>;
  unlinkAtomic(scope:AuthorizedChildScope,input:Readonly<z.infer<typeof UNLINK>>):Promise<Readonly<{outcome:"unlinked"|"idempotent_replay"|"conflict"}>>;
  list(scope:AuthorizedChildScope):Promise<readonly DocumentLink[]>;
}
export type DocumentLinkDependencies=Readonly<{authorize(scope:AuthorizedChildScope):Promise<boolean>;repository:DocumentLinkRepository}>;
type FailureCode="NOT_AUTHORIZED"|"INVALID_INPUT"|"DOCUMENT_UNAVAILABLE"|"RESOURCE_UNAVAILABLE"|"PURPOSE_MISMATCH"|"IDEMPOTENCY_CONFLICT"|"STORAGE_UNAVAILABLE";
type Failure=Readonly<{ok:false;status:"unavailable";code:FailureCode}>;
export type LinkResult=Readonly<{ok:true;status:"linked";outcome:"created"|"idempotent_replay";link:DocumentLink}>|Failure;

const COMPATIBLE:Readonly<Record<DocumentPurpose,readonly z.infer<typeof RESOURCE>[]>>={
  avatar:[],vaccine_record:["vaccine_administration"],clinical_attachment:["development_observation","clinical_memory","growth_measurement","medication_plan"],generated_report:["generated_report"],clinical_source:[],
};
function scopeValid(scope:AuthorizedChildScope,now:Date){try{return Object.isFrozen(scope)&&Object.isFrozen(scope.permissions)&&isAuthorizedChildScopeActive(scope,now)&&hasPermission(scope,"manage_documents",now);}catch{return false;}}

export class DocumentLinkService{
  private readonly now:()=>Date;
  constructor(private readonly dependencies:DocumentLinkDependencies,options:Readonly<{now?:()=>Date}>={}){this.now=options.now??(()=>new Date());}
  async link(scope:AuthorizedChildScope,raw:unknown):Promise<LinkResult>{
    if(!await this.authorized(scope))return this.fail("NOT_AUTHORIZED");
    const parsed=LINK.safeParse(raw);if(!parsed.success)return this.fail("INVALID_INPUT");
    try{
      const [document,resource]=await Promise.all([this.dependencies.repository.loadDocument(scope,parsed.data.documentId),this.dependencies.repository.resolveResource(scope,parsed.data.resourceType,parsed.data.resourceId)]);
      if(!document||document.careSpaceId!==scope.careSpaceId||document.childId!==scope.childId||document.lifecycle!=="active"||document.scanState!=="clean")return this.fail("DOCUMENT_UNAVAILABLE");
      if(!resource||!resource.visible||resource.careSpaceId!==scope.careSpaceId||resource.childId!==scope.childId||resource.resourceType!==parsed.data.resourceType)return this.fail("RESOURCE_UNAVAILABLE");
      if(document.purpose!==parsed.data.purpose||!COMPATIBLE[document.purpose].includes(parsed.data.resourceType))return this.fail("PURPOSE_MISMATCH");
      const stored=await this.dependencies.repository.linkAtomic(scope,parsed.data);if(stored.outcome==="conflict"||!stored.linkedAt)return this.fail("IDEMPOTENCY_CONFLICT");
      const {idempotencyKey:_,...linkInput}=parsed.data;
      const link=documentLinkSchema.parse({...linkInput,linkedAt:stored.linkedAt,lifecycle:"active"}) as DocumentLink;
      return Object.freeze({ok:true,status:"linked",outcome:stored.outcome,link:Object.freeze(link)});
    }catch{return this.fail("STORAGE_UNAVAILABLE");}
  }
  async unlink(scope:AuthorizedChildScope,raw:unknown):Promise<Readonly<{ok:boolean;status:"unlinked"|"unavailable"}>>{
    if(!await this.authorized(scope))return Object.freeze({ok:false,status:"unavailable"});const parsed=UNLINK.safeParse(raw);if(!parsed.success)return Object.freeze({ok:false,status:"unavailable"});
    try{const result=await this.dependencies.repository.unlinkAtomic(scope,parsed.data);return result.outcome==="conflict"?Object.freeze({ok:false,status:"unavailable"}):Object.freeze({ok:true,status:"unlinked"});}catch{return Object.freeze({ok:false,status:"unavailable"});}
  }
  async list(scope:AuthorizedChildScope):Promise<Readonly<{ok:true;links:readonly DocumentLink[]}|{ok:false;status:"unavailable"}>>{
    if(!await this.authorized(scope))return Object.freeze({ok:false,status:"unavailable"});try{const raw=await this.dependencies.repository.list(scope);if(!Array.isArray(raw)||raw.length>1000)return Object.freeze({ok:false,status:"unavailable"});const links=raw.map(value=>documentLinkSchema.parse(value) as DocumentLink);links.sort((a,b)=>a.linkedAt.localeCompare(b.linkedAt)||a.documentId.localeCompare(b.documentId));return Object.freeze({ok:true,links:Object.freeze(links)});}catch{return Object.freeze({ok:false,status:"unavailable"});}
  }
  private async authorized(scope:AuthorizedChildScope){let now:Date;try{now=this.now();}catch{return false;}if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!scopeValid(scope,now))return false;try{return await this.dependencies.authorize(scope);}catch{return false;}}
  private fail(code:FailureCode):Failure{return Object.freeze({ok:false,status:"unavailable",code});}
}
export function createDocumentLinkService(dependencies:DocumentLinkDependencies,options:Readonly<{now?:()=>Date}>={}):DocumentLinkService{return new DocumentLinkService(dependencies,options);}
