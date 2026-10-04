# 北极小站

## Google OAuth 公开说明（2026-10-04）

用户已要求撤回未经确认的首页长说明，恢复原主体文案；首页仅显示小字“本站公开阅读，编辑发布需登录后使用。”，位于“隐私政策、服务条款”链接下面左对齐。修改用户内容须先展示具体文案、位置和范围并取得同意，审核退回信息本身不构成改稿授权。此规则已写入 `AGENTS.md`。

用户已编辑并授权采用政策审阅稿。`0009_user_reviewed_policy.sql` 仅更新隐私政策正文：采用用户的登录信息和保存期限措辞，移除完整“AI 文字对话与日志”章节，其他保留段逐字采用用户稿；服务条款与现状一致，不重复改写。先在隔离生产分支 `blog-user-reviewed-policy-20261004` / `br-withered-wildflower-b3xo6oce` 验证重复执行、并发冲突拒绝和其他内容/元数据 fingerprint，再更新生产。既有 62 项数据库检查与博客页面权限检查通过，测试写入全部回滚；生产匿名 API 和 SSR 返回 200，隐私正文 hash 为 `dd935b834c3fedc6d37ab6a65282e712`。页面 ID、标题、摘要、发布状态及发布时间保留，服务条款正文 hash 不变。

`database/blog/0007_oauth_disclosures.sql` 以当前生产人工编辑版本为基线，补充 Google 身份资料的访问、使用、Auth0 存储、Cloudflare/Neon 处理、AI 模型传输、Gateway 完整请求/回复和账号名称记录，以及保留和删除方式；删除“不保存个人敏感信息”的错误概括。迁移只适用于本次生产两页 UUID 和已审阅正文，不能用于全新数据库的顺序初始化。行锁及正文 MD5 拒绝并发编辑，任一冲突整体回滚；重复执行不改变时间戳，原页面 ID、标题、摘要、发布状态和发布时间保留。

隔离生产分支 `blog-oauth-disclosures-20261004` / `br-wild-scene-b3kuusvz` 通过迁移、重复执行和并发冲突拒绝，文章、手记、图片、标签及页面其他元数据 fingerprint 一致。既有数据库脚本 62 项检查与 `database/blog/test_pages.sql` 的公开读取、草稿隔离、CRUD、匿名写入拒绝均通过，测试写入全部回滚。已应用生产，真实匿名 JWT API 与公开政策 SSR 均返回 200，两页正文 MD5 与隔离验证结果一致。

`0008_policy_site_link.sql` 将隐私页站点裸 URL 改为显式 Markdown 链接，避免自动链接吞入后续中文；仅精确替换命中的短语，保留其他正文和元数据。已先在上述隔离分支验证，再应用生产；未登录浏览器确认链接文字与目标均正确，夹具增加实际链接断言。独立页面 2 项流程与 10 张 Linux 候选重新通过并审阅导入。`0007` 的幂等验证针对其完成时的正文；后续人工编辑或 `0008` 会使其版本保护拒绝重跑，正常顺序迁移不重放旧政策快照。

Auth0 Google 连接实际配置为 `email`、`profile`；不修改现有登录连接。已核对 Google 项目 `hasbai` 的品牌名称“北极小站”、首页 `https://hasbai.xyz`、隐私 `https://hasbai.xyz/privacy`、条款 `https://hasbai.xyz/terms` 及授权域名 `hasbai.xyz`；控制台数据访问列表为空，尚未修改声明范围或重新提交审核，也未取得 Google 通过结论。登记授权域名不等同于再次验证 Search Console 所有权。

固定 Linux 镜像运行首页与独立页面场景，iPhone/WebKit、桌面/Chromium 共 4 项流程通过，34 张候选已审阅；导入首页、空首页及两份政策的有意变化，新增首页深色截图，其他页面保留原基线。博客 10 项单元测试通过；完整验收仍以 PR 最新提交 CI 为准，设备模拟不是 iOS 真机验收。

站点名统一为“北极小站”，所有页面标题、首页文案和无障碍名称引用 `site.name`；“手记”仅作为内容类型名称。编辑室及文章、手记、独立页面编辑器标题均保留站点后缀。

`database/blog/0006_site_name.sql` 仅纠正关于页旧标题及政策中精确命中的旧名称短语，并更新发生变化行的 `updated_at`。已在生产隔离分支 `blog-site-name-20261004` / `br-curly-lab-b3tquqyq` 验证并应用生产；页面 ID、其他元数据和既有文章、手记、图片 fingerprint 不变，重复执行无变化。生产仅关于页命中更新，政策正文保留用户编辑版本。生产匿名 JWT API 的三页读取均返回 200，标题和正文已无旧站点名。

