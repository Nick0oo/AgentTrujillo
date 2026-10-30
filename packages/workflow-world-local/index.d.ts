export function createWorld(options?: {dataDir?:string;recoverActiveRuns?:boolean;baseUrl?:string}): unknown;
export function nativeWorld(options: {dataDir:string;recoverActiveRuns:false}): unknown;
export function withRunBarrier<T>(root:string,ids:readonly string[],run:()=>Promise<T>):Promise<T>;
export function markerPath(root:string,id:string):string;
export function markErased(root:string,id:string):Promise<void>;
export const DATA_VERSION:string;
