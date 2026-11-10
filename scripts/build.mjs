import {build as viteBuild} from 'vite';
import {build} from 'esbuild';
import {mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await viteBuild();
await build({entryPoints:{background:'src/scripts/background.ts',content:'src/scripts/content.ts',conceal:'src/scripts/conceal.ts',page:'src/scripts/page.ts'},bundle:true,format:'iife',target:['chrome120','firefox128'],outdir:'dist/scripts',minify:false});
for(const browser of ['chrome','firefox']){
 const root=`dist/${browser}`;await mkdir(root,{recursive:true});
 await cp('dist/ui',root,{recursive:true});await cp('dist/scripts',`${root}/scripts`,{recursive:true});
 await cp('assets',`${root}/assets`,{recursive:true});await cp('LICENSE',`${root}/LICENSE`);await cp('THIRD_PARTY_NOTICES.md',`${root}/THIRD_PARTY_NOTICES.md`);
 for (const name of ['react','react-dom','motion','lucide-react']) {
 const license = await readFile(`node_modules/${name}/LICENSE`, 'utf8').catch(()=>readFile(`node_modules/${name}/LICENSE.md`,'utf8')).catch(()=>null);
 if(license) await writeFile(`${root}/LICENSE-${name}.txt`, license);
 }
 const matches=['https://www.youtube.com/*','https://m.youtube.com/*'];
 const manifest={manifest_version:3,name:'YouBlock',version:'0.1.0',description:'A quieter YouTube. Hide or strongly blur videos and comments with local rules.',permissions:['storage'],content_scripts:[{matches,js:['scripts/content.js'],run_at:'document_start',all_frames:true},{matches,js:['scripts/page.js','scripts/conceal.js'],run_at:'document_start',world:'MAIN',all_frames:true}],action:{default_title:'YouBlock',default_popup:'popup.html',default_icon:{16:'assets/icons/16.png',48:'assets/icons/48.png',128:'assets/icons/128.png'}},options_ui:{page:'options.html',open_in_tab:true},icons:{16:'assets/icons/16.png',48:'assets/icons/48.png',128:'assets/icons/128.png'},background:browser==='chrome'?{service_worker:'scripts/background.js'}:{scripts:['scripts/background.js']},content_security_policy:{extension_pages:"script-src 'self'; object-src 'self'"}};
 if(browser==='firefox')manifest.browser_specific_settings={gecko:{id:'youblock@gitfudge0',strict_min_version:'142.0',data_collection_permissions:{required:['none']}},gecko_android:{strict_min_version:'142.0'}};
 await writeFile(`${root}/manifest.json`,JSON.stringify(manifest,null,2));
}
console.log('Built dist/chrome and dist/firefox');