## 结构与共享边界

pnpm monorepo：`apps/financial` 保留 Svelte 5 SPA、原业务/PWA；`apps/blog` 是 SvelteKit SSR。`packages/ui` 是统一 Luma primitives（官方 Luma registry，Lucide），`packages/auth` 共用 Auth0 SDK 工厂和公开配置，`packages/data` 共用 Neon PostgREST 客户端。业务 repository 和主题留在应用内。财务原有浅蓝灰、资产/现金/损益及深色配色保留；博客按参考站采用近白的 neutral 底、深灰文字、少量玫瑰色强调、紧凑导航与内容排版。桌面背景花瓣先由轻量 SVG 显示首屏，水合后淡出并交由 Canvas 动画绘制；移动端和减少动效偏好下均停用。原有移动端弹窗的 viewport、焦点与位移修复保留。

博客域名为 `hasbai.xyz` 与 `blog.hasbai.xyz`，canonical 统一 `https://hasbai.xyz`。复用数据库、Auth0 tenant/application/audience 与 superadmin；现有 Hugo 博客和文章不迁移、不覆盖。博客 Worker 名为 `blog`。

## 数据与权限

`0002_content_inheritance.sql` 将 `public.content` 作为 PostgreSQL 继承父表，`public.article` 与 `public.note` 为子表。父表保存 UUID、类型、Markdown、摘要、封面、发布状态和时间；文章另有标题、全站唯一 slug 与独立数字序列，手记没有标题或标签，使用自己的数字序列。`public.article_tag` 直接关联文章与 `public.tag`。旧文章、图片及标签 UUID 不变，旧分类 URL 存入文章 `legacy_path` 供永久重定向。跨分类重名 slug 追加文章 UUID 前缀消歧。`0002` 先保留旧分类列和 `tag_ids` 以兼容旧 Worker，部署新 Worker 并核验后由 `0004_remove_category.sql` 移除 `public.category`、`article.category_id` 与 `article.tag_ids`。父表查询用于 `/contents/:id`，写入始终指向具体子表；PostgreSQL 继承不自动将父表写入路由到子表，也不跨子表继承主键唯一性。

公开路径为 `/articles/:title`（参数取文章 slug）、`/notes/:sequence` 与 `/contents/:id`（按 `kind` 重定向到规范路径）。首页混排最近的文章和手记，时间线按发布时间聚合，独立页面 `public.page` 继承 `content`，类型为 `page`、有标题与唯一根路径 slug（例如 `/about`、`/privacy`、`/terms`），没有文章序号或标签。后台“独立页面”可创建、编辑、发布、撤回和删除，沿用 `updated_at` 冲突检测。根路径只接受小写字母、数字、连字符，禁止占用 articles、notes、timeline、tags、contents、studio、auth、api、images、assets。页面不进入首页、文章、手记或时间线；主导航固定只展示“关于”，页脚只有政策入口和版权。`/contents/:id` 同样支持 page 重定向。正文唯一存储为 Markdown，服务端和客户端使用同一安全 Markdown 渲染器。

文章保存使用 `save_article` Data API RPC，在一个数据库事务内写文章与标签关系，并用 id/updated_at 判断冲突；手记、独立页面和删除仍使用标准 PostgREST 写入。文章和手记创建时客户端生成 UUID。UI 失败保留输入。发布要求正文和发布时间；匿名 RLS 仅放行已发布且发布时间已到的内容。`content`、`article`、`note`、`page` 与 `article_tag` 分别设置 RLS 与 GRANT；superadmin 写具体子表和关联表，anonymous 无写权限、无 financial schema 访问权。

Neon 网关要求 JWT，包括匿名访问。访客直接调用 Neon Auth `/token/anonymous` 获取短期 `role=anonymous` JWT，再直接读取 Data API；不登录、不经博客 API 代理、不使用数据库密钥。SSR 同样调用这两个公开端点。公开页使用 SvelteKit 通用 `+page.ts` load，水合后的页间跳转直接从浏览器请求匿名令牌与 Data API，不再获取 `__data.json`；导航期间立即显示骨架，关闭 hover 预取。首页和列表只读摘要列，不序列化整篇 Markdown；浏览器短时复用匿名令牌。Auth0 管理员登录继续用同一 SPA PKCE、内存 token。Neon managed auth 仅提供匿名令牌；不增加另一套用户登录入口。新增 managed `neon_auth` 属平台系统 schema，博客业务表仍全部在 public。

