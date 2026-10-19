# TODO / 未确认项

> 按任务要求：提示词没覆盖、或本机环境里没法验证的技术细节，一律按**最保守方案**实现，并在下面记一行。
> 每条都写清「为什么这么选」与「怎么补验」。

## T-01 真实会话正文的文件引用 DOM 没抓到（自动化）

- 现状：`filemenu-test` 的 Web GUI 能起来，客户端 bundle 也确认加载成功（`window.__DSH_BOOT__` 里有 `dsh-file-menu`、`window.__dshFileMenuGeneration` 有值）；但在无头 Edge 里点侧栏会话行没有触发导航（`location.href` 仍是 `/`），拿不到真实 transcript 的 `<a>`/`data-*` 形态。
- 保守选择：命中逻辑同时覆盖三种形态——`a[href]`、`data-file-path`/`data-file`/`data-path` 及其它 `data-*path*`、元素文本（单 token + 末段带扩展名）；不依赖任何 DSH 内部 class 名，也不 hack 内部状态。
- 补验方法：人工在真实会话里对三类节点各右键一次；若某类不弹菜单，把该节点的 `outerHTML` 存下来，按属性名补进 `lib/client.js` 的 `pathFromTarget()` 优先级链。

## T-02 英文文案

- 现状：第一版只交付中文，`lib/labels.js` 里 `en` 是注释占位；`pickLabels()` 拿不到对应语言时一律回退 `zh-CN`。
- 待补 en 文案 → 发布前。

## T-03 同源校验只认回环地址

- 现状：只接受 `Origin`/`Referer` 的 hostname 为 `127.0.0.1` / `localhost` / `::1`，或 `Sec-Fetch-Site: same-origin`；POST 缺 Origin 直接 403。
- 原因：任务只要求适配本机 Web GUI。若用 `@linxin666/dsh-remote-web-ui` 之类从局域网域名访问，请求会被 403。
- 保守选择：不放宽到任意 host（放宽等于对局域网任意页面开放本机文件打开能力）。
- 补验/扩展：真要支持远程访问时，把远端 host 做成 `config.allowedOrigins` 白名单，默认空。

## T-04 相对路径的基准目录（0.1.2 已修）

- 现状：优先从客户端 DSH `sessions` 服务读当前会话 `cwd`；读不到时退回宿主 `GET /file-menu/status` 的 `process.cwd()`。
- 风险：宿主 `process.cwd()` 不保证等于当前会话工作区；两者不一致时相对路径会解析错。
- 保守选择：两个来源都拿不到就**不猜**，菜单不出现；不弹对话框问用户。

## T-05 Windows「用默认应用打开」的实现

- 现状：`powershell.exe -NoProfile -NonInteractive -Command "Start-Process -FilePath $env:DSH_FILE_MENU_TARGET -ErrorAction Stop"`，路径经**环境变量**传入，命令串里没有任何路径拼接；`powershell.exe` 不存在时试 `pwsh.exe`，再不行退回 `explorer.exe <path>`（资源管理器打开，语义等价于双击但不算严格「默认应用」）。
- 原因：任务禁止 `cmd /c start` 拼字符串，也禁止 shell 拼接路径。
- 补验：在未装 Windows PowerShell 的精简系统上确认 `pwsh` 回退分支。

## T-06 「在资源管理器中显示」必须 `windowsVerbatimArguments: true` + 自己补引号

- 现状：`spawn('explorer.exe', ['/select,"' + target + '"'], { windowsVerbatimArguments: true })`。
- 原因：explorer 的 `/select,<path>` 是非标准解析；不关掉 Node 的参数转义，`/select,` 会被吃掉，资源管理器只打开默认目录（参考插件与 DSH 内置实现都踩过）。
- **0.1.1 补的坑**：verbatim 模式下 Node 连路径都不加引号。实测 `/select,C:\a b\c.md` 到达子进程时被拆成 6 段 argv（`/select,…\dsh`、`fm`、`space2\子`、`目录\c`、`d.md`），带空格的路径必然失效；改成自己补一对双引号后是 1 段。Windows 路径不可能含 `"`，无需再转义。
- 注意：这里是把整串 `/select,"<path>"` 作为**单个 argv** 传入，不是 shell 字符串拼接。

## T-07 相对路径识别规则的取舍

- 现状：相对引用必须是单 token（无空白）、不含中文标点、末段带扩展名（`AGENTS.md`、`a/b/c.ts` 可以；`docs/plan` 这类目录不行）。
- 原因：正文里普通英文句子、版本号、`foo/bar` 之类的散文不能被误判成文件。
- 代价：带空格的未加 `@`、且没做成链接的路径不会出菜单。

## T-08 菜单不抢焦点

- 现状：弹菜单时**不**调用 `focus()`，靠捕获阶段 `pointerdown` + `elementFromPoint` 判定点击了哪一项。
- 原因：抢焦点会触发宿主失焦/选区逻辑，也会让「点击外部关闭」误判。

## T-09 测试环境的 `file:` 依赖路径

- 现状：安装时把 tgz 复制到 `C:\Users\86137\AppData\Local\Temp\dsh-fm-pkg\`（纯 ASCII）再 `pnpm add`，所以 profile 的 `package.json` 里依赖是 `file:C:/Users/86137/AppData/Local/Temp/...`。
- 原因：pnpm 会把 `file:` 路径原样写进 `package.json`；路径含中文时在 PowerShell 传参链路上会被写坏成乱码（实测过一次）。
- 正式发布走 registry 后无此问题；本地长期试用建议把 tgz 放到纯 ASCII 目录（或 `node_modules` 旁的固定目录）。

## T-10 平台覆盖

- 现状：Windows 全量验证；`darwin`（`open`/`open -R`）与 `linux`（`xdg-open`）分支代码写了但未在真机跑过。

## T-11 安装路径：0.1.0 装不上，0.1.1 起声明 `dsh.bundle`

- 0.1.0 的现状：没有 `dsh.bundle`，`dsh plugin add` 会回滚 `package.json` / `pnpm-lock.yaml`，只能 `pnpm --dir <profile> add` + 手改 patch —— 用户从插件市场点安装会被拒（`not-a-bundle`）。
- 原因（DSH 官方原文）：「只管理组合包——没有组合包 patch 的依赖在安装前就被拒绝」「装入了没有组合包 patch 的包的运行，会把 `package.json` 与 `pnpm-lock.yaml` 恢复原样」。
- 0.1.1 的选择：声明 `dsh.bundle.patch = ./cordis.patch.yml`，回到标准插件模型；代价是「删一行即卸载」不再成立，卸载改走 `dsh plugin remove`（对用户更安全）。
- 补验：从本地 tgz 与（发布后）registry 各装一次，确认 patch 行由 DSH 自动写入、卸载后自动撤掉。

## T-12 跨工作区搜索（0.1.3 未覆盖）

0.1.3 的后缀搜索只在**当前活动会话的工作区**里做。若正文链接指向别的工作区（如 C:\\Users\\86137\\Desktop\\project-099-水务），仍会 404。后续可从 ~/.dsh/sessions/*/session-*/ 收集各工作区的 cwd 一起搜。
