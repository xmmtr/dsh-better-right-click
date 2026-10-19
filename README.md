# Better Right-Click（`dsh-better-right-click`）

[English](#english) | [简体中文](#简体中文)

DSH（DeepSeek Harness）Web 会话正文里，对**文件引用**点右键，弹出三项菜单：

| 菜单项 | 行为 |
| --- | --- |
| 复制绝对路径 | 把规范化后的绝对路径写入剪贴板 |
| 在资源管理器中显示 | Windows：`explorer.exe /select,<path>`（打开并**选中**该文件）；macOS：`open -R`；Linux：`xdg-open` 父目录 |
| 用默认应用打开 | Windows：PowerShell `Start-Process -FilePath`（路径经环境变量参数化）；macOS：`open`；Linux：`xdg-open` |

覆盖三类节点：正文 Markdown 链接（蓝色文件名）、`@文件` 引用、工具行里的文件卡片。
右键正文空白 / 输入框 / 代码块 / 按钮 → **不拦截**，原生菜单照常出现。

适配版本：**DSH 0.2.1-rc.2**（`engines.dsh`：`>=0.2.1-rc.2 <0.3.0`）。
当前完整支持 **Windows**；macOS / Linux 走同一套分支，未在真机验证。

## 安装（标准方式：`dsh plugin add`）

本包声明了 `dsh.bundle`（`bundle.patch = ./cordis.patch.yml`），因此它就是一个标准的「组合包 patch 型」插件：由 DSH 插件管理器安装与卸载，安装时只向 profile 追加一行 `file-menu`，不改动既有行。

> 为什么必须声明：DSH 插件管理器「只管理组合包」——没有组合包 patch 声明的依赖在安装前就会被拒绝，且装进去的运行会被回滚（`package.json` / `pnpm-lock.yaml` 恢复原样）。

```powershell
# 从 npm 安装（推荐）
& 'D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd' plugin --profile <profile> add dsh-better-right-click

# 或从本地 tgz 安装
& 'D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd' plugin --profile <profile> add "C:\path\to\dsh-better-right-click-0.2.0.tgz"

# 或在 DSH Web「插件」页里粘贴 dsh-better-right-click
```

也可以在 DSH Web 的「插件」页里搜索 / 粘贴 git、tarball 或本地目录说明安装。

卸载：`dsh plugin --profile <profile> remove dsh-better-right-click` → 重启；`file-menu` 那一行随包一起撤掉。

## 截图

> 截图随仓库托管（`docs/`），图片用绝对地址引用，npm 页面也能显示。

右键正文里的文件引用（浅色主题，独立测试 profile `filemenu-test`；图为 0.1.0 的三项菜单，0.1.6 起下方还多出「用 X 打开」分组）：

![右键文件引用弹出的菜单](https://raw.githubusercontent.com/xmmtr/dsh-better-right-click/main/docs/01-menu-open.png)

三类节点（Markdown 链接 / `data-file-path` 文件卡片 / `@文件` 引用）都会命中：

![文件卡片与 @ 引用](https://raw.githubusercontent.com/xmmtr/dsh-better-right-click/main/docs/03-card-mention.png)

## 已验证

- DSH `0.2.1-rc.2`（Windows 10.0.19045，Web GUI `http://127.0.0.1:3080`，独立 profile `filemenu-test`）。
- 安装：`dsh plugin --profile <profile> add <tgz>`（0.1.1 起可走标准安装；`dsh.bundle.patch` 指向本包的 `cordis.patch.yml`），`--dump-config` 合成结果含 `- id: file-menu / name: dsh-file-menu`。
- 宿主路由：无 token 也能命中（同源白名单靠 Origin）；`GET /file-menu/open` → `{ok:true,schemaVersion:1,version:"0.1.2"}`；`GET /file-menu/status` → `cwd` 为**活动会话工作区**（读 `~/.dsh/sessions` 会话头；取不到才退回进程 cwd）。
- 资源管理器定位：0.1.1 修掉「路径含空格时 `/select` 被拆成多个参数」的缺陷（现在自己给路径补双引号）。
- 0.1.2：相对路径基准改读活动会话工作区（此前是 profile 目录，导致相对路径全 404）；失败改为底部提示条，不再静默；菜单背景改为不透明。
- 0.1.7：修两处「打开了却什么都没有」——子进程继承 `ELECTRON_RUN_AS_NODE=1` 导致 Electron 应用静默退出（spawn 前剔除该变量），以及 PowerShell 中文标签乱码（stdout 强制 UTF-8）；菜单加载期显示「正在读取可用程序…」占位，不再先闪「用默认应用打开」。
- 0.1.6：右键菜单列出本机注册的所有能打开该扩展名的程序（默认 ProgID / OpenWithProgids / OpenWithList 按 MRUList 排序），失效项自动跳过，点谁用谁打开；宿主新增 `POST /file-menu/handlers` 与 `POST /file-menu/open-with`（只接受枚举结果里的 exe）。
- 0.1.3：直接拼 base 找不到时，在工作区里按路径后缀做有界搜索（跳过 node_modules/.git/隐藏目录，20k 条目、12 层上限、10s 缓存），同名多个时取**最近修改**的那个；404 回包带 `attempted` 与 `base`，客户端提示里直接显示尝试过的绝对路径；新增 `GET /file-menu/last` 供自查最近 20 次请求。
- 0.1.9：菜单与提示文案跟随 DSH 界面语言（`ctx.locale` → `<html lang>` → `navigator.language`），中文/英文自动切换，未识别语言回退英文。
- 0.2.0：改名 **Better Right-Click**，npm 包名/仓库/客户端模块 id 全部改为 `dsh-better-right-click`（旧名 `@xmmtr/dsh-file-menu` 已弃用，功能相同）。
- 错误路径：缺文件 → `404 {"ok":false,"error":"not-found"}`；`Content-Type` 非 JSON → `415`；外部 Origin → `403`；`GET /file-menu/reveal` → `405`。
- 客户端（Edge headless + CDP，真实页面、真实 bundle）：菜单三项文案正确、复制得到 `C:\Users\86137\Desktop\workme\AGENTS.md`、`Esc`/点击外部关闭、正文空白与输入框不拦截。
- 卸载：`pnpm remove` + patch 还原 → 路由 404、`__DSH_BOOT__.entries` 从 70 降回 69、GUI 正常启动。

## 已知限制

- **真实会话正文里的文件引用未做自动化抓取**：无头浏览器里点侧栏会话行没有导航成功，所以「正文里实际渲染出的节点形态」是人工待验项；已用注入同形态节点（`<a href="AGENTS.md">`、`data-file-path` 卡片、`@AGENTS.md` 文本）在真实页面上验证。见 `TODO.md` T-01。
- **只对真正的文件引用生效**：正文里以普通文字出现的相对路径，必须是单个 token（不含空白）、含路径分隔符、末段带扩展名，才会被识别；带空格的文件名（未加 `@` / 未做成链接）不会被识别。
- 相对路径依赖会话工作区根（客户端从 DSH `sessions` 服务读，拿不到时退回宿主 `GET /file-menu/status` 的 `cwd`）；两者都拿不到时不猜，菜单不出现。
- 代码块（`pre`）、输入区、`contenteditable` 内部一律不拦截。
- Shadow DOM / canvas 渲染的文件引用不支持（按 `<a>`、`data-*` 与文本识别）。
- 只做定位与打开：**不读文件内容、不列举目录、不执行任意命令**。
- 宿主端 POST 路由要求同源（`Origin`/`Referer` 为本机回环，或 `Sec-Fetch-Site: same-origin`），其他来源 403。
- 中文菜单文案在 `lib/labels.js` 的 `LABELS`，英文待补（`TODO.md`）。

## 原理

- `lib/index.js`（宿主）：`ctx.webServer.register()` 注册 4 条精确路由 `/file-menu/{open,status,reveal,open-external}`，`spawn(exe, [args])` 数组传参，零运行时依赖。
- `lib/client.js`（浏览器）：classic-script bundle（`window.__ModuleLoader__.load`），捕获阶段 `contextmenu` 委托 + 纯 DOM 浮层；`exports.apply(ctx)` 安装、`exports.dispose` 卸载。
- `cordis.patch.yml`：只追加宿主条目；客户端半端由 DSH 识别 `dsh.client` 声明后自动下发。

## English

DSH web plugin adding a three-item right-click menu (**Copy absolute path** / **Reveal in Explorer** / **Open with default app**) for file references in the conversation transcript: markdown file links, `@file` mentions and tool-row file cards. Right-clicking blank text, inputs, code blocks or buttons keeps the native menu.

- Target build: DSH `0.2.1-rc.2` (`>=0.2.1-rc.2 <0.3.0`), fully verified on Windows only.
- Install: `dsh plugin --profile <profile> add <name-or-tgz>` (the package declares `dsh.bundle.patch` = its `cordis.patch.yml`, so the plugin manager installs and removes it like any other bundle), restart DSH.
- Host routes: `GET /file-menu/open`, `GET /file-menu/status`, `POST /file-menu/reveal`, `POST /file-menu/open-external`. Same-origin (loopback) only, JSON errors, no file content read, no shell string concatenation.
- Client: classic-script bundle, capture-phase `contextmenu`, DOM overlay following DSH theme variables, `Esc`/outside click/scroll/blur close it, clean dispose.
- Menu labels live in `lib/labels.js` (`LABELS` / `pickLabels()`), kept in both `zh` and `en`; the active language follows the DSH locale, then `<html lang>`, then `navigator.language`, and falls back to English.

MIT.
