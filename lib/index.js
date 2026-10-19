/**
 * dsh-file-menu 宿主半端（Node 侧）。
 *
 * 只做「定位 / 打开」两件事：
 *   GET  /file-menu/open           存活探测
 *   GET  /file-menu/status         平台 + 会话 cwd（客户端补全相对路径用）
 *   POST /file-menu/reveal         { path, base? } → 资源管理器/文件管理器定位并选中
 *   POST /file-menu/open-external  { path, base? } → 系统默认应用打开
 *
 * 硬边界：
 *   - 不读文件内容（没有 readFile / createReadStream），不列举目录，不执行任意命令；
 *   - 所有外部进程都用 spawn(exe, [args]) 数组传参，路径不经 shell 字符串拼接；
 *   - 任何失败都返回结构化 JSON + 4xx/5xx，绝不抛未捕获异常（会打挂宿主进程）。
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as zlib from 'node:zlib'

export const name = 'file-menu'
export const inject = ['webServer']

/** 与 package.json 的 version 保持一致（由 06-脚本与工具/脚本/check-labels.mjs 断言）。 */
const PACKAGE_VERSION = '0.1.9'

/**
 * 会话工作区（cwd）探测。
 *
 * 为什么需要：客户端上报 base 依赖 `sessions` 服务，在桌面版里可能拿不到，
 * 服务端 cwd 又是 profile 目录（不是工作区），相对路径就会一个也定位不到。
 * 这里直接读 DSH 自己的会话头（`~/.dsh/sessions/<工作区>/session-<id>/session.v4.jsonl(.zstd)`
 * 的第一行 JSON，含 cwd），取最新写入的那个会话——即当前活动会话。
 *
 * 边界：只读 DSH 自身的会话头文件，不读任何用户文件内容、不列举用户目录。
 */
const SESSION_ROOT = join(homedir(), '.dsh', 'sessions')
const SESSION_FILES = ['session.v4.jsonl.zstd', 'session.v4.jsonl', 'session.jsonl.zstd', 'session.jsonl']
const SESSION_CWD_TTL_MS = 2000
let sessionCwdCache = { at: 0, value: '' }

/** 解出会话头里的 cwd；任何异常都返回 ''（绝不外抛）。 */
function readSessionHeaderCwd(file) {
  try {
    const raw = readFileSync(file)
    const text = /\.zstd$/i.test(file) && typeof zlib.zstdDecompressSync === 'function'
      ? zlib.zstdDecompressSync(raw)
      : raw
    const line = String(text).split('\n', 1)[0]
    const header = JSON.parse(line)
    return header !== null && typeof header === 'object' && typeof header.cwd === 'string' ? header.cwd : ''
  } catch {
    return ''
  }
}

