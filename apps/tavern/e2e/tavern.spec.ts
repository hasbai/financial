import {test,expect,type Page} from '@playwright/test';
const raw={spec:'chara_card_v2',spec_version:'2.0',data:{name:'岚',description:'港城旅店的主人。她守着一盏长明的灯，等待远行的旅人。',personality:'冷静、敏锐，善于倾听。',scenario:'雨夜，北方港城的一间旅店。',first_mes:'门外传来脚步声。岚放下手中的书，望向你。\n「雨很大，进来坐坐吧。」',mes_example:'',system_prompt:'',post_history_instructions:'',alternate_greetings:['清晨，窗外的海风带来潮声。'],tags:['奇幻','旅店'],creator:'测试作者',extensions:{}}};
const character={id:'c1',name:'岚',description:raw.data.description,creator:'测试作者',tags:['奇幻','旅店'],format:'V2',hasAvatar:false,source:'',sourceUrl:'',unsupported:[],card:raw};
const settings={userName:'旅人',persona:'一位从北方归来的旅人。',systemPrompt:'保持角色与故事连贯。',temperature:0.9,maxTokens:1024};
const book={id:'b1',name:'北境港城',enabled:true,count:2,raw:{name:'北境港城',entries:[{keys:['港城'],content:'港城的灯塔每晚亮起。',enabled:true},{keys:[],content:'故事发生在初秋。',constant:true,enabled:true}]},unsupported:[]};
const session={id:'s1',title:'港城的雨夜',characterName:'岚',updatedAt:1790990000000,settings,bookIds:['b1'],character:raw,generationId:null as string|null};
const greeting={id:'m1',role:'assistant',content:raw.data.first_mes,status:'completed',ordinal:0,requestId:null,createdAt:1790990000000};
async function fixture(page:Page,{empty=false,fail=false,delay=false,streamDelay=false,stopDelay=false}={}) {
 const current=structuredClone(session);
 const cards=empty?[]:[structuredClone(character)],books=empty?[]:[structuredClone(book)],sessions=empty?[]:[structuredClone(current)];let messages:Record<string,unknown>[]=empty?[]:[structuredClone(greeting)];let pending='';let savedSettings=structuredClone(settings);
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname,method=req.method();if(delay)return;
  if(fail){await route.fulfill({status:503,json:{message:'服务暂时不可用'}});return;}
  const body=req.headers()['content-type']?.includes('application/json')?req.postDataJSON()??{}:{};let data:unknown={ok:true};
  if(p==='/api/settings'){if(method==='PUT')savedSettings=body;data=savedSettings;}
  else if(p==='/api/characters'&&method==='GET')data={characters:cards};
  else if(p==='/api/characters'&&method==='POST'){cards.push({...character,id:'c2'});data=cards.at(-1);}
  else if(p==='/api/characters/c1'&&method==='PATCH'){Object.assign(cards[0],{card:body.card,name:body.card.data.name});data=cards[0];}
  else if(p==='/api/characters/c1'&&method==='DELETE')cards.splice(0,1);
  else if(p==='/api/characters/c1')data=character;
  else if(p==='/api/discover')data={source:url.searchParams.get('source'),page:Number(url.searchParams.get('page')),hasMore:false,results:url.searchParams.get('q')==='无结果'?[]:[{id:'source1',name:'伊莲',description:'一位守护山间书库的学者。',creator:'G-reen',tags:['奇幻'],source:'theatrelm',sourceUrl:'https://huggingface.co/datasets/G-reen/TheatreLM-v2.1-Characters'}]};
  else if(p==='/api/install'){cards.push({...character,id:'installed',name:'伊莲'});data=cards.at(-1);}
  else if(p==='/api/worldbooks'&&method==='GET')data={worldbooks:books};
  else if(p==='/api/worldbooks'&&method==='POST'){books.push({...book,id:'b2'});data=books.at(-1);}
  else if(p==='/api/worldbooks/b1'&&method==='PATCH'){Object.assign(books[0],body);data=books[0];}
  else if(p==='/api/worldbooks/b1'&&method==='DELETE')books.splice(0,1);
  else if(p==='/api/sessions'&&method==='GET')data={sessions};
  else if(p==='/api/sessions'&&method==='POST'){data=current;sessions.splice(0,sessions.length,current);messages=[greeting];}
  else if(p==='/api/sessions/s1/generate'){
   pending='pending';current.generationId=pending;
   if(!body.regenerate)messages.push({id:'user2',role:'user',content:body.content,status:'completed',ordinal:1,requestId:body.requestId,createdAt:1790990000001});
   const generated={id:pending,role:'assistant',content:'岚把热茶放在桌上。\n「你从哪里来？」',status:'completed',ordinal:2,requestId:body.requestId,createdAt:1790990000002};messages.push(generated);
   const frames=[{type:'start',messageId:pending,requestId:body.requestId},{type:'delta',text:generated.content}];
   if(streamDelay){messages[messages.length-1]={...generated,status:'pending'};await route.fulfill({contentType:'text/event-stream',body:frames.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});return;}
   current.generationId=null;frames.push({type:'done',message:generated} as never);await route.fulfill({contentType:'text/event-stream',body:frames.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});return;
  }
  else if(p==='/api/sessions/s1/stop'){messages=messages.map(m=>m.id===pending?{...m,status:'aborted'}:m);if(stopDelay)setTimeout(()=>current.generationId=null,1700);else current.generationId=null;}
  else if(p==='/api/sessions/s1/fork'){data={...current,id:'fork',title:'港城的雨夜 · 分支'};sessions.push(data as typeof session);messages=[{...greeting,id:'fork-message',content:body.content}];}
  else if(p==='/api/sessions/s1'&&method==='PATCH'){Object.assign(current,body);data=current;}
  else if(p==='/api/sessions/s1'&&method==='DELETE')sessions.splice(0,sessions.length);
  else if(p==='/api/sessions/s1'||p==='/api/sessions/fork')data={session:sessions.find(s=>p.endsWith(s.id)),messages};
  else if(p.endsWith('/export')){await route.fulfill({contentType:'application/json',body:JSON.stringify(raw)});return;}
  await route.fulfill({json:data});
 });
 await page.goto('/e2e/index.html');
}
async function nav(page:Page,name:string){await page.getByRole('navigation').getByRole('link',{name,exact:true}).click();}
async function shot(page:Page,name:string){const dialog=page.getByRole('dialog');if(await dialog.isVisible()){await expect.poll(()=>dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);await dialog.focus();await expect(dialog).toBeFocused();}await page.mouse.move(0,0);await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});await expect(page).toHaveScreenshot(name,{fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
test('library and character editor',async({page})=>{
 await fixture(page);await expect(page.getByRole('heading',{name:'岚',exact:true})).toBeVisible();await shot(page,'library.png');
 await page.getByRole('button',{name:/岚.*测试作者/}).click();await expect(page.getByRole('dialog')).toBeVisible();await shot(page,'character-detail.png');const original=page.waitForEvent('download');await page.getByRole('button',{name:'导出原文件'}).click();expect((await original).suggestedFilename()).toMatch(/\.json$/);await page.getByRole('button',{name:'编辑角色',exact:true}).click();await page.getByLabel('角色卡 JSON').fill('{invalid');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await shot(page,'character-invalid.png');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'创建角色'}).click();await expect(page.getByLabel('角色卡 JSON')).toBeVisible();await shot(page,'character-create.png');await page.keyboard.press('Escape');
 const upload=page.getByLabel('导入角色卡',{exact:true});await upload.setInputFiles({name:'character.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});await expect(page.getByRole('heading',{name:'角色库 2'})).toBeVisible();
});
test('search and install real adapter contract',async({page})=>{
 await fixture(page);await nav(page,'发现');await shot(page,'discover.png');await page.getByLabel('关键词').fill('学者');await page.getByRole('button',{name:'搜索',exact:true}).click();await expect(page.getByRole('heading',{name:'伊莲'})).toBeVisible();await shot(page,'search-results.png');await page.getByRole('button',{name:'安装',exact:true}).click();await expect(page.getByRole('button',{name:'已安装'})).toBeDisabled();await shot(page,'installed.png');await nav(page,'角色库');await expect(page.getByRole('heading',{name:'伊莲'})).toBeVisible();
});
test('worldbooks settings and dark mode',async({page})=>{
 await fixture(page);await nav(page,'世界书');await expect(page.getByRole('heading',{name:'北境港城'})).toBeVisible();await shot(page,'worldbooks.png');await page.getByRole('button',{name:'编辑 北境港城'}).click();await shot(page,'worldbook-editor.png');await page.keyboard.press('Escape');await nav(page,'设置');await page.getByLabel('你的名字').fill('远行者');await page.getByRole('button',{name:'保存设置'}).click();await expect(page.getByRole('status')).toHaveText('已保存');await shot(page,'settings.png');await page.getByRole('button',{name:'切换深色模式'}).last().click();await nav(page,'角色库');await shot(page,'library-dark.png');
});
test('chat stream editing export and keyboard',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'开始对话',exact:true}).click();await expect(page.getByText('门外传来脚步声。',{exact:false})).toBeVisible();await shot(page,'chat.png');await page.getByLabel('发送消息',{exact:true}).fill('我是从北方回来的旅人。');await page.getByLabel('发送消息',{exact:true}).press('Control+Enter');await expect(page.getByText('岚把热茶放在桌上。',{exact:false})).toBeVisible();await shot(page,'chat-reply.png');
 await page.getByRole('button',{name:'会话设置'}).click();await expect(page.getByRole('dialog')).toBeVisible();if(page.viewportSize()!.width>639)await expect(page.getByLabel('会话名称')).toBeFocused();else await expect(page.getByRole('dialog')).toBeFocused();await shot(page,'chat-settings.png');await page.keyboard.press('Escape');await page.getByRole('button',{name:'编辑第 2 条消息'}).click();await expect(page.getByRole('dialog')).toBeVisible();await shot(page,'chat-edit.png');await page.getByLabel('消息内容').fill('新的旅程。');await page.getByRole('button',{name:'创建分支',exact:true}).click();await expect(page.getByText('新的旅程。',{exact:true})).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出对话'}).click();expect((await download).suggestedFilename()).toMatch(/\.jsonl$/);
});
test('empty error and loading states',async({page})=>{
 await fixture(page,{empty:true});await expect(page.getByRole('heading',{name:'角色库为空'})).toBeVisible();await shot(page,'library-empty.png');await nav(page,'世界书');await shot(page,'worldbooks-empty.png');await nav(page,'对话');await shot(page,'chat-empty.png');
 await page.unroute('**/api/**');await fixture(page,{fail:true});await expect(page.getByRole('alert')).toContainText('服务暂时不可用');await shot(page,'library-error.png');await page.unroute('**/api/**');await fixture(page,{delay:true});await expect(page.getByRole('status')).toContainText('正在加载角色');await shot(page,'library-loading.png');
});
test('interrupted stream can be stopped and recovered',async({page})=>{
 await fixture(page,{streamDelay:true,stopDelay:true});await page.getByRole('button',{name:'开始对话',exact:true}).click();await page.getByLabel('发送消息',{exact:true}).fill('继续');await page.getByRole('button',{name:'发送',exact:true}).click();await expect(page.getByRole('button',{name:'停止',exact:true})).toBeVisible();await shot(page,'chat-interrupted.png');await page.getByRole('button',{name:'停止',exact:true}).click();await expect(page.getByText('已停止',{exact:true})).toBeVisible();await expect(page.getByLabel('发送消息',{exact:true})).toBeEnabled();await shot(page,'chat-stopped.png');
});

