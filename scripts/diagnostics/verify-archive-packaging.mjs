import {cp,mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as pause} from 'node:timers/promises';

const root=await mkdtemp(join(tmpdir(),'creciendo-archive-package-'));
let server;
try{
  await cp('.output/server',join(root,'server'),{recursive:true});
  await mkdir(join(root,'src/clinical'),{recursive:true});
  await cp('src/clinical/anthropometry',join(root,'src/clinical/anthropometry'),{recursive:true});
  const modules=join(root,'server/node_modules');
  await mkdir(join(modules,'@creciendo'),{recursive:true});
  await cp('packages/workflow-world-local',join(modules,'@creciendo/workflow-world-local'),{recursive:true});
  await mkdir(join(modules,'eve/dist/src'),{recursive:true});
  await cp('node_modules/eve/package.json',join(modules,'eve/package.json'));
  await cp('node_modules/eve/dist/src/compiled',join(modules,'eve/dist/src/compiled'),{recursive:true});
  const adapter=await import(pathToFileURL(join(modules,'@creciendo/workflow-world-local/index.mjs')).href);
  const data=join(root,'.eve/.workflow-data');
  const world=adapter.createWorld({dataDir:data,recoverActiveRuns:false});
  await world.start?.();
  if((await readFile(join(data,'version.txt'),'utf8')).trim()!==adapter.DATA_VERSION)throw new Error('PACKAGED_WORLD_VERSION_FAILED');
  await world.close?.();
  const reservation=createServer();await new Promise(done=>reservation.listen(0,'127.0.0.1',done));const port=reservation.address().port;await new Promise(done=>reservation.close(done));
  server=spawn(process.execPath,[join(root,'server/index.mjs')],{cwd:root,env:{...process.env,APP_ENV:'test',TEST:'1',GOOGLE_GENERATIVE_AI_API_KEY:'synthetic-fixture-key-0000000000',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic-fixture-key-0000000000',PORT:String(port),NITRO_PORT:String(port),HOST:'127.0.0.1',WORKFLOW_LOCAL_DATA_DIR:data,WORKFLOW_LOCAL_BASE_URL:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe']});
  let diagnostic='';for(const pipe of [server.stdout,server.stderr])pipe.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-30000);});
  // No source errors, request content, or environment values are exported.
  let ready=false;
  for(let count=0;count<60;count++){
    try{const response=await fetch(`http://127.0.0.1:${port}/eve/v1/health`,{signal:AbortSignal.timeout(500)});if(response.ok){ready=true;break;}}catch{}
    if(server.exitCode!==null)break;await pause(200);
  }
  if(!ready){const reason=diagnostic.split('\n').find(line=>/^(?:Error|TypeError|ReferenceError|SyntaxError)/.test(line));if(reason)process.stdout.write(reason.slice(0,240)+'\n');throw new Error('PACKAGED_SERVER_HEALTH_FAILED');}
  process.stdout.write('Packaged private World loads; protocol version and built server health pass.\n');
}catch(error){process.stdout.write(String(error.message).startsWith('PACKAGED_')?error.message+'\n':'PACKAGED_ARCHIVE_CHECK_FAILED\n');process.exitCode=1;}
finally{
  if(server&&server.exitCode===null){server.kill();await new Promise(done=>server.once('exit',done));}
  if(!resolve(root).startsWith(resolve(tmpdir())+sep+'creciendo-archive-package-'))throw new Error('UNSAFE_FIXTURE');
  await rm(root,{recursive:true,force:true});
}