/** 最近写入的会话的 cwd（带 2s 缓存）。 */
function sessionCwd() {
  const now = Date.now()
  if (now - sessionCwdCache.at < SESSION_CWD_TTL_MS) return sessionCwdCache.value
  let value = ''
  let newest = null
  try {
    for (const workspace of readdirSync(SESSION_ROOT, { withFileTypes: true })) {
      if (workspace.isDirectory() === false) continue
      const workspaceDir = join(SESSION_ROOT, workspace.name)
      let sessions = []
      try {
        sessions = readdirSync(workspaceDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const session of sessions) {
        if (session.isDirectory() === false) continue
        for (const name of SESSION_FILES) {
          const file = join(workspaceDir, session.name, name)
          try {
            const stat = statSync(file)
            if (stat.size === 0) continue
            if (newest === null || stat.mtimeMs > newest.mtimeMs) newest = { file, mtimeMs: stat.mtimeMs }
          } catch {
            /* 该会话没有这种文件 */
          }
        }
      }
    }
    if (newest !== null) value = readSessionHeaderCwd(newest.file)
  } catch {
    value = ''
  }
  sessionCwdCache = { at: now, value }
  return value
}

/** 相对路径的兜底基准：活动会话 cwd → 进程 cwd。 */
function defaultBase() {
  const fromSession = sessionCwd()
  return fromSession === '' ? process.cwd() : fromSession
}

const MAX_PATH_LENGTH = 4096
const MAX_BODY_BYTES = 64 * 1024

const ROUTE_OPEN = '/file-menu/open'
const ROUTE_STATUS = '/file-menu/status'
const ROUTE_REVEAL = '/file-menu/reveal'
const ROUTE_OPEN_EXTERNAL = '/file-menu/open-external'
const ROUTE_LAST = '/file-menu/last'
const ROUTE_HANDLERS = '/file-menu/handlers'
const ROUTE_OPEN_WITH = '/file-menu/open-with'

/** 统一 JSON 响应。 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** 405 + Allow。 */
function sendMethodNotAllowed(res, allow) {
  res.setHeader('allow', allow)
  sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
}

/**
 * 同源校验（§5.2）：只接受本机回环来源。
 *   - GET/HEAD：浏览器同源 GET 不一定带 Origin，缺失时放行；
 *   - POST：浏览器一定带 Origin，缺失或非回环一律 403；
 *   - 若带 Sec-Fetch-Site: same-origin，视为同源（Electron 自定义协议场景的兜底）。
 * @returns {boolean}
 */
function isTrustedRequest(req) {
  const secFetchSite = req.headers['sec-fetch-site']
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') return true

  let origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '' || origin === 'null') {
    const referer = req.headers.referer
    origin = typeof referer === 'string' && referer !== '' ? referer : ''
  }
  // 无 Origin：非浏览器客户端（curl / 探针）。浏览器跨站 POST JSON 必过预检，
  // 而我们的 OPTIONS 不回 Access-Control-Allow-Origin，预检过不了，因此放行是安全的。
  if (origin === '') return true
  try {
    const url = new URL(origin)
    // 桌面版窗口是自定义协议 dsh-app://app/…，fetch 出去的 Origin 就是它。
    if (url.protocol === 'dsh-app:') return true
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.replace(/^\[|\]$/g, '')
    return host === '127.0.0.1' || host === 'localhost' || host === '::1'
  } catch {
    return false
  }
}

/** 读取 JSON body（上限 64 KiB）；非 JSON / 超限 / 解析失败一律返回 undefined。 */
function readJsonBody(req) {
  return new Promise((resolveBody) => {
    const chunks = []
    let size = 0
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolveBody(value)
    }
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        finish(undefined)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        finish(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        finish(undefined)
      }
    })
    req.on('error', () => finish(undefined))
  })
}

