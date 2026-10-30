import {gunzipSync,zstdDecompressSync} from 'node:zlib';

export const RUN_ID=/^wrun_[0-9A-HJKMNP-TV-Z]{26}$/;
export function lineage(attributes:Record<string,string>|undefined):string[]{
  return ['$rootRunId','$parentRunId','$eve.root','$eve.parent'].map(key=>attributes?.[key]).filter((value):value is string=>typeof value==='string'&&RUN_ID.test(value));
}
/** Read only the runtime-owned argument paths; message text is never authority. */
export function legacyLineage(input:unknown):string[]{
  let graph:unknown[]|undefined;
  if(input instanceof Uint8Array){
    let bytes:Uint8Array=input;
    for(let n=0;n<3;n++){
      const format=Buffer.from(bytes.subarray(0,4)).toString('ascii');
      if(format==='gzip'){bytes=gunzipSync(bytes.subarray(4),{maxOutputLength:16*1024*1024});continue;}
      if(format==='zstd'){bytes=zstdDecompressSync(bytes.subarray(4),{maxOutputLength:16*1024*1024});continue;}
      if(format!=='devl')throw new Error('ARCHIVE_LEGACY_FORMAT_UNSUPPORTED');
      const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(4)));
      if(!Array.isArray(parsed))throw new Error('ARCHIVE_LEGACY_FORMAT_UNSUPPORTED');
      graph=parsed;break;
    }
    if(!graph)throw new Error('ARCHIVE_LEGACY_FORMAT_UNSUPPORTED');
  }
  const root=graph?graph[0]:input;
  const dereference=(value:unknown)=>graph&&typeof value==='number'&&value>=0&&Number.isInteger(value)?graph[value]:value;
  const path=(keys:readonly (string|number)[])=>{
    let current=root;
    for(const key of keys){
      if(current===null||typeof current!=='object'||!Object.hasOwn(current,key))return undefined;
      current=dereference((current as Record<string|number,unknown>)[key]);
    }
    return current;
  };
  const paths:readonly (readonly (string|number)[])[]=[
    [0,'stepInput','sessionState','sessionId'],[0,'sessionState','sessionId'],
    [0,'serializedContext','eve.parentSession','rootSessionId'],[0,'serializedContext','eve.parentSession','sessionId'],
  ];
  return paths.map(path).filter((value):value is string=>typeof value==='string'&&RUN_ID.test(value));
}
