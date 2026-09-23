# 北极手记

## 结构与共享边界

pnpm monorepo：`apps/financial` 保留 Svelte 5 SPA、原业务/PWA；`apps/blog` 是 SvelteKit SSR。`packages/ui` 是统一 Luma primitives（官方 Luma registry，Lucide），`packages/auth` 共用 Auth0 SDK 工厂和公开配置，`packages/data` 共用 Neon PostgREST 客户端。业务 repository 和主题留在应用内。财务原有浅蓝灰、资产/现金/损益及深色配色保留；博客采用 neutral，正文和标题为衬线字体。原有移动端弹窗的 viewport、焦点与位移修复保留。

博客域名为 `hasbai.xyz` 与 `blog.hasbai.xyz`，canonical 统一 `https://hasbai.xyz`。复用数据库、Auth0 tenant/application/audience 与 superadmin；现有 Hugo 博客和文章不迁移、不覆盖。新 Worker 名为 `hasbai-blog`。

## 数据与权限

只新增 `public.article`、`public.category`、`public.tag`、`public.image` 四张业务表。无博客视图、RPC、触发器。正文唯一存储为 Markdown；分类外键，标签用 `tag_ids uuid[]`（四表边界内不增加关联表，编辑器提供已有标签选择）。同分类 slug 唯一，类别 slug 保留系统路由，避免 `/articles/:id` 与 `/:category/:title` 冲突。

发布、撤回、编辑、删除直接采用标准 PostgREST INSERT/PATCH/DELETE。更新和删除同时过滤 id/updated_at，空返回视为冲突。UI 失败保留输入。发布要求正文和发布时间，匿名 RLS 仅放行已发布且发布时间已到的文章。superadmin 可管理四表；anonymous 无写权限，无 financial schema 访问权。

Neon 网关要求 JWT，包括匿名访问。访客直接调用 Neon Auth `/token/anonymous` 获取短期 `role=anonymous` JWT，再直接读取 Data API；不登录、不经博客 API 代理、不使用数据库密钥。SSR 同样调用这两个公开端点。Auth0 管理员登录继续用同一 SPA PKCE、内存 token。Neon managed auth 仅提供匿名令牌；不增加另一套用户登录入口。新增 managed `neon_auth` 属平台系统 schema，博客业务表仍全部在 public。

迁移 `database/blog/0001_blog.sql` 已先在生产隔离分支 `br-frosty-silence-b3y3se2p` 验证，再应用生产。隔离分支实测匿名只读已发布、草稿隔离、财务 403、Auth0 superadmin 200；生产验证单独记录于交付结果。

## 图片

R2 bucket `image`，key 精确等于 image.id UUID。metadata 包括 name、sha256 唯一约束、content_type、size、width/height 可选、ready、created_at。上传限制 10 MiB，按字节识别 PNG/JPEG/GIF/WebP，拒绝 SVG/HTML。先由 PostgREST 对 Auth0 token 执行元数据写入授权，再使用 Worker R2 binding 上传；sha256 唯一键处理并发去重，未完成的上传可重试同一 key，不产生重复图片。只有 ready 元数据对匿名可见。`/images/:id` 流式返回 R2 内容，nosniff、固定媒体类型与 immutable 缓存。图片为公开博客素材，不提供私有附件语义。

## 编辑和阅读

Tiptap 3 WYSIWYG，Markdown 官方扩展；支持标题、粗斜体、列表、引用、代码块、链接、表格、图片、撤销/重做和 Markdown 源码切换。服务端用 remark + rehype-sanitize 渲染，拒绝原始 HTML 和危险 URL。Markdown 表格不支持合并单元格，编辑工具不提供这种操作。可用标签管理入口和分类创建；封面可上传/移除。图片 name 作为默认 alt/title。离开未保存文档有确认；失败不清空内容。

## CI 与发布

Financial `Check`、Blog `Blog` 独立 workflow，均有廉价 changes job。业务应用目录修改只启动该应用检查；shared packages、workspace/lockfile 修改启动两边。PR 为普通检查，main push 不重复验收。Luma 有意视觉变更必须先 dispatch 两个候选 workflow、审阅并导入截图，再由普通 PR 严格比较。

财务从 `apps/financial` cwd 执行原校验脚本和 visual manifest。根脚本继续代理 `pnpm build` 等财务命令，根 wrangler 配置兼容现有自动构建入口；博客 `pnpm build:blog`。由于现有账户级 root token 无法签发 Workers Builds API 所要求的用户级 token，生产发布改由 `Deploy Financial` 和 `Deploy Blog` 两个 GitHub Actions 在 main 推送后按路径分别触发。令牌仅保存在 GitHub Actions Secret `CLOUDFLARE_FINANCIAL_DEPLOY_TOKEN` 和 `CLOUDFLARE_BLOG_DEPLOY_TOKEN`，由 Keychain root token 签发，具备必要的 Worker/R2/Zone 权限，不保存在仓库。两套部署均使用各自应用目录的 Wrangler 配置；不会在 PR 或其他应用的独立代码改动后运行。

本地不运行 typecheck、单测、build 或 Playwright 验收，统一 GitHub Actions。设备测试是 WebKit/Chromium 模拟，不能称作 iOS 真机验收。截图、真实 JWT/API、R2 上传与线上 SSR 属独立验收层。