test('every page dark error loading and keyboard states',async({page})=>{
 await fixture(page);await nav(page,'设置');await page.getByRole('button',{name:'切换深色模式'}).last().click();
 for(const [name,slug] of [['世界书','worldbooks'],['设置','settings'],['发现','discover'],['对话','chat']]){
  await nav(page,name);if(name==='发现'){await page.getByRole('button',{name:'浏览角色'}).click();await expect(page.getByRole('heading',{name:'伊莲'})).toBeVisible();}
  await shot(page,slug+'-dark.png');
 }
 await page.unroute('**/api/**');await fixture(page,{fail:true});
 for(const [name,slug] of [['世界书','worldbooks'],['设置','settings'],['发现','discover'],['对话','chat']]){
  await nav(page,name);if(name==='发现')await page.getByRole('button',{name:'浏览角色'}).click();await expect(page.getByRole('alert')).toContainText('服务暂时不可用');await shot(page,slug+'-error.png');
  if(name==='设置')await expect(page.getByRole('button',{name:'保存设置'})).toHaveCount(0);
 }
 await page.unroute('**/api/**');await fixture(page,{delay:true});
 for(const [name,slug] of [['世界书','worldbooks'],['设置','settings'],['发现','discover'],['对话','chat']]){
  await nav(page,name);if(name==='发现')await page.getByRole('button',{name:'浏览角色'}).click();await expect(page.getByRole('status')).toContainText(/正在/);await shot(page,slug+'-loading.png');
 }
 await page.unroute('**/api/**');await fixture(page);await page.getByLabel('搜索角色',{exact:true}).focus();await page.keyboard.type('不存在');await expect(page.getByRole('heading',{name:'没有匹配的角色'})).toBeVisible();
 await nav(page,'发现');await page.getByLabel('关键词').focus();await page.keyboard.type('学者');await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'伊莲'})).toBeVisible();
 await nav(page,'世界书');await page.getByRole('button',{name:'编辑 北境港城'}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await nav(page,'设置');await page.getByLabel('你的名字').focus();await page.keyboard.press('Control+A');await page.keyboard.type('键盘旅人');await page.keyboard.press('Enter');await expect(page.getByRole('status')).toHaveText('已保存');
});
