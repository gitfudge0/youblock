import {zipSync,strToU8} from 'fflate';
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function entries(path,prefix=''){let result={};for(const d of await readdir(path,{withFileTypes:true})){const name=prefix+d.name;if(d.isDirectory())Object.assign(result,await entries(path+'/'+d.name,name+'/'));else result[name]=new Uint8Array(await readFile(path+'/'+d.name))}return result}
await mkdir('artifacts',{recursive:true});const sums=[];
for(const browser of ['chrome','firefox']){const data=zipSync(await entries('dist/'+browser),{level:9,mtime:new Date('2020-01-01T00:00:00Z')});const name=`youblock-${browser}-0.1.0.zip`;await writeFile('artifacts/'+name,data);sums.push(createHash('sha256').update(data).digest('hex')+'  '+name)}
await writeFile('artifacts/SHA256SUMS',sums.join('\n')+'\n');console.log(sums.join('\n'));
