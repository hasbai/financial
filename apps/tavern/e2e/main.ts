import { mount } from 'svelte';import Tavern from '../src/Tavern.svelte';import { createApi } from '../src/lib/api';import '../src/app.css';
mount(Tavern,{target:document.getElementById('app')!,props:{api:createApi(async()=> 'test-only-token'),logout:()=>{document.body.textContent='已退出';}}});
