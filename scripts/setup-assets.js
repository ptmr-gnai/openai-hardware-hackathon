// Fetch once during installation; inference subsequently runs entirely locally.
import {fetch,EnvHttpProxyAgent} from 'undici';
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const model=new URL('public/models/pose_landmarker_lite.task',root);
const expected='59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(new URL('public/models/',root),{recursive:true});
await cp(fileURLToPath(new URL('node_modules/@mediapipe/tasks-vision/wasm/',root)),fileURLToPath(new URL('public/wasm/',root)),{recursive:true});
let existing;
try{existing=await readFile(model);}catch(error){if(error.code!=='ENOENT')throw error;}
if(!existing||hash(existing)!==expected){
 console.log('Downloading pinned MediaPipe pose model…');
 const response=await fetch('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',{signal:AbortSignal.timeout(60000),dispatcher:new EnvHttpProxyAgent()});
 if(!response.ok)throw new Error(`Pose model download failed: ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(hash(bytes)!==expected)throw new Error('Pose model checksum mismatch; refusing to install.');
 await writeFile(model,bytes);
}
console.log('Local pose model and WASM ready.');