/** 剥掉 file:// 前缀并做 URL 解码。 */
function stripFileScheme(value) {
  if (!/^file:\/\//i.test(value)) return value
  let rest = value.slice('file://'.length)
  // file:///C:/a.txt → /C:/a.txt；file://server/share/a.txt 保留主机名
  try {
    rest = decodeURIComponent(rest)
  } catch {
    /* 保留原样 */
  }
  if (/^\/[A-Za-z]:[\\/]/.test(rest)) return rest.slice(1)
  if (/^\/[A-Za-z]:$/.test(rest)) return rest.slice(1)
  return rest.replace(/^\/\//, '\\\\')
}

/**
 * 把入参路径规范化成绝对路径（不校验存在性）。
 * 相对路径优先用调用方给的 base（客户端上报的会话工作区根），否则用进程 cwd。
 * @returns {{ ok: true, target: string } | { ok: false, error: string }}
 */
function normalizeTarget(rawPath, rawBase) {
  if (typeof rawPath !== 'string') return { ok: false, error: 'bad-request' }
  let value = rawPath.trim()
  if (value === '' || value.length >= MAX_PATH_LENGTH) return { ok: false, error: 'bad-request' }
  if (value.includes('\0') || /[\r\n]/.test(value)) return { ok: false, error: 'bad-request' }
  value = value.replace(/^[`'"]+/, '').replace(/[`'"]+$/, '').trim()
  if (value.startsWith('@')) value = value.slice(1).trim()
  if (value === '') return { ok: false, error: 'bad-request' }

  value = stripFileScheme(value)
  if (value === '') return { ok: false, error: 'bad-request' }

  let base = ''
  if (typeof rawBase === 'string') {
    const candidate = rawBase.trim()
    if (candidate !== '' && candidate.length < MAX_PATH_LENGTH && !/[\r\n]/.test(candidate)) {
      if (isAbsolute(candidate)) base = candidate
    }
  }

  if (value === '~') return { ok: true, target: homedir(), base: homedir(), relative: '' }
  if (/^~[\\/]/.test(value)) {
    const home = resolve(homedir(), value.slice(2))
    return { ok: true, target: home, base: homedir(), relative: value.slice(2) }
  }
  if (isAbsolute(value)) return { ok: true, target: resolve(value), base: dirname(resolve(value)), relative: '' }
  const anchor = base === '' ? defaultBase() : base
  return { ok: true, target: resolve(anchor, value), base: anchor, relative: value }
}

const SEARCH_SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.pnpm',
  '.cache',
  '.plugin-manager',
  '.qoder-runs',
  '.next',
  'coverage',
])
const SEARCH_MAX_ENTRIES = 20000
const SEARCH_MAX_DEPTH = 12
const SEARCH_MAX_HITS = 20
const SEARCH_TTL_MS = 10000
const searchCache = new Map()

/** 统一成 `/` 分隔、去掉开头的 `./`，用于后缀比较。 */
function toSlashes(value) {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * 在工作区里按「路径后缀」找文件。
 *
 * DSH 正文里的引用经常只写文件名（`AGENTS.md`），真正的文件却躺在子目录里，
 * 直接拼 base 必然 404。这里做一次有界的广度优先搜索：
 *   - 跳过 node_modules/.git/dist 等大目录与所有隐藏目录；
 *   - 最多 20000 个条目、12 层深，10 秒结果缓存；
 *   - 命中多个时取层级最浅的那个，并在响应里标记 ambiguous。
 * @returns {{ target: string, count: number, ambiguous: boolean } | undefined}
 */
function findInWorkspace(base, relative) {
  const suffix = toSlashes(relative).toLowerCase()
  if (suffix === '' || base === '') return undefined
  const cacheKey = base + '\u0000' + suffix
  const cached = searchCache.get(cacheKey)
  if (cached !== undefined && Date.now() - cached.at < SEARCH_TTL_MS) return cached.value

  let value
  let entries = 0
  let hits = 0
  let best = ''
  let bestStamp = -1
  const queue = [{ dir: base, depth: 0 }]
  while (queue.length > 0 && entries < SEARCH_MAX_ENTRIES && hits < SEARCH_MAX_HITS) {
    const current = queue.shift()
    if (current.depth > SEARCH_MAX_DEPTH) continue
    let children
    try {
      children = readdirSync(current.dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const child of children) {
      entries += 1
      if (entries > SEARCH_MAX_ENTRIES || hits >= SEARCH_MAX_HITS) break
      const full = join(current.dir, child.name)
      if (child.isDirectory()) {
        if (SEARCH_SKIP.has(child.name) || child.name.startsWith('.')) continue
        queue.push({ dir: full, depth: current.depth + 1 })
        continue
      }
      if (toSlashes(full).toLowerCase().endsWith('/' + suffix)) {
        hits += 1
        let stamp = 0
        try {
          stamp = statSync(full).mtimeMs
        } catch {
          stamp = 0
        }
        if (best === '' || stamp > bestStamp) {
          best = full
          bestStamp = stamp
        }
      }
    }
  }
  if (best !== '') value = { target: best, count: hits, ambiguous: hits > 1 }
  searchCache.set(cacheKey, { at: Date.now(), value })
  return value
}

/** 最近请求环形缓冲，供 /file-menu/last 自查（只存路径与结果，不存文件内容）。 */
const TRACE_LIMIT = 20
const traces = []

function pushTrace(entry) {
  traces.push(entry)
  if (traces.length > TRACE_LIMIT) traces.shift()
}

/** 启动一个分离进程；resolve 于 spawn 成功（不等退出码）。 */
/**
 * 启动外部程序时的环境变量：必须摘掉 ELECTRON_RUN_AS_NODE。
 * DSH 自己是 Electron 应用，启动时带了这个变量；子进程会继承，于是 MarkText /
 * VS Code / Cursor 这类 Electron 程序会被当成 node 运行，立刻退出、没有窗口。
 */
function childEnv() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_OPTIONS
  delete env.ELECTRON_NO_ATTACH_CONSOLE
  return env
}

function spawnDetached(command, args, extra) {
  return new Promise((resolveSpawn, rejectSpawn) => {
    let child
    try {
      child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: childEnv(),
        ...extra,
      })
    } catch (error) {
      rejectSpawn(error)
      return
    }
    child.once('error', rejectSpawn)
    child.once('spawn', () => {
      try {
        child.unref()
      } catch {
        /* 忽略 */
      }
      resolveSpawn()
    })
  })
}

/** 启动并等待退出码（用于需要确认成功的 powershell 调用）。 */
function spawnAndWait(command, args, extra, timeoutMs) {
  return new Promise((resolveRun, rejectRun) => {
    let child
    try {
      child = spawn(command, args, { stdio: 'ignore', windowsHide: true, ...extra })
    } catch (error) {
      rejectRun(error)
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill()
      } catch {
        /* 忽略 */
      }
      rejectRun(new Error('timeout'))
    }, timeoutMs)
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectRun(error)
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) resolveRun()
      else rejectRun(new Error(`exit ${String(code)}`))
    })
  })
}

