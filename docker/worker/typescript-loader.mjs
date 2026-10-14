import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
registerHooks({
 resolve(specifier,context,next){
  if(specifier==='server-only')return {url:'data:text/javascript,export {}',shortCircuit:true};
  if(specifier.startsWith('@/'))return {url:pathToFileURL(process.cwd()+'/'+specifier.slice(2)+'.ts').href,shortCircuit:true};
  if(specifier==='next/server')return next('next/server.js',context);
  return next(specifier,context);
 },
 load(url,context,next){
  if(url.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(readFileSync(fileURLToPath(url),'utf8')),shortCircuit:true};
  return next(url,context);
 }
});
