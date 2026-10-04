-- Apply the user-reviewed policy text; preserve page identity and other content.
BEGIN;
DO $migration$
DECLARE current_hash text;
BEGIN
  SELECT md5(markdown) INTO current_hash FROM public.page WHERE id='da66942f-77be-4acd-9448-019c2cdeee89' AND slug='privacy' FOR UPDATE;
  IF current_hash IS NULL OR current_hash NOT IN ('ab5895cb37b0efbab8c9e745cbc078ff','dd935b834c3fedc6d37ab6a65282e712') THEN
    RAISE EXCEPTION 'privacy changed since user review; do not overwrite';
  END IF;
  IF current_hash='ab5895cb37b0efbab8c9e745cbc078ff' THEN
    UPDATE public.page SET markdown=$policy$更新及生效日期：2026年10月4日

## 适用范围

本政策适用于北极小站（Hasbai，[hasbai.xyz](https://hasbai.xyz)）及使用北极小站统一登录的个人工具，包括博客写作、个人记账、节点管理和 AI 文字对话。公开博客可直接浏览，无需登录；受限功能由管理员分配访问权限。

## 我们处理的信息

- **登录信息**：使用统一登录时，身份服务处理账号标识、邮箱，以及身份提供方返回的名称、头像和邮箱验证状态。选择 Google 登录时，请求 email 和 profile 基本资料权限，接收 Google 账号标识、邮箱、名称、头像及邮箱验证状态，用于建立登录身份和确认访问权限。我们不会取得你的 Google 密码，应用不读取 Gmail 邮件、通讯录、日历或 Google Drive 文件。
- **你提交的内容**：应用处理你主动保存的文字、图片、财务记录、节点配置、角色和聊天对话等数据。公开发布的博客文字和图片可被任何人访问；请勿在公开内容中上传个人敏感信息。
- **运行与安全信息**：Web和身份服务可能处理 IP 地址、浏览器信息、请求时间、登录及错误日志，用于交付页面、防止滥用和排查故障。

## 信息如何使用

信息用于登录、确认访问权限、保存你提交的内容、提供对应应用功能及维护服务安全。Google 提供的身份信息用于身份认证、权限管理及必要的服务运行记录，不用于广告画像，不出售，也不用于训练通用 AI 模型。你主动保存的财务记录和聊天内容可能含有敏感信息，请仅提交实现功能所需的数据。Google 身份信息不用于广告、出售或训练通用 AI 模型，Google Workspace API 数据不用于开发、改进或训练非个性化 AI 或机器学习模型。

## Google 身份信息的存储与共享

Google 登录资料由 Auth0 处理并保存在身份账号资料中。应用在当前浏览器会话内处理身份资料和访问令牌，用账号标识、名称、邮箱及管理员分配的角色确认身份、显示账号和控制功能访问。访问令牌在身份 SDK 内存中管理，主题等界面偏好另存于浏览器本地。

Google 作为身份提供方处理登录授权，Auth0 提供身份认证。Cloudflare 在承载受限工具和运行日志时可能处理令牌中的账号标识、名称或邮箱；Neon Data API 处理令牌中的身份及权限字段以校验数据访问。不会为广告、数据交易或其他无关用途共享 Google 身份资料。

## 服务提供方与共享

站点使用 Auth0 提供统一身份认证，使用 Cloudflare 提供网站托管、网络安全、存储及 AI 功能，使用 Neon 提供数据存储和公开内容访问。选择 Google 登录时，Google 作为身份提供方处理授权。数据可能由这些服务在其运行所在地区处理。

除提供服务所需的处理、你明确要求的共享，或履行适用法律义务外，我们不会将你的非公开信息提供给其他主体。

## 浏览器存储与会话

统一登录服务可能使用必要的 Cookie 和会话机制，应用访问令牌由浏览器在本地管理，站点也会在本地保存主题等界面偏好。公开博客访问使用匿名令牌，不需要登录。你可在浏览器中清除站点存储，清除后可能需要重新登录或设置偏好。

## 保存期限与保护

你保存的内容通常保留至你通过应用删除，或管理员按你的请求处理。停止使用、退出登录或撤销第三方授权不会自动删除已保存的数据。Google 登录身份资料通常保留至账号关闭或删除请求完成；浏览器内的身份资料和令牌随会话结束、退出登录或页面关闭清除。应用保存的内容、AI 对话及运行日志按各自用途和服务提供方的保留周期处理。必要的安全日志和备份可能在服务提供方的保留周期内继续存在，随后清理。站点通过 HTTPS、身份验证及按应用授予权限保护数据，并限制公开访问；任何网络服务都无法保证绝对安全。

## 你的选择与权利

你可退出登录，并在 [Google 账号的第三方连接管理](https://myaccount.google.com/connections) 中撤销授权。撤销授权不会自动删除已保存到站点的数据。你可通过应用已有的编辑、删除功能管理内容，或联系管理员请求查询、更正、导出、删除个人信息或关闭账号，请求可指明 Google 登录资料、应用内容或 AI 对话及网关日志的范围。我们会核实身份，并在合理期限内处理及说明结果；适用法律要求保留的信息或尚在保留周期内的备份除外。

## 政策更新与联系

政策变化将在本页更新日期和内容。对隐私或个人信息处理有疑问，请联系 [jsclndnz@gmail.com](mailto:jsclndnz@gmail.com)。$policy$, updated_at=now() WHERE id='da66942f-77be-4acd-9448-019c2cdeee89' AND slug='privacy';
  END IF;
END;
$migration$;
COMMIT;
