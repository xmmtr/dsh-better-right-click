/**
 * dsh-file-menu client half (browser). Classic-script bundle: DSH loads it via
 * `window.__ModuleLoader__.load({ id, factory })` and calls `exports.apply(ctx)`.
 *
 * Scope: exactly one feature — a three-item context menu for file references in
 * the conversation transcript (markdown links, `@file` mentions, tool-line file
 * cards). Everywhere else (blank text, inputs, code blocks, buttons) the native
 * menu is left untouched.
 */
window.__ModuleLoader__.load({
  id: '@xmmtr/dsh-file-menu',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    // ---------------------------------------------------------------------
    // Labels: inline mirror of lib/labels.js (single authoritative copy).
    // A classic-script bundle cannot `import` ESM, so the dictionary is kept
    // byte-identical here and asserted by 06-脚本与工具/脚本/check-labels.mjs.
    // ---------------------------------------------------------------------
    var LABELS = {
      zh: {
        copyAbsPath: '复制绝对路径',
        revealInExplorer: '在资源管理器中显示',
        openWithDefault: '用默认应用打开',
        notFound: '找不到这个文件（路径可能不在当前工作区下）',
        failed: '操作失败，未能定位或打开',
        multiple: '同名文件有多个，已定位最近修改的那个',
        openWith: '用 {name} 打开',
        noHandler: '没有找到可用的打开方式',
        loading: '正在读取可用程序…',
      },
      en: {
        copyAbsPath: 'Copy absolute path',
        revealInExplorer: 'Reveal in Explorer',
        openWithDefault: 'Open with default app',
        notFound: 'File not found (it may live outside the current workspace)',
        failed: 'Action failed: could not locate or open it',
        multiple: 'Several files share that name; using the most recently modified one',
        openWith: 'Open with {name}',
        noHandler: 'No installed app can open this file',
        loading: 'Reading available apps…',
      },
    }

    function languageKey(value) {
      var lower = String(value === undefined || value === null ? '' : value).toLowerCase()
      if (lower === '') return ''
      if (lower.indexOf('zh') === 0) return 'zh'
      if (lower.indexOf('en') === 0) return 'en'
      return ''
    }

    /**
     * The language DSH is currently displaying. The locale service wins; the
     * document element is the fallback the locale service itself keeps in sync;
     * navigator.language is the last resort before English.
     */
    function dshLocale() {
      try {
        if (pluginCtx !== null && typeof pluginCtx.get === 'function') {
          var locale = pluginCtx.get('locale')
          if (locale !== undefined && locale !== null && typeof locale.getSnapshot === 'function') {
            var snapshot = locale.getSnapshot()
            if (snapshot !== undefined && snapshot !== null && typeof snapshot.active === 'string' && snapshot.active !== '') {
              return snapshot.active
            }
          }
        }
      } catch (error) {
        /* fall through */
      }
      try {
        if (typeof document !== 'undefined' && document.documentElement !== null && typeof document.documentElement.lang === 'string') {
          if (document.documentElement.lang !== '') return document.documentElement.lang
        }
      } catch (error) {
        /* fall through */
      }
      return ''
    }

    function pickLabels(lang) {
      var value = ''
      try {
        if (typeof lang === 'string' && lang !== '') value = lang
        else if (typeof navigator === 'undefined') value = ''
        else value = String(navigator.language || '')
      } catch (error) {
        value = ''
      }
      var key = languageKey(value)
      if (key !== '' && Object.prototype.hasOwnProperty.call(LABELS, key)) return LABELS[key]
      return LABELS.en
    }

    // ---------------------------------------------------------------------
    // Constants / state
    // ---------------------------------------------------------------------
    var MENU_ID = 'dsh-file-menu-root'
    var HINT_ID = 'dsh-file-menu-hint'
    var STYLE_ID = 'dsh-file-menu-style'
    var ITEM_CLASS = 'dsh-fm-item'
    var LISTENERS_KEY = '__dshFileMenuListeners'
    var GENERATION_KEY = '__dshFileMenuGeneration'
    var MAX_DEPTH = 20
    var CLIENT_VERSION = '0.1.9'

    var GENERATION = 0
    var pluginCtx = null
    var sessionCwd = ''
    var menuEl = null
    var menuRect = null
    var menuItems = []
    var currentTarget = null

    var FONT = '13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'

    var CSS = [
      '#' + MENU_ID + '{position:fixed;z-index:2147483000;min-width:220px;max-width:360px;padding:4px;',
      'border:1px solid var(--dsw-alias-border-l2,#3a3a3d);border-radius:10px;',
      // Opaque: paint a solid layer first, then stack the (possibly translucent) menu tint on top.
      'background-color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#26262a));',
      'background-image:linear-gradient(var(--dsw-specific-menu,transparent),var(--dsw-specific-menu,transparent));',
      'backdrop-filter:none;opacity:1;',
      'box-shadow:0 10px 30px rgba(0,0,0,.38);font:' + FONT + ';',
      'color:var(--dsw-alias-label-primary,#e8e8ea);user-select:none}',
      '#' + MENU_ID + ' .' + ITEM_CLASS + '{display:flex;align-items:center;gap:10px;width:100%;padding:7px 10px;',
      'border:0;border-radius:7px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '#' + MENU_ID + ' .' + ITEM_CLASS + ':hover,#' + MENU_ID + ' .' + ITEM_CLASS + ':focus-visible{',
      'background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));outline:none}',
      '#' + MENU_ID + ' .dsh-fm-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#' + HINT_ID + '{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483001;',
      'padding:8px 14px;border-radius:8px;font:' + FONT + ';pointer-events:none;max-width:70vw;',
      'background-color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#26262a));',
      'color:var(--dsw-alias-label-primary,#e8e8ea);border:1px solid var(--dsw-alias-border-l2,#3a3a3d);',
      'box-shadow:0 8px 24px rgba(0,0,0,.35);opacity:1;white-space:pre-wrap;word-break:break-all;text-align:center}',
    ].join('')

    function log(scope, error) {
      try {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('[dsh-file-menu] ' + scope, error === undefined ? '' : error)
        }
      } catch (ignored) {
        /* never throw from diagnostics */
      }
    }

    function activeGeneration() {
      try {
        return GENERATION !== 0 && window[GENERATION_KEY] === GENERATION
      } catch (error) {
        return true
      }
    }

    function ensureStyle() {
      if (document.getElementById(STYLE_ID) !== null) return
      var style = document.createElement('style')
      style.id = STYLE_ID
      style.dataset.plugin = 'dsh-file-menu'
      style.textContent = CSS
      document.head.appendChild(style)
    }

    // ---------------------------------------------------------------------
    // Path extraction
    // ---------------------------------------------------------------------
    function looksAbsolutePath(text) {
      if (typeof text !== 'string') return false
      if (/^[A-Za-z]:[\\/]/.test(text)) return true
      if (/^\\\\[^\\]/.test(text)) return true
      if (text.charAt(0) === '/' && text.charAt(1) !== '/') return true
      return false
    }

    function hasFileExtension(text) {
      return /\.[A-Za-z0-9]{1,12}$/.test(text)
    }

    /** Scheme filter: only file:// (and scheme-less relative paths) count as files. */
    function isNonFileScheme(text) {
      var match = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text)
      if (match === null) {
        return /^(mailto|tel|data|javascript):/i.test(text)
      }
      return match[1].toLowerCase() !== 'file'
    }

    function decodeFileUrl(text) {
      var rest = text.slice('file://'.length)
      try {
        rest = decodeURIComponent(rest)
      } catch (error) {
        /* keep raw */
      }
      if (/^\/[A-Za-z]:[\\/]/.test(rest)) rest = rest.slice(1)
      return rest.replace(/^\/\//, '\\\\')
    }

    /**
     * Normalise one raw candidate string.
     * @param {string} value raw text
     * @param {boolean} fromText true when the value came from element text
     *   (stricter: require a separator or an extension so ordinary prose is not
     *   mistaken for a path).
     */
    function pathCandidate(value, fromText) {
      if (typeof value !== 'string') return ''
      var text = value.trim()
      if (text === '' || text.length > 1024 || /[\r\n]/.test(text)) return ''
      text = text.replace(/^[`'"<\u300c\u300e\u201c]+/, '').replace(/[`'">\u300d\u300f\u201d]+$/, '').trim()
      var isMention = text.charAt(0) === '@'
      if (isMention) text = text.slice(1).trim()
      if (text === '' || text.length > 1024) return ''
      if (/^#/.test(text)) return ''

      if (/^file:\/\//i.test(text)) {
        text = decodeFileUrl(text)
        return text
      }
      if (isNonFileScheme(text)) return ''
      if (looksAbsolutePath(text)) return text
      if (text === '~' || /^~[\\/]/.test(text)) return text

      if (!isMention) {
        // Relative: single token, no whitespace, no CJK punctuation.
        if (/\s/.test(text)) return ''
        if (/[\u3001\u3002\uff0c\uff1b\uff1a\uff01\uff1f\uff08\uff09\u3010\u3011\u300a\u300b\u201c\u201d]/.test(text)) return ''
      }
      var hasSeparator = text.indexOf('/') !== -1 || text.indexOf('\\') !== -1
      if (/^[\\/]/.test(text)) return ''
      // A relative reference must look like a file: single-segment workspace
      // files such as `AGENTS.md` are legitimate DSH references, so the
      // separator is optional as long as the last segment carries an extension.
      if (fromText === true && !isMention && !hasFileExtension(text)) return ''
      if (!hasFileExtension(text) && !isMention && !hasSeparator) return ''
      if (!hasFileExtension(text) && !isMention) return ''
      return text
    }

    function attributeCandidate(node, attributeName) {
      if (typeof node.getAttribute !== 'function') return ''
      return pathCandidate(node.getAttribute(attributeName), false)
    }

    var TEXT_TAGS = { A: true, CODE: true, SPAN: true, BUTTON: true, STRONG: true, EM: true, B: true, DIV: true, P: true, LI: true }

    /** True when the node sits inside something that must keep its native menu. */
    function isExcluded(target) {
      if (target === null || target === undefined || typeof target.closest !== 'function') return false
      return target.closest("pre, textarea, input, select, [contenteditable='true'], [contenteditable=''], [role='textbox']") !== null
    }

    /**
     * Find a file reference from the context-menu target.
     * Priority: data-file-path > data-file > data-path > other data-*path > href > title/aria-label > text.
     * @returns {string} raw path candidate (absolute, file://, `~`, relative or `@mention`), '' when none
     */
    function pathFromTarget(target) {
      var node = target
      if (node !== null && node !== undefined && node.nodeType === 3) node = node.parentElement
      var depth = 0
      while (node !== null && node !== undefined && node.nodeType === 1 && depth < MAX_DEPTH) {
        depth += 1
        var primary = ['data-file-path', 'data-file', 'data-path']
        for (var index = 0; index < primary.length; index += 1) {
          var hit = attributeCandidate(node, primary[index])
          if (hit !== '') return hit
        }
        if (node.dataset !== undefined && node.dataset !== null) {
          for (var key in node.dataset) {
            if (!Object.prototype.hasOwnProperty.call(node.dataset, key)) continue
            if (!/path/i.test(key)) continue
            var fromDataset = pathCandidate(node.dataset[key], false)
            if (fromDataset !== '') return fromDataset
          }
        }
        if (node.tagName === 'A') {
          var fromHref = pathCandidate(node.getAttribute('href'), false)
          if (fromHref !== '') return fromHref
        }
        var secondary = ['data-filepath', 'title', 'aria-label']
        for (var secondIndex = 0; secondIndex < secondary.length; secondIndex += 1) {
          var found = attributeCandidate(node, secondary[secondIndex])
          if (found !== '') return found
        }
        if (TEXT_TAGS[node.tagName] === true) {
          var fromText = pathCandidate(String(node.textContent === null ? '' : node.textContent), true)
          if (fromText !== '') return fromText
        }
        node = node.parentElement
      }
      return ''
    }

    /** Current session workspace root (absolute), or '' when unavailable. */
    function workspaceBase() {
      try {
        if (pluginCtx !== null && typeof pluginCtx.get === 'function') {
          var sessions = pluginCtx.get('sessions')
          var list = sessions === null || sessions === undefined ? undefined : sessions.list
          if (list !== undefined && list !== null && typeof list.getSnapshot === 'function') {
            var snapshot = list.getSnapshot()
            var id = snapshot === null || snapshot === undefined ? undefined : snapshot.current
            var record = id === undefined || snapshot.byId === undefined ? undefined : snapshot.byId[id]
            if (record !== undefined && record !== null && typeof record.cwd === 'string' && record.cwd !== '') {
              return record.cwd
            }
          }
        }
      } catch (error) {
        /* fall through to the host-provided cwd */
      }
      return sessionCwd
    }

    function joinPath(base, relative) {
      if (base === '') return relative
      var separator = base.indexOf('\\') !== -1 ? '\\' : '/'
      var rest = relative.replace(/^\.?[\\/]+/, '')
      rest = separator === '\\' ? rest.replace(/\//g, '\\') : rest.replace(/\\/g, '/')
      return base.replace(/[\\/]+$/, '') + separator + rest
    }

    /** Raw candidate -> absolute path (may be '' when a relative path has no base). */
    function toAbsolutePath(raw) {
      if (raw === '') return ''
      if (/^file:\/\//i.test(raw)) return decodeFileUrl(raw)
      if (raw === '~' || /^~[\\/]/.test(raw)) return raw
      if (looksAbsolutePath(raw)) return raw
      var base = workspaceBase()
      if (base === '') return ''
      return joinPath(base, raw)
    }

    // ---------------------------------------------------------------------
    // Host calls
    // ---------------------------------------------------------------------
    function postJson(url, payload) {
      return fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(
        function (response) {
          return response
            .json()
            .catch(function () {
              return {}
            })
            .then(function (body) {
              return {
                status: response.status,
                ok: response.ok && body !== null && body.ok !== false,
                error: body === null ? undefined : body.error,
                attempted: body === null ? undefined : body.attempted,
                matched: body === null ? undefined : body.matched,
                body: body,
              }
            })
        },
        function (error) {
          return { status: 0, ok: false, error: error instanceof Error ? error.message : String(error) }
        },
      )
    }

    function getJson(url) {
      return fetch(url, { method: 'GET' }).then(
        function (response) {
          return response.json().catch(function () {
            return {}
          })
        },
        function () {
          return {}
        },
      )
    }

    function loadSessionCwd() {
      getJson('/file-menu/status').then(function (body) {
        if (body === null || typeof body !== 'object') return
        if (typeof body.cwd === 'string' && body.cwd !== '') sessionCwd = body.cwd
      })
    }

    // ---------------------------------------------------------------------
    // Menu
    // ---------------------------------------------------------------------
    function closeMenu() {
      var nodes = document.querySelectorAll('#' + MENU_ID)
      for (var index = 0; index < nodes.length; index += 1) {
        var node = nodes[index]
        if (node.parentNode !== null) node.parentNode.removeChild(node)
      }
      menuEl = null
      menuRect = null
      menuItems = []
      currentTarget = null
    }

    function runAction(action) {
      if (action === null || action === undefined || action === '') return
      var raw = currentTarget
      closeMenu()
      if (raw === null || raw === '') return
      var absolute = toAbsolutePath(raw)
      var sendPath = absolute === '' ? raw : absolute
      var base = workspaceBase()
      if (action === 'copy') {
        copyText(sendPath)
        return
      }
      var route = '/file-menu/open-external'
      var payload = { path: sendPath, base: base }
      if (action === 'reveal') {
        route = '/file-menu/reveal'
      } else if (action.indexOf('openwith::') === 0) {
        route = '/file-menu/open-with'
        payload.exe = action.slice('openwith::'.length)
      }
      postJson(route, payload).then(function (result) {
        if (result.ok === true) {
          if (typeof result.matched === 'number' && result.matched > 1) showHint(pickLabels(dshLocale()).multiple)
          return
        }
        log('action-failed', { action: action, status: result.status, error: result.error })
        var labels = pickLabels(dshLocale())
        var message = result.error === 'not-found' ? labels.notFound : labels.failed
        if (result.error === 'not-found' && typeof result.attempted === 'string' && result.attempted !== '') {
          message = message + '\n' + result.attempted
        } else if (typeof result.error === 'string' && result.error !== '') {
          message = message + '\n' + result.error + (result.status === 0 ? '' : ' (' + result.status + ')')
        }
        showHint(message)
      })
    }

    /** Bottom hint pill: a plain-language message instead of failing silently. */
    function showHint(text) {
      try {
        var previous = document.getElementById(HINT_ID)
        if (previous !== null && previous.parentNode !== null) previous.parentNode.removeChild(previous)
        var node = document.createElement('div')
        node.id = HINT_ID
        node.setAttribute('role', 'status')
        node.textContent = text
        document.body.appendChild(node)
        window.setTimeout(function () {
          if (node.parentNode !== null) node.parentNode.removeChild(node)
        }, 2600)
      } catch (error) {
        /* Hint failure must not break the action */
      }
    }

    function copyText(text) {
      var value = String(text === null || text === undefined ? '' : text)
      if (value === '') {
        log('copy-empty')
        return
      }
      var fallback = function () {
        try {
          var area = document.createElement('textarea')
          area.value = value
          area.setAttribute('readonly', 'readonly')
          area.style.position = 'fixed'
          area.style.top = '-1000px'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.focus()
          area.select()
          var ok = document.execCommand('copy')
          if (area.parentNode !== null) area.parentNode.removeChild(area)
          if (ok !== true) log('copy-failed', 'execCommand returned false')
        } catch (error) {
          log('copy-failed', error)
        }
      }
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(value).then(null, function (error) {
            log('clipboard-denied', error)
            fallback()
          })
          return
        }
      } catch (error) {
        log('clipboard-unavailable', error)
      }
      fallback()
    }

    var handlerCache = {}

    function extOf(raw) {
      var match = /\.([A-Za-z0-9]{1,12})$/.exec(String(raw === null ? '' : raw))
      return match === null ? '' : '.' + match[1].toLowerCase()
    }

    function formatLabel(template, name) {
      return String(template).replace('{name}', name)
    }

    /** Ask the host which applications can open this extension (cached 5 min). */
    function handlersFor(raw, done) {
      var ext = extOf(raw)
      if (ext === '') {
        done([])
        return
      }
      var cached = handlerCache[ext]
      if (cached !== undefined && Date.now() - cached.at < 300000) {
        done(cached.list)
        return
      }
      postJson('/file-menu/handlers', { path: raw }).then(function (result) {
        var list = []
        if (result.ok === true && result.body !== null && typeof result.body === 'object' && Array.isArray(result.body.handlers)) {
          list = result.body.handlers
          handlerCache[ext] = { at: Date.now(), list: list }
        }
        done(list)
      })
    }

    function openItems(handlers) {
      var labels = pickLabels(dshLocale())
      var items = []
      var usable = []
      for (var index = 0; index < handlers.length; index += 1) {
        var entry = handlers[index]
        if (entry === null || typeof entry !== 'object') continue
        if (entry.available !== true) continue
        if (typeof entry.exe !== 'string' || entry.exe === '') continue
        usable.push(entry)
      }
      for (var position = 0; position < usable.length && position < 6; position += 1) {
        var name = typeof usable[position].label === 'string' && usable[position].label !== '' ? usable[position].label : 'App'
        items.push({ action: 'openwith::' + usable[position].exe, label: formatLabel(labels.openWith, name) })
      }
      return items
    }
    function renderMenu(raw, x, y, handlerList) {
      closeMenu()
      var labels = pickLabels(dshLocale())
      var items = [
        { action: 'copy', label: labels.copyAbsPath },
        { action: 'reveal', label: labels.revealInExplorer },
      ]
      var extra = Array.isArray(handlerList) ? openItems(handlerList) : []
      if (handlerList === null) {
        items.push({ action: '', label: labels.loading, disabled: true })
      } else if (extra.length > 0) {
        for (var position = 0; position < extra.length; position += 1) items.push(extra[position])
      } else {
        items.push({ action: 'open', label: labels.openWithDefault })
      }
      var root = document.createElement('div')
      root.id = MENU_ID
      root.setAttribute('role', 'menu')
      for (var index = 0; index < items.length; index += 1) {
        var button = document.createElement('button')
        button.type = 'button'
        button.className = ITEM_CLASS
        button.setAttribute('role', 'menuitem')
        button.setAttribute('data-action', items[index].action)
        if (items[index].disabled === true) {
          button.disabled = true
          button.setAttribute('aria-disabled', 'true')
        }
        var span = document.createElement('span')
        span.className = 'dsh-fm-label'
        span.textContent = items[index].label
        button.appendChild(span)
        root.appendChild(button)
      }
      document.body.appendChild(root)
      var rect = root.getBoundingClientRect()
      var left = x
      var top = y
      if (left + rect.width + 8 > window.innerWidth) left = Math.max(8, x - rect.width)
      if (top + rect.height + 8 > window.innerHeight) top = Math.max(8, y - rect.height)
      root.style.left = Math.floor(left) + 'px'
      root.style.top = Math.floor(top) + 'px'
      menuEl = root
      menuRect = root.getBoundingClientRect()
      menuItems = items
      currentTarget = raw
    }

    function actionAt(x, y) {
      var hit = null
      try {
        hit = document.elementFromPoint(x, y)
      } catch (error) {
        hit = null
      }
      if (hit === null || hit === undefined || typeof hit.closest !== 'function') return null
      var item = hit.closest('.' + ITEM_CLASS)
      if (item === null) return null
      return item.getAttribute('data-action')
    }

    function insideMenu(x, y) {
      return menuRect !== null && x >= menuRect.left && x <= menuRect.right && y >= menuRect.top && y <= menuRect.bottom
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    function onContextMenu(event) {
      try {
        if (!activeGeneration()) return
        if (event.__dshFmSeen === true) return
        event.__dshFmSeen = true
        var target = event.target
        if (target !== null && target !== undefined && typeof target.closest === 'function' && target.closest('#' + MENU_ID) !== null) {
          return
        }
        if (event.defaultPrevented === true && menuEl === null) return
        if (isExcluded(target)) return
        var raw = pathFromTarget(target)
        if (raw === '') return
        event.preventDefault()
        event.stopPropagation()
        var x = event.clientX
        var y = event.clientY
        var cachedList = (function () {
          var ext = extOf(raw)
          var hit = ext === '' ? undefined : handlerCache[ext]
          return hit === undefined ? null : hit.list
        })()
        renderMenu(raw, x, y, cachedList)
        handlersFor(raw, function (list) {
          if (menuEl === null || currentTarget !== raw) return
          var usable = Array.isArray(list) ? openItems(list) : []
          if (usable.length === 0) return
          renderMenu(raw, x, y, list)
        })
      } catch (error) {
        log('contextmenu-failed', error)
      }
    }

    function onPointerDown(event) {
      try {
        if (!activeGeneration()) return
        if (event.button === 0 && menuRect !== null && insideMenu(event.clientX, event.clientY)) {
          var action = actionAt(event.clientX, event.clientY)
          event.preventDefault()
          event.stopPropagation()
          if (action === null) closeMenu()
          else runAction(action)
          return
        }
        if (menuEl !== null) closeMenu()
      } catch (error) {
        log('pointerdown-failed', error)
      }
    }

    function onKeyDown(event) {
      if (!activeGeneration()) return
      if (event.key === 'Escape' && menuEl !== null) {
        closeMenu()
      }
    }

    function onScroll() {
      if (!activeGeneration()) return
      if (menuEl !== null) closeMenu()
    }

    function onWindowBlur(event) {
      if (!activeGeneration()) return
      if (event.target === window && menuEl !== null) closeMenu()
    }

    var LISTENERS = [
      [window, 'contextmenu', onContextMenu, true],
      [document, 'contextmenu', onContextMenu, true],
      [window, 'pointerdown', onPointerDown, true],
      [document, 'pointerdown', onPointerDown, true],
      [document, 'keydown', onKeyDown, true],
      [document, 'scroll', onScroll, true],
      [window, 'blur', onWindowBlur, true],
      [window, 'resize', onScroll, true],
    ]

    function teardown() {
      var previous = null
      try {
        previous = window[LISTENERS_KEY]
      } catch (error) {
        previous = null
      }
      if (previous !== null && previous !== undefined) {
        for (var index = 0; index < previous.length; index += 1) {
          var entry = previous[index]
          try {
            entry[0].removeEventListener(entry[1], entry[2], entry[3])
          } catch (error) {
            /* ignore a single removal failure */
          }
        }
      }
      try {
        window[LISTENERS_KEY] = null
      } catch (error) {
        /* ignore */
      }
      closeMenu()
      var style = document.getElementById(STYLE_ID)
      if (style !== null && style.parentNode !== null) style.parentNode.removeChild(style)
    }

    /** Called by DSH's client loader; idempotent across HMR re-instantiations. */
    function apply(ctx) {
      try {
        if (typeof document === 'undefined') return
        pluginCtx = ctx === undefined ? null : ctx
        // Drop listeners installed by a previous instance (HMR) before re-adding.
        teardown()
        window[GENERATION_KEY] = (typeof window[GENERATION_KEY] === 'number' ? window[GENERATION_KEY] : 0) + 1
        GENERATION = window[GENERATION_KEY]
        ensureStyle()
        for (var index = 0; index < LISTENERS.length; index += 1) {
          LISTENERS[index][0].addEventListener(LISTENERS[index][1], LISTENERS[index][2], LISTENERS[index][3])
        }
        window[LISTENERS_KEY] = LISTENERS
        loadSessionCwd()
        if (typeof ctx === 'object' && ctx !== null && typeof ctx.effect === 'function') {
          ctx.effect(function () {
            return function () {
              if (window[GENERATION_KEY] === GENERATION) teardown()
            }
          }, 'file-menu: transcript context menu')
        }
      } catch (error) {
        log('install-failed', error)
      }
    }

    exports.apply = apply
    exports.dispose = teardown
    exports.inject = []
    exports.version = CLIENT_VERSION
    return module.exports
  },
})
