import { createServer } from 'node:http';

const tag = { id: '10000000-0000-4000-8000-000000000001', name: '随笔', slug: 'writing' };
const article = {
  id: '20000000-0000-4000-8000-000000000001', kind: 'article', sequence: 1,
  title: 'Hello World，开始记录', slug: 'hello-world', legacy_path: '/notes/hello-world',
  excerpt: '写作让零散的想法有了形状。这里是一次新的开始。',
  markdown: '## 从一页空白开始\n\n这是北极手记的第一篇文章。把思考留下来，让日常值得回看。\n\n> 写下来，就有了下一次对话。',
  cover_id: null, status: 'published', published_at: '2026-09-23T00:00:00Z',
  created_at: '2026-09-23T00:00:00Z', updated_at: '2026-09-23T00:00:00Z',
};
const note = {
  id: '30000000-0000-4000-8000-000000000001', kind: 'note', sequence: 1,
  excerpt: '今天想把一个简单的念头留下来。',
  markdown: '今天想把一个简单的念头留下来。\n\n即使没有标题，也值得记录。',
  cover_id: null, status: 'published', published_at: '2026-09-22T00:00:00Z',
  created_at: '2026-09-22T00:00:00Z', updated_at: '2026-09-22T00:00:00Z',
};
let articles = [{ ...article }];
let notes = [{ ...note }];
let tags = [{ ...tag }];
let links = [{ article_id: article.id, tag_id: tag.id }];
let fail = false;

function filter(rows, url) {
  let result = rows;
  for (const [key, query] of url.searchParams) {
    if (!query.startsWith('eq.')) continue;
    const value = query.slice(3);
    result = result.filter((row) => String(row[key]) === value);
  }
  return result;
}
async function bodyOf(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body);
}
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.end(); return; }
  if (url.pathname === '/reset') {
    articles = [{ ...article }]; notes = [{ ...note }]; tags = [{ ...tag }];
    links = [{ article_id: article.id, tag_id: tag.id }]; fail = false;
    res.end('{}'); return;
  }
  if (url.pathname === '/empty') { articles = []; notes = []; links = []; res.end('{}'); return; }
  if (url.pathname === '/fail') { fail = true; res.end('{}'); return; }
  if (url.pathname === '/auth/token/anonymous') { res.end(JSON.stringify({ token: 'guest' })); return; }
  if (fail) { res.statusCode = 503; res.end(JSON.stringify({ message: 'unavailable' })); return; }
  if (url.pathname.endsWith('/rpc/save_article')) {
    const values = await bodyOf(req);
    const previous = values.p_updated_at ? articles.find((row) => row.id === values.p_id && row.updated_at === values.p_updated_at) : null;
    if (values.p_updated_at && !previous) { res.statusCode = 409; res.end(JSON.stringify({ message: '文章已被更新' })); return; }
    const saved = {
      ...(previous ?? article), id: values.p_id, kind: 'article', sequence: previous?.sequence ?? articles.length + 1,
      title: values.p_title, slug: values.p_slug, excerpt: values.p_excerpt,
      markdown: values.p_markdown, cover_id: values.p_cover_id,
      status: values.p_status, published_at: values.p_published_at,
      updated_at: new Date().toISOString(),
    };
    if (previous) Object.assign(previous, saved);
    else articles.push(saved);
    links = links.filter((link) => link.article_id !== saved.id);
    links.push(...values.p_tag_ids.map((tag_id) => ({ article_id: saved.id, tag_id })));
    res.end(JSON.stringify(saved)); return;
  }

  const table = url.pathname.split('/').pop();
  const collections = { article: articles, note: notes, content: [...articles, ...notes], tag: tags, article_tag: links };
  let data = collections[table] ?? [];
  if (req.method === 'GET') data = filter(data, url);
  if (req.method === 'POST') {
    const payload = await bodyOf(req);
    const values = Array.isArray(payload) ? payload : [payload];
    if (table === 'article') {
      data = values.map((value) => ({ ...article, ...value, kind: 'article', sequence: articles.length + 1 }));
      articles.push(...data);
    } else if (table === 'note') {
      data = values.map((value) => ({ ...note, ...value, kind: 'note', sequence: notes.length + 1 }));
      notes.push(...data);
    } else if (table === 'tag') {
      data = values.map((value) => ({ ...value, id: crypto.randomUUID() })); tags.push(...data);
    } else if (table === 'article_tag') { data = values; links.push(...values); }
  }
  if (req.method === 'PATCH') {
    const payload = await bodyOf(req);
    const selected = filter(data, url);
    data = selected.map((row) => Object.assign(row, payload));
  }
  if (req.method === 'DELETE') {
    data = filter(data, url);
    if (table === 'article') articles = articles.filter((row) => !data.includes(row));
    if (table === 'note') notes = notes.filter((row) => !data.includes(row));
    if (table === 'article_tag') links = links.filter((row) => !data.includes(row));
  }
  if (req.headers.accept?.includes('vnd.pgrst.object')) data = data[0] ?? null;
  res.end(JSON.stringify(data));
}).listen(4180, '127.0.0.1');