/** 在系统文件管理器中定位并选中。 */
const FOCUS_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'reveal-focus.ps1')

/** 调 reveal-focus.ps1：把「已打开且选中 $target」的资源管理器窗口拉到前台。 */
function focusExplorerWindow(target, waitMs) {
  return spawnAndWait(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', FOCUS_SCRIPT, '-Target', target, '-TimeoutMs', String(waitMs)],
    {},
    waitMs + 5000,
  )
}

/** 在系统文件管理器中定位并选中。 */
async function revealTarget(target, isDirectory) {
  if (process.platform === 'win32') {
    // 已经有一个窗口正好选中这个文件 → 直接把它拉到前台，不再开新窗口。
    try {
      await focusExplorerWindow(target, 600)
      return
    } catch {
      /* 没有可用窗口，继续开新的 */
    }
    // windowsVerbatimArguments 必须为 true：Node 默认给参数加引号转义，
    // explorer 的非标准解析会把 `/select,<path>` 当成目录直接打开。
    // 但 verbatim 也意味着 Node 不给路径加引号——含空格的路径会被拆成多个 argv
    // （实测 `/select,C:\a b\c.md` 到达 explorer 时变成 6 段），所以这里自己补引号。
    // Windows 路径不可能包含双引号，因此不需要再转义。
    await spawnDetached('explorer.exe', isDirectory ? [target] : [`/select,"${target}"`], { windowsVerbatimArguments: true })
    // 关键：explorer 由非前台进程拉起时窗口开在后台，必须主动激活，
    // 否则用户看到的就是「点了没反应」。失败不影响定位本身。
    try {
      await focusExplorerWindow(target, 4000)
    } catch {
      /* 激活失败不回报错误：窗口至少已经打开 */
    }
    return
  }
  if (process.platform === 'darwin') {
    if (isDirectory) await spawnDetached('open', [target])
    else await spawnDetached('open', ['-R', target])
    return
  }
  await spawnDetached('xdg-open', [isDirectory ? target : dirname(target)])
}

