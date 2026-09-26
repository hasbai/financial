# 北极手记

## 结构与共享边界

pnpm monorepo：`apps/financial` 保留 Svelte 5 SPA、原业务/PWA；`apps/blog` 是 SvelteKit SSR。`packages/ui` 是统一 Luma primitives（官方 Luma registry，Lucide），`packages/auth` 共用 Auth0 SDK 工厂和公开配置，`packages/data` 共用 Neon PostgREST 客户端。业务 repository 和主题留在应用内。财务原有浅蓝灰、资产/现金/损益及深色配色保留；博客按参考站采用近白的 neutral 底、深灰文字、少量玫瑰色强调、紧凑导航与内容排版。桌面背景花瓣先由轻量 SVG 显示首屏，水合后淡出并交由 Canvas 动画绘制；移动端和减少动效偏好下均停用。原有移动端弹窗的 viewport、焦点与位移修复保留。

博客域名为 `hasbai.xyz` 与 `blog.hasbai.xyz`，canonical 统一 `https://hasbai.xyz`。复用数据库、Auth0 tenant/application/audience 与 superadmin；现有 Hugo 博客和文章不迁移、不覆盖。博客 Worker 名为 `blog`。

## 数据与权限

`0002_content_inheritance.sql` 将 `public.content` 作为 PostgreSQL 继承父表，`public.article` 与 `public.note` 为子表。父表保存 UUID、类型、Markdown、摘要、封面、发布状态和时间；文章另有标题、全站唯一 slug 与独立数字序列，手记没有标题或标签，使用自己的数字序列。`public.article_tag` 直接关联文章与 `public.tag`。旧文章、图片及标签 UUID 不变，旧分类 URL 存入文章 `legacy_path` 供永久重定向。跨分类重名 slug 追加文章 UUID 前缀消歧。`0002` 先保留旧分类列和 `tag_ids` 以兼容旧 Worker，部署新 Worker 并核验后由 `0004_remove_category.sql` 移除 `public.category`、`article.category_id` 与 `article.tag_ids`。父表查询用于 `/contents/:id`，写入始终指向具体子表；PostgreSQL 继承不自动将父表写入路由到子表，也不跨子表继承主键唯一性。

公开路径为 `/articles/:title`（参数取文章 slug）、`/notes/:sequence` 与 `/contents/:id`（按 `kind` 重定向到规范路径）。首页混排最近的文章和手记，时间线按发布时间聚合，关于页为静态内容。正文唯一存储为 Markdown，服务端和客户端使用同一安全 Markdown 渲染器。

文章保存使用 `save_article` Data API RPC，在一个数据库事务内写文章与标签关系，并用 id/updated_at 判断冲突；手记和删除仍使用标准 PostgREST 写入。文章和手记创建时客户端生成 UUID。UI 失败保留输入。发布要求正文和发布时间；匿名 RLS 仅放行已发布且发布时间已到的内容。`content`、`article`、`note` 与 `article_tag` 分别设置 RLS 与 GRANT；superadmin 写具体子表和关联表，anonymous 无写权限、无 financial schema 访问权。

Neon 网关要求 JWT，包括匿名访问。访客直接调用 Neon Auth `/token/anonymous` 获取短期 `role=anonymous` JWT，再直接读取 Data API；不登录、不经博客 API 代理、不使用数据库密钥。SSR 同样调用这两个公开端点。公开页使用 SvelteKit 通用 `+page.ts` load，水合后的页间跳转直接从浏览器请求匿名令牌与 Data API，不再获取 `__data.json`；导航期间立即显示骨架，关闭 hover 预取。首页和列表只读摘要列，不序列化整篇 Markdown；浏览器短时复用匿名令牌。Auth0 管理员登录继续用同一 SPA PKCE、内存 token。Neon managed auth 仅提供匿名令牌；不增加另一套用户登录入口。新增 managed `neon_auth` 属平台系统 schema，博客业务表仍全部在 public。

初始迁移 `database/blog/0001_blog.sql` 已先在生产隔离分支 `br-frosty-silence-b3y3se2p` 验证，再应用生产。继承表迁移 `0002_content_inheritance.sql`、事务函数 `0003_save_article.sql` 和分类清理 `0004_remove_category.sql` 已在生产隔离分支 `br-empty-surf-b3ljcyt4` 验证。生产先执行 `0002`、`0003`，待新 Worker 自动部署并核验后执行 `0004` 和 Data API 结构缓存刷新；未用开发分支数据覆盖生产。生产原文章与图片 UUID 保留，`category` 及文章旧分类/标签数组列已移除。

## 图片

R2 bucket `image`，key 精确等于 image.id UUID。metadata 包括 name、sha256 唯一约束、content_type、size、width/height 可选、ready、created_at。上传限制 10 MiB，按字节识别 PNG/JPEG/GIF/WebP，拒绝 SVG/HTML。先由 PostgREST 对 Auth0 token 执行元数据写入授权，再使用 Worker R2 binding 上传；sha256 唯一键处理并发去重，未完成的上传可重试同一 key，不产生重复图片。只有 ready 元数据对匿名可见。`/images/:id` 流式返回 R2 内容，nosniff、固定媒体类型与 immutable 缓存。图片为公开博客素材，不提供私有附件语义。

## 编辑和阅读

Tiptap 3 WYSIWYG，Markdown 官方扩展；支持标题、粗斜体、列表、引用、代码块、链接、表格、图片、撤销/重做和 Markdown 源码切换。服务端用 remark + rehype-sanitize 渲染，拒绝原始 HTML 和危险 URL。Markdown 表格不支持合并单元格，编辑工具不提供这种操作。文章可管理标签；手记使用同一 Markdown 编辑器，不填写标题或标签。封面可上传/移除，图片 name 作为默认 alt/title。离开未保存文档有确认；失败不清空内容。

## CI 与发布

Financial `Check`、Blog `Blog` 独立 workflow，均有廉价 changes job。业务应用目录修改只启动该应用检查；shared packages、workspace/lockfile 修改启动两边。PR 为普通检查，main push 不重复验收。Luma 有意视觉变更必须先 dispatch 两个候选 workflow、审阅并导入截图，再由普通 PR 严格比较。

财务从 `apps/financial` cwd 执行原校验脚本和 visual manifest。根脚本继续代理 `pnpm build` 等财务命令，根 wrangler 配置兼容现有自动构建入口；博客 `pnpm build:blog`。两个 Worker 的 Cloudflare 自动构建连接同一仓库 `hasbai/financial`、生产分支 `main`，财务根目录为 `apps/financial`、博客根目录为 `apps/blog`；各自仅监视本应用、`packages/*`、根 `package.json`、`pnpm-lock.yaml` 和 `pnpm-workspace.yaml`。博客 Worker 使用 `apps/blog/wrangler.jsonc` 中的 R2 `image` 绑定及两个自定义域名。GitHub Actions 不执行部署。

本地不运行 typecheck、单测、build 或 Playwright 验收，统一 GitHub Actions。设备测试是 WebKit/Chromium 模拟，不能称作 iOS 真机验收。截图、真实 JWT/API、R2 上传与线上 SSR 属独立验收层。
