// Public corpus only; no user content or credentials are read by this script.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const revision='eb8597aec4e3e114b2d28b86c3e2496dd48c5af3';
const expectedHash='6acddc549996246cca97a3bda0560b9fbafe188920703815adeb33d3459b165a';
const dataset='G-reen/TheatreLM-v2.1-Characters';
const app=fileURLToPath(new URL('..',import.meta.url));
const dir=resolve(app,'.local-tavern/catalog');mkdirSync(dir,{recursive:true});
const input=resolve(dir,'worlds.json');
if(!process.argv.includes('--cached'))execFileSync('curl',['--fail','--location','--silent','--show-error','--max-time','300',`https://huggingface.co/datasets/${dataset}/resolve/${revision}/worlds.json`,'-o',input],{stdio:'inherit'});
const bytes=readFileSync(input);if(createHash('sha256').update(bytes).digest('hex')!==expectedHash)throw new Error('Public corpus checksum mismatch');
const source=JSON.parse(bytes.toString());const rows=Array.isArray(source)?source:Object.values(source);
if(rows.length!==5011)throw new Error('Expected full 5011-character source corpus');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
let statements=[],parts=[],size=0;const maxBytes=4*1024*1024;
function flush(){if(!statements.length)return;const path=resolve(dir,`part-${parts.length}.sql`);writeFileSync(path,statements.join('\n')+'\n');parts.push(path);statements=[];size=0;}
for(let id=0;id<rows.length;id++){
 const row=rows[id];if(!row.character_name?.trim()||typeof row.character_card!=='string')throw new Error('Malformed source row '+id);
 const card={spec:'chara_card_v2',spec_version:'2.0',data:{name:row.character_name,description:row.character||row.character_card,personality:row.character_card,scenario:row.setting_summarized||'',first_mes:row.story_introduction||'',mes_example:'',creator_notes:row.story_outline||'',system_prompt:'',post_history_instructions:'',alternate_greetings:[],tags:[],creator:'G-reen',character_version:'',extensions:{tavern:{dataset,revision,row:id,license:'CC-BY-2.0',converted:true}},character_book:{name:row.character_name+' · 世界书',entries:row.lorebook?[{id:0,keys:[],content:row.lorebook,enabled:true,constant:true,insertion_order:0,extensions:{}}]:[],extensions:{}}}};
 const sourceUrl=`https://huggingface.co/datasets/${dataset}/blob/${revision}/worlds.json`;
 const sql='INSERT OR REPLACE INTO source_catalog(source,revision,source_id,name,description,creator,tags_json,source_url,card_json) VALUES('+['theatrelm',revision,id,row.character_name,(row.character_summary||row.character_card).slice(0,350),'G-reen','[]',sourceUrl,JSON.stringify(card)].map(q).join(',')+');';
 if(size+Buffer.byteLength(sql)>maxBytes)flush();statements.push(sql);size+=Buffer.byteLength(sql);
}flush();
const release=resolve(dir,'release.sql');writeFileSync(release,`INSERT INTO source_releases(source,revision,count,imported_at) SELECT 'theatrelm',${q(revision)},5011,${Date.now()} WHERE (SELECT COUNT(*) FROM source_catalog WHERE source='theatrelm' AND revision=${q(revision)})=5011 ON CONFLICT(source) DO UPDATE SET revision=excluded.revision,count=excluded.count,imported_at=excluded.imported_at;\n`);
writeFileSync(resolve(dir,'manifest.json'),JSON.stringify({dataset,revision,sha256:expectedHash,rows:rows.length,parts,release},null,2)+'\n');
if(process.argv.includes('--apply')){
 const target=process.argv.includes('--remote')?'--remote':'--local';
 const start=Number(process.argv.find(v=>v.startsWith('--from='))?.slice(7)??'0');
 if(!Number.isInteger(start)||start<0||start>=parts.length)throw new Error('Invalid resume part');
 for(const file of [...parts.slice(start),release]){execFileSync('pnpm',['exec','wrangler','d1','execute','tavern',target,'--file',file,'--yes'],{stdio:['ignore','pipe','pipe'],cwd:app,maxBuffer:32*1024*1024});
 console.log('Applied '+file.split('/').at(-1));}
}
console.log(JSON.stringify({revision,rows:rows.length,parts:parts.length,release}));
