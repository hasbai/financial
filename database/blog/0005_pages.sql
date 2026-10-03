-- Add editable standalone pages alongside articles and notes, before deploying
-- their public routes. Existing content and IDs are preserved.
BEGIN;
CREATE TABLE public.page (
  title text NOT NULL,
  slug text NOT NULL,
  CONSTRAINT page_pkey PRIMARY KEY (id),
  CONSTRAINT page_slug_unique UNIQUE (slug),
  CONSTRAINT page_kind_check CHECK (kind = 'page'),
  CONSTRAINT page_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  CONSTRAINT page_slug_check CHECK (
    slug ~ '^[a-z0-9][a-z0-9-]{0,159}$'
    AND slug NOT IN ('articles', 'notes', 'timeline', 'tags', 'contents', 'studio', 'auth', 'api', 'images', 'assets')
  ),
  CONSTRAINT page_excerpt_check CHECK (length(excerpt) <= 600),
  CONSTRAINT page_markdown_check CHECK (octet_length(markdown) <= 1048576),
  CONSTRAINT page_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT page_publication_check CHECK (status <> 'published' OR (published_at IS NOT NULL AND length(btrim(markdown)) > 0)),
  CONSTRAINT page_cover_fkey FOREIGN KEY (cover_id) REFERENCES public.image(id) ON DELETE SET NULL
) INHERITS (public.content);
ALTER TABLE public.page ALTER COLUMN kind SET DEFAULT 'page';
CREATE INDEX page_published ON public.page (published_at DESC, id) WHERE status = 'published';
ALTER TABLE public.page ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.page TO anonymous;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.page TO superadmin;
CREATE POLICY page_public ON public.page FOR SELECT TO anonymous
  USING (status = 'published' AND published_at <= now());
CREATE POLICY page_editor ON public.page TO superadmin USING (true) WITH CHECK (true);