初始迁移 `database/blog/0001_blog.sql` 已先在生产隔离分支 `br-frosty-silence-b3y3se2p` 验证，再应用生产。继承表迁移 `0002_content_inheritance.sql`、事务函数 `0003_save_article.sql` 和分类清理 `0004_remove_category.sql` 已在生产隔离分支 `br-empty-surf-b3ljcyt4` 验证。生产先执行 `0002`、`0003`，待新 Worker 自动部署并核验后执行 `0004` 和 Data API 结构缓存刷新；未用开发分支数据覆盖生产。生产原文章与图片 UUID 保留，`category` 及文章旧分类/标签数组列已移除。

## 图片

R2 bucket `image`，key 精确等于 image.id UUID。metadata 包括 name、sha256 唯一约束、content_type、size、width/height 可选、ready、created_at。上传限制 10 MiB，按字节识别 PNG/JPEG/GIF/WebP，拒绝 SVG/HTML。先由 PostgREST 对 Auth0 token 执行元数据写入授权，再使用 Worker R2 binding 上传；sha256 唯一键处理并发去重，未完成的上传可重试同一 key，不产生重复图片。只有 ready 元数据对匿名可见。`/images/:id` 流式返回 R2 内容，nosniff、固定媒体类型与 immutable 缓存。图片为公开博客素材，不提供私有附件语义。

## 编辑和阅读

Tiptap 3 WYSIWYG，Markdown 官方扩展；支持标题、粗斜体、列表、引用、代码块、链接、表格、图片、撤销/重做和 Markdown 源码切换。服务端用 remark + rehype-sanitize 渲染，拒绝原始 HTML 和危险 URL。Markdown 表格不支持合并单元格，编辑工具不提供这种操作。文章可管理标签；手记使用同一 Markdown 编辑器，不填写标题或标签。封面可上传/移除，图片 name 作为默认 alt/title。离开未保存文档有确认；失败不清空内容。

## CI 与发布

Financial `Check`、Blog `Blog` 独立 workflow，均有廉价 changes job。业务应用目录修改只启动该应用检查；shared packages、workspace/lockfile 修改启动两边。PR 为普通检查，main push 不重复验收。有意视觉变更先使用固定 Linux 镜像 `pnpm visual:blog --all` 生成截图，审阅并导入，再由普通 PR 严格比较；全站外壳变化生成全部博客场景。

财务从 `apps/financial` cwd 执行原校验脚本和 visual manifest。根脚本继续代理 `pnpm build` 等财务命令，根 wrangler 配置兼容现有自动构建入口；博客 `pnpm build:blog`。两个 Worker 的 Cloudflare 自动构建连接同一仓库 `hasbai/financial`、生产分支 `main`，财务根目录为 `apps/financial`、博客根目录为 `apps/blog`；各自仅监视本应用、`packages/*`、根 `package.json`、`pnpm-lock.yaml` 和 `pnpm-workspace.yaml`。博客 Worker 使用 `apps/blog/wrangler.jsonc` 中的 R2 `image` 绑定及两个自定义域名。GitHub Actions 不执行部署。

本地不单独运行 typecheck、单测、build 或 Playwright 验收；固定 Linux 镜像中的视觉候选流程可执行所需构建与截图。完整验收由 GitHub Actions 执行。设备测试是 WebKit/Chromium 模拟，不能称作 iOS 真机验收。截图、真实 JWT/API、R2 上传与线上 SSR 属独立验收层。

## 独立页面迁移（2026-10-04）

`database/blog/0005_pages.sql` 添加 page 的显式主键、唯一路径、正文与发布约束、RLS 和 GRANT。旧 About 文字落库，隐私政策与服务条款使用 jsclndnz@gmail.com 作为联系邮箱，描述北极小站统一登录的实际身份范围与相关应用的数据处理；不更改 Auth0 登录连接或 Google OAuth 配置。已在隔离生产分支 `blog-pages-20261004` / `br-cold-cloud-b3cldjol` 验证，再应用生产并通过 NOTIFY 刷新 Data API schema cache。真实匿名 JWT 读取三份已发布页面返回 200；迁移前后原文章记录 fingerprint 一致。政策页不经登录也可 SSR 读取。验证 SQL 位于 `database/blog/test_pages.sql`，全部测试记录和变更在事务结束时回滚。