/** 用系统默认应用打开（Windows 走 PowerShell Start-Process，路径经环境变量参数化传入）。 */
async function openTarget(target) {
  if (process.platform === 'win32') {
    const script = 'Start-Process -FilePath $env:DSH_FILE_MENU_TARGET -ErrorAction Stop'
    let lastError
    for (const exe of ['powershell.exe', 'pwsh.exe']) {
      try {
        await spawnAndWait(exe, ['-NoProfile', '-NonInteractive', '-Command', script], {
          env: { ...process.env, DSH_FILE_MENU_TARGET: target },
        }, 20000)
        return
      } catch (error) {
        lastError = error
      }
    }
    try {
      await spawnDetached('explorer.exe', [target])
      return
    } catch {
      throw lastError instanceof Error ? lastError : new Error('launch-failed')
    }
  }
  if (process.platform === 'darwin') {
    await spawnDetached('open', [target])
    return
  }
  await spawnDetached('xdg-open', [target])
}

/** 校验存在性并解析出真实路径；直接找不到时在工作区里按后缀再找一次。 */
function resolveExisting(body) {
  const payload = body !== null && typeof body === 'object' ? body : {}
  const normalized = normalizeTarget(payload.path, payload.base)
  if (normalized.ok === false) return { ok: false, status: 400, error: normalized.error }
  let target = normalized.target
  let matched = 0
  if (existsSync(target) === false && normalized.relative !== '') {
    const found = findInWorkspace(normalized.base, normalized.relative)
    if (found !== undefined) {
      target = found.target
      matched = found.count
    }
  }
  if (!existsSync(target)) {
    return { ok: false, status: 404, error: 'not-found', attempted: target, base: normalized.base }
  }
  let real
  try {
    real = realpathSync.native(target)
  } catch {
    try {
      real = realpathSync(target)
    } catch {
      return { ok: false, status: 404, error: 'not-found', attempted: target, base: normalized.base }
    }
  }
  let isDirectory = false
  try {
    isDirectory = statSync(real).isDirectory()
  } catch {
    return { ok: false, status: 404, error: 'not-found', attempted: target, base: normalized.base }
  }
  return { ok: true, target: real, isDirectory, matched, base: normalized.base }
}

const LIST_HANDLERS_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'list-handlers.ps1')
const HANDLER_TTL_MS = 300000
const handlerCache = new Map()

/** 取扩展名（小写，含点）；取不到返回 ''。 */
function extOfPath(value) {
  const match = /(\.[A-Za-z0-9]{1,12})$/.exec(String(value).trim())
  return match === null ? '' : match[1].toLowerCase()
}

/** 跑一个 powershell 脚本并收集 stdout；超时/失败一律 reject。 */
function runPowerShellCapture(args, timeoutMs) {
  return new Promise((resolveRun, rejectRun) => {
    let child
    try {
      child = spawn('powershell.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    } catch (error) {
      rejectRun(error)
      return
    }
    let out = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill()
      } catch {
        /* 忽略 */
      }
      rejectRun(new Error('timeout'))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8')
      if (out.length > 256 * 1024) {
        try {
          child.kill()
        } catch {
          /* 忽略 */
        }
      }
    })
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectRun(error)
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) resolveRun(out)
      else rejectRun(new Error(`exit ${String(code)}`))
    })
  })
}

/** 某个扩展名的可用打开方式（带 5 分钟缓存）。 */
async function listHandlers(ext) {
  const cached = handlerCache.get(ext)
  if (cached !== undefined && Date.now() - cached.at < HANDLER_TTL_MS) return cached.list
  const output = await runPowerShellCapture(
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', LIST_HANDLERS_SCRIPT, '-Extension', ext],
    10000,
  )
  const parsed = JSON.parse(output.trim() === '' ? '{}' : output.trim())
  const list = Array.isArray(parsed.handlers) ? parsed.handlers : []
  handlerCache.set(ext, { at: Date.now(), list })
  return list
}