INSERT INTO public.page (title, slug, excerpt, markdown, status, published_at)
VALUES ('关于北极手记', 'about', '这里是一个放慢节奏、认真记录的地方。', $about$
很高兴能在这里与你相遇。

> 写下此刻，留给以后。

## 文字

文章用来整理相对完整的思考；手记留下日常里值得回看的片刻。它们按时间生长，也可以从标签和时间线重新找到。

## 相遇

谢谢你来到这里。愿这些文字在某个时刻，与你有一次安静的相遇。

[读文章](/articles) · [看手记](/notes) · [沿时间线](/timeline)
$about$, 'published', now()),
('隐私政策', 'privacy', '北极小站（Hasbai）的信息收集、使用与保护。', $privacy$
更新及生效日期：2026年10月4日

## 适用范围

本政策适用于个人维护的北极小站（Hasbai）、北极手记及使用北极小站统一登录的应用。不同应用只处理其功能所需的信息，访问权限由站点管理员分配。公开博客可直接浏览，无需 Google 账号或登录。

## 我们处理的信息

- **登录信息**：使用统一登录时，身份服务处理账号标识、邮箱，以及身份提供方返回的名称、头像和邮箱验证状态。若你选择 Google 登录，仅使用 `openid`、`email`、`profile` 范围完成身份认证，不请求 Gmail 邮件、通讯录、日历或 Google Drive 文件权限，也不会取得你的 Google 密码。
- **你提交的内容**：应用处理你主动保存的文字、图片、财务记录、角色与对话等数据，具体取决于你使用的功能。公开发布的博客文字和图片可被任何人访问；请勿在公开内容中上传个人敏感信息。
- **运行与安全信息**：托管和身份服务可能处理 IP 地址、浏览器信息、请求时间、登录及错误日志，用于交付页面、防止滥用和排查故障。

## 信息如何使用

信息用于登录、确认访问权限、保存你提交的内容、提供对应应用功能及维护服务安全。Google 提供的身份信息用于身份认证、权限管理及必要的服务运行记录，不用于广告画像，不出售，也不用于训练通用 AI 模型。

如果你主动使用酒馆等 AI 对话功能，生成回复所需的对话和角色内容会经 AI Gateway 发送给对应模型服务。AI Gateway 会保存完整请求与回复，以及应用、任务和经验证的账号名称，用于服务运行记录与故障排查。这些请求不调用 Google 邮件或云盘 API；请避免在对话中提交无需处理的个人敏感信息。

## 服务提供方与共享

站点使用 Auth0 提供统一身份认证，使用 Cloudflare 提供网站托管、网络安全、存储及 AI Gateway，使用 Neon 提供部分应用的数据存储和公开内容访问。选择 Google 登录时，Google 作为身份提供方处理授权。数据可能由这些服务在其运行所在地区处理。

除提供服务所需的处理、你明确要求的共享，或履行适用法律义务外，我们不会将你的非公开信息提供给其他主体。站点管理员为维护服务可能访问必要的数据；对话和网关请求记录同样不属于端到端加密通信。

## 浏览器存储与会话

统一登录服务可能使用必要的 Cookie 和会话机制。应用访问令牌由浏览器身份 SDK 在内存中管理；站点也会在本地保存主题等界面偏好。公开博客访问使用短期匿名令牌，不建立 Google 登录账号。你可在浏览器中清除站点存储，清除后可能需要重新登录或设置偏好。

## 保存期限与保护

你保存的内容通常保留至你通过应用删除，或管理员按你的请求处理。停止使用、退出登录或撤销第三方授权不会自动删除已保存的数据。必要的安全日志和备份可能在服务提供方的保留周期内继续存在，随后清理。站点通过 HTTPS、身份验证及按应用授予权限保护数据，并限制公开访问；任何网络服务都无法保证绝对安全。

## 你的选择与权利

你可退出登录，并在 [Google 账号的第三方连接管理](https://myaccount.google.com/connections) 中撤销授权。撤销授权不会自动删除已保存到站点的数据。你可通过应用已有的编辑、删除功能管理内容，或联系管理员请求查询、更正、导出、删除个人信息或关闭账号。我们会核实身份，并在合理期限内处理；法律要求保留的信息或尚在保留周期的备份除外。

## 政策更新与联系

政策变化将在本页更新日期和内容。对隐私或个人信息处理有疑问，请联系 [jsclndnz@gmail.com](mailto:jsclndnz@gmail.com)。
$privacy$, 'published', now()),
('服务条款', 'terms', '北极小站（Hasbai）的服务使用约定。', $terms$
更新及生效日期：2026年10月4日

## 服务范围

北极小站（Hasbai）是个人维护的网站及应用集合，提供公开文字阅读和经授权使用的个人工具，包括北极手记、个人财务记录及角色对话等。使用相关服务时，请遵守本条款及 [隐私政策](/privacy)。

## 账号与访问

公开博客无需登录。需要登录的功能使用北极小站统一身份认证；Google 等第三方登录仅用于确认身份。登录成功不代表自动获得所有应用的访问权，受限功能需管理员授权。

请妥善保管账号，不共享登录凭据，不冒用其他人的身份，不绕过访问控制。第三方身份服务的使用还应遵守该提供方的相关条款。

## 使用规则

请依法使用服务，不上传侵权、违法或恶意内容，不传播恶意代码，不干扰网站运行，不未经授权收集、访问或披露他人信息。管理员可在发现滥用、账号风险或违反本条款时限制相关访问，必要时停止提供服务。

## 内容与权利

你应确保对提交的文字、图片和其他内容拥有合法权利，并对其真实性及发布行为负责。你保留自己的内容权利；为保存、展示、备份和执行你请求的功能，你允许站点及必要的服务提供方处理这些内容。选择公开发布的内容可由访客阅读和分享链接。

网站文章及其他作品的权利属于其作者或合法权利人。引用应注明来源；超出适用法律允许的使用范围时，请事先取得许可。

## 信息与工具的使用

博客文字反映作者发布时的个人记录和观点。财务工具用于管理用户自行录入的信息，相关内容不构成投资、法律或其他专业建议。AI 对话可能包含虚构、不准确或不适宜的信息；涉及现实决策时，请自行核实。请保留重要数据的独立备份。

## 可用性与责任

个人维护服务可能因升级、故障、第三方服务变化或停止维护而中断、调整或结束。我们会合理维护服务，但不承诺持续可用、完全无误或特定使用效果。本条款不排除适用法律规定不得排除的责任或用户权利。

外部网站和服务由其提供方负责，使用前请查阅对应的条款和隐私政策。

## 停止使用与数据处理

你可随时停止使用、退出登录或撤销第三方授权。需要关闭账号、导出或删除相关个人数据时，请联系管理员；数据处理方式见 [隐私政策](/privacy)。撤销 Google 授权不会自动删除站点已保存的数据。

## 更新与联系

服务或条款发生变化时，将在本页更新。若不同意更新内容，可停止使用相关服务。有账号、内容权利或服务问题，请联系 [jsclndnz@gmail.com](mailto:jsclndnz@gmail.com)。
$terms$, 'published', now());
NOTIFY pgrst, 'reload schema';
COMMIT;