本地固定 Linux 候选 `2026-10-03T17-06-10.926Z` 已审阅并导入 38 张手机/桌面基线，7 项流程通过、1 项按设备跳过。覆盖 page SSR、canonical、UUID 跳转、顶部导航、流隔离、自定义路径发布/改名/删除、重复/保留路径、失败保留输入及拒绝放弃未保存编辑。隐私页同时验证浅深色；设备为 WebKit/Chromium 模拟，不是 iOS 真机。普通 PR 验收与自动部署结论随发布另行核验。

## 北极小站统一登录方式（2026-10-04）

博客、财务、Tavern 和 Zboard 共用 `packages/auth` 的 Auth0 Universal Login。共享工厂不再强制 `connection=eastmoney-email`，由同一北极小站组织显示邮箱、Google、Microsoft Account 和 GitHub；Zboard 继续使用独立 API audience。通用能力后续继续在共享 packages 实现，不增加各应用专属登录选择或重复认证配置。

Google、Microsoft 和 GitHub 均已启用到北极小站应用及组织，Microsoft 组织连接已补齐。用户确认允许新 OAuth 账号登录、各应用权限另行分配：三个社交连接统一启用 `assign_membership_on_login=true`，邮箱连接准入与 signup 设置保留；不关联已有身份、不复制角色、不修改 Action。无角色账号仍签发 `role=authenticated`、`_roles=[]`，Tavern 要求 superadmin，Zboard 首次账号默认禁用。提供商已有 `https://auth.hasbai.xyz/login/callback` 回调保留，Google/Microsoft 补登记当前共用的 `https://hasbai.eu.auth0.com/login/callback` Web 回调。自定义域名与原域名签发的 issuer 不同，本次保留现有统一 domain 及服务端验证约定。

共享 SDK 配置及 Zboard audience 的 9 项相关单测通过。本地固定 Linux 镜像验证博客写作、财务总览、Zboard 页面与 Tavern 角色库，36 张候选已审阅；既有视觉基线保持，桌面博客编辑器仅 20 个像素差异，其他 35 张像素一致。此夹具不执行真实 OAuth，提供商跳转、完整账号登录、PR CI 和线上部署须分别核验。

## 登录字段兼容（2026-10-04）

统一 Auth0 Action 使用 `auth0/login-claims.js`：顶层 `username`、`email` 为身份字段，`_roles` 为角色数组，`role` 为 Neon 数据库角色字符串。共享财务/博客 audience 的角色数组包含 superadmin 时签发 `role=superadmin`，其他 audience 或账号为 authenticated；Zboard 保留独立 audience，通过 `_roles` 判断管理员。酒馆同样读取 `_roles`，保留统一 audience。两份应用 setup 脚本复用同一 Action，并移除旧应用角色 Action 的重复绑定，避免重新签发旧字段。

`role` 改成数组后，Neon 仍按 anonymous 执行，导致 `permission denied for table page`；生产 page CRUD GRANT 和编辑 RLS 本身正常。本次保留 Data API `.role` 和全部生产表权限，不添加授权 SQL 包装或扩大匿名权限。新令牌已在隔离生产副本 `auth-role-array-20261004` / `br-blue-feather-b38q5syq` 实测页面草稿创建、读取、更新、删除及文章 RPC 创建/更新；匿名公开读取、草稿隔离和写入拒绝通过。生产真实 JWT 已验证 page UPDATE 权限及财务读权限；完整页面与文章写入在隔离分支实测。最新线上统一 Action 的 blocked、邮箱验证及东方财富组织资料字段保留；将错误的字符串 contains 调用修正为 includes，避免登录返回 access_denied；数据库 superadmin 角色限定到共享财务/博客 audience。新 Zboard JWT 仍在 `_roles` 中保留 superadmin，但其数据库 role 为 authenticated，财务读取返回 403、博客写入返回 400（缺少对应 audience）。已经签发的旧令牌不会因 Action 更新被撤销，需等待过期或重新登录。旧浏览器会话需重新登录取得新签名字段，未保存编辑应先保留。

本地固定 Linux 流程完成博客全站和四应用代表页面截图审阅，无有意视觉修改；原视觉基线保留。完整单测、类型和视觉比较由 PR CI 执行；线上应用版本与真实 Worker JWT 验收在发布后独立核验。