/** 把注册表里的命令模板（含 %1）变成参数数组；引号会被剥掉。 */
function argsFromTemplate(template, target) {
  const value = template === null || template === undefined ? '' : String(template).trim()
  if (value === '') return [target]
  const tokens = []
  let current = ''
  let quoted = false
  for (const ch of value) {
    if (ch === '"') {
      quoted = !quoted
      continue
    }
    if (ch === ' ' && quoted === false) {
      if (current !== '') {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (current !== '') tokens.push(current)
  const args = []
  let replaced = false
  for (const token of tokens) {
    if (token.indexOf('%1') !== -1) {
      args.push(token.replace(/%1/g, target))
      replaced = true
      continue
    }
    if (/^%[0-9a-zA-Z*]$/.test(token)) continue
    args.push(token)
  }
  if (replaced === false) args.push(target)
  return args
}

/** 用指定程序打开（只接受本机注册表里该扩展名的可用处理器）。 */
async function openWith(target, exe) {
  const wanted = String(exe).toLowerCase()
  const handlers = await listHandlers(extOfPath(target))
  const hit = handlers.find((entry) => entry.available === true && String(entry.exe).toLowerCase() === wanted)
  if (hit === undefined) throw new Error('unknown-handler')
  await spawnDetached(hit.exe, argsFromTemplate(hit.args, target))
}
/** GET 处理器。 */
function handleGet(route, req, res) {
  if (route === ROUTE_OPEN) {
    sendJson(res, 200, { ok: true, schemaVersion: 1, version: PACKAGE_VERSION })
    return
  }
  if (route === ROUTE_LAST) {
    sendJson(res, 200, { ok: true, traces, version: PACKAGE_VERSION })
    return
  }
  // ROUTE_STATUS
  sendJson(res, 200, { ok: true, platform: process.platform, cwd: defaultBase(), version: PACKAGE_VERSION })
}

/** POST 处理器（两个动作：reveal / open-external）。 */
async function handlePost(route, req, res) {
  const contentType = String(req.headers['content-type'] ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()
  if (contentType !== 'application/json') {
    pushTrace({ at: Date.now(), route, status: 415, error: 'unsupported-media-type', contentType })
    sendJson(res, 415, { ok: false, error: 'unsupported-media-type' })
    return
  }
  const body = await readJsonBody(req)
  if (body === undefined) {
    sendJson(res, 400, { ok: false, error: 'bad-request' })
    return
  }
  if (route === ROUTE_HANDLERS) {
    const rawForExt = body !== null && typeof body === 'object' ? body.path : undefined
    const ext = extOfPath(rawForExt === undefined ? '' : rawForExt)
    if (ext === '') {
      sendJson(res, 400, { ok: false, error: 'no-extension' })
      return
    }
    try {
      const handlers = await listHandlers(ext)
      pushTrace({ at: Date.now(), route, path: rawForExt, status: 200, count: handlers.length })
      sendJson(res, 200, { ok: true, ext, handlers })
    } catch (error) {
      sendJson(res, 500, { ok: false, error: 'handler-list-failed', detail: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  const resolved = resolveExisting(body)
  const rawPath = body !== null && typeof body === 'object' ? body.path : undefined
  const rawBase = body !== null && typeof body === 'object' ? body.base : undefined
  if (resolved.ok === false) {
    pushTrace({
      at: Date.now(),
      route,
      path: rawPath,
      base: rawBase,
      status: resolved.status,
      error: resolved.error,
      origin: req.headers.origin,
      site: req.headers['sec-fetch-site'],
      attempted: resolved.attempted,
      searchBase: resolved.base,
    })
    sendJson(res, resolved.status, {
      ok: false,
      error: resolved.error,
      attempted: resolved.attempted,
      base: resolved.base,
    })
    return
  }
  try {
    if (route === ROUTE_OPEN_WITH) {
      await openWith(resolved.target, body !== null && typeof body === 'object' ? body.exe : '')
      pushTrace({ at: Date.now(), route, path: rawPath, base: rawBase, status: 200, resolved: resolved.target })
      sendJson(res, 200, { ok: true, resolved: resolved.target })
      return
    }
    if (route === ROUTE_REVEAL) {
      await revealTarget(resolved.target, resolved.isDirectory)
      pushTrace({ at: Date.now(), route, path: rawPath, base: rawBase, status: 200, origin: req.headers.origin, resolved: resolved.target, matched: resolved.matched })
      sendJson(res, 200, { ok: true, resolved: resolved.target, matched: resolved.matched, base: resolved.base })
      return
    }
    await openTarget(resolved.target)
    pushTrace({ at: Date.now(), route, path: rawPath, base: rawBase, status: 200, origin: req.headers.origin, resolved: resolved.target, matched: resolved.matched })
    sendJson(res, 200, { ok: true, resolved: resolved.target, matched: resolved.matched })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const unknown = detail === 'unknown-handler'
    sendJson(res, unknown ? 400 : 500, {
      ok: false,
      error: unknown ? 'unknown-handler' : 'launch-failed',
      detail,
    })
  }
}

/** 单条路由的分发（方法 + 同源 + 动作）。 */
function makeHandler(route, allow) {
  return async (req, res) => {
    const meta = {
      method: req.method,
      origin: req.headers.origin,
      referer: req.headers.referer,
      site: req.headers['sec-fetch-site'],
    }
    try {
      if (!isTrustedRequest(req)) {
        pushTrace({ at: Date.now(), route, status: 403, error: 'forbidden', ...meta })
        sendJson(res, 403, { ok: false, error: 'forbidden' })
        return
      }
      if (req.method === 'OPTIONS') {
        res.setHeader('allow', allow)
        res.writeHead(204)
        res.end()
        return
      }
      if (route === ROUTE_OPEN || route === ROUTE_STATUS || route === ROUTE_LAST) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          sendMethodNotAllowed(res, 'GET, HEAD')
          return
        }
        handleGet(route, req, res)
        return
      }
      if (req.method !== 'POST') {
        sendMethodNotAllowed(res, 'POST')
        return
      }
      await handlePost(route, req, res)
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: 'internal', detail: error instanceof Error ? error.message : String(error) })
      } else {
        try {
          res.end()
        } catch {
          /* 忽略 */
        }
      }
    }
  }
}

export function apply(ctx) {
  ctx.effect(() => {
    const disposers = [
      ctx.webServer.register({ kind: 'exact', path: ROUTE_OPEN, handler: makeHandler(ROUTE_OPEN, 'GET, HEAD') }),
      ctx.webServer.register({ kind: 'exact', path: ROUTE_STATUS, handler: makeHandler(ROUTE_STATUS, 'GET, HEAD') }),
      ctx.webServer.register({ kind: 'exact', path: ROUTE_REVEAL, handler: makeHandler(ROUTE_REVEAL, 'POST') }),
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE_OPEN_EXTERNAL,
        handler: makeHandler(ROUTE_OPEN_EXTERNAL, 'POST'),
      }),
      ctx.webServer.register({ kind: 'exact', path: ROUTE_LAST, handler: makeHandler(ROUTE_LAST, 'GET, HEAD') }),
      ctx.webServer.register({ kind: 'exact', path: ROUTE_HANDLERS, handler: makeHandler(ROUTE_HANDLERS, 'POST') }),
      ctx.webServer.register({ kind: 'exact', path: ROUTE_OPEN_WITH, handler: makeHandler(ROUTE_OPEN_WITH, 'POST') }),
    ]
    return () => {
      for (const dispose of disposers) {
        try {
          if (typeof dispose === 'function') dispose()
        } catch {
          /* 卸载时不抛 */
        }
      }
    }
  }, 'file-menu: routes')
}
