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
  id: 'dsh-better-right-click',
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
        copyRelPath: '复制相对路径',
        menuSettings: '菜单设置…',
        settingsTitle: '右键菜单设置',
        settingsItems: '显示的菜单项',
        itemOpenWith: '「打开方式」列表',
        settingsFileManager: '文件管理器',
        fmAuto: '自动检测',
        fmExplorer: 'Windows 资源管理器',
        fmCustom: '自定义命令',
        customHint: '用 %1 代表文件路径',
        save: '保存',
        cancel: '取消',
        saved: '已保存，立即生效',
        keepOne: '至少要保留一项',
        detectedOther: '检测到 {name} 接管了文件夹打开方式',
        revealDetected: '用 {name} 打开所在位置',
        relativeFallback: '该文件不在当前工作区内，已复制绝对路径',
        pinSection: '默认打开方式（按扩展名固定）',
        pinEmpty: '还没有固定任何文件类型',
        pinHint: '固定后，这类文件点右键就直接出现「用 X 打开」，不再列全部程序。',
        pinAdd: '添加一条固定规则',
        pinRemove: '移除这条固定规则',
        pinPick: '先填扩展名',
        pinExtPlaceholder: '扩展名，如 md',
        pinConfirm: '确认扩展名',
        browse: '浏览其他程序…',
        pinCurrent: '当前文件类型：{name}',
        pinNone: '不固定（每次都列出全部程序）',
        pinnedOpen: '用 {name} 打开（已固定）',
        otherApp: '用其他程序打开…',
        reorderHint: '按住 ⠿ 拖动，调整菜单里的先后顺序',
        dragHandle: '按住拖动调整顺序',
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
        copyRelPath: 'Copy relative path',
        menuSettings: 'Menu settings…',
        settingsTitle: 'Context menu settings',
        settingsItems: 'Visible items',
        itemOpenWith: '“Open with” list',
        settingsFileManager: 'File manager',
        fmAuto: 'Auto-detect',
        fmExplorer: 'Windows Explorer',
        fmCustom: 'Custom command',
        customHint: 'Use %1 for the file path',
        save: 'Save',
        cancel: 'Cancel',
        saved: 'Saved — takes effect immediately',
        keepOne: 'Keep at least one item selected',
        detectedOther: '{name} is handling folder opens',
        revealDetected: 'Show in {name}',
        relativeFallback: 'That file is outside the current workspace; copied the absolute path instead',
        pinSection: 'Default app (pinned per file type)',
        pinEmpty: 'No file type is pinned yet',
        pinHint: 'Once pinned, right-clicking that file type shows “Open with X” directly instead of the full list.',
        pinAdd: 'Add a pinned rule',
        pinRemove: 'Remove this pinned rule',
        pinPick: 'Type an extension first',
        pinExtPlaceholder: 'Extension, e.g. md',
        pinConfirm: 'Confirm extension',
        browse: 'Browse for another app…',
        pinCurrent: 'Current file type: {name}',
        pinNone: 'Not pinned (list every app each time)',
        pinnedOpen: 'Open with {name} (pinned)',
        otherApp: 'Open with another app…',
        reorderHint: 'Drag the ⠿ handle to change the order shown in the menu',
        dragHandle: 'Drag to reorder',
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
    var DIALOG_ID = 'dsh-file-menu-settings'
    var ANIM_STYLE = [
      '@keyframes dsh-fm-fade{from{opacity:0}to{opacity:1}}',
      '@keyframes dsh-fm-pop{from{opacity:0;transform:scale(.96) translateY(-4px)}to{opacity:1;transform:none}}',
      '@keyframes dsh-fm-panel{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}',
      '@keyframes dsh-fm-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}',
      '@keyframes dsh-fm-fade-out{from{opacity:1}to{opacity:0}}',
      '#' + DIALOG_ID + '{animation:dsh-fm-fade .12s ease-out}',
      '#' + DIALOG_ID + ' .dsh-fm-panel{animation:dsh-fm-panel .18s cubic-bezier(.2,.8,.2,1)}',
      '#' + DIALOG_ID + '.dsh-fm-closing{animation:dsh-fm-fade-out .12s ease-in both}',
      '#' + DIALOG_ID + '.dsh-fm-closing .dsh-fm-panel{animation:dsh-fm-fade-out .12s ease-in both}',
      '#' + MENU_ID + '{animation:dsh-fm-pop .12s ease-out;transform-origin:top left}',
      '#' + HINT_ID + '{animation:dsh-fm-rise .18s cubic-bezier(.2,.8,.2,1)}',
      '.dsh-fm-item-row{transition:box-shadow .12s ease,opacity .12s ease,transform .16s cubic-bezier(.2,.8,.2,1)}',
      '.dsh-fm-item-row.dsh-fm-flip{transition:none}',
      '@media (prefers-reduced-motion:reduce){*{animation-duration:.001s!important;transition-duration:.001s!important}}',
    ].join('')
    var ROW_STYLE = [
      '.dsh-fm-item-row{display:flex;align-items:center;gap:6px;padding:2px 0}',
      '.dsh-fm-grip{color:var(--dsw-alias-text-3,#9ca3af);cursor:grab;user-select:none;font-size:14px;line-height:1;padding:0 2px}',
      '.dsh-fm-grip:active{cursor:grabbing}',
      '.dsh-fm-item-row.dsh-fm-dragging{opacity:.45}',
      '.dsh-fm-item-row.dsh-fm-drop-before{box-shadow:inset 0 2px 0 var(--dsw-alias-brand,#4f7cff)}',
      '.dsh-fm-item-row.dsh-fm-drop-after{box-shadow:inset 0 -2px 0 var(--dsw-alias-brand,#4f7cff)}',
      '.dsh-fm-pin-row{display:flex;align-items:center;gap:8px;padding:3px 0}',
      '.dsh-fm-pin-ext{min-width:52px;font-family:ui-monospace,Consolas,monospace;color:var(--dsw-alias-text-2,#4b5563)}',
      '.dsh-fm-pin-app{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-text-1,#111827)}',
      '.dsh-fm-pin-del{width:22px;height:22px;line-height:20px;padding:0;border:1px solid var(--dsw-alias-border-1,rgba(127,127,127,.35));border-radius:6px;background:transparent;color:var(--dsw-alias-text-2,#4b5563);cursor:pointer}',
      '.dsh-fm-pin-del:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3,rgba(127,127,127,.14))}',
      '.dsh-fm-pin-del:disabled{opacity:.35;cursor:default}',
      '.dsh-fm-pin-ok{width:24px;height:24px;padding:0;border:1px solid var(--dsw-alias-border-1,rgba(127,127,127,.35));border-radius:6px;background:var(--dsw-alias-bg-layer-3,rgba(127,127,127,.12));color:inherit;cursor:pointer;font-size:13px;line-height:1}',
      '.dsh-fm-pin-ok:hover{background:var(--dsw-alias-bg-layer-4,rgba(127,127,127,.2))}',
      '.dsh-fm-pin-locked{opacity:.7;border-style:dashed}',
      '.dsh-fm-pin-input{flex:0 0 84px;min-width:0;width:84px;padding:3px 6px;border:1px solid var(--dsw-alias-border-1,rgba(127,127,127,.35));border-radius:6px;background:transparent;color:inherit;font:inherit}',
      '.dsh-fm-pin-select{flex:1 1 auto;width:0;min-width:0;max-width:100%;padding:3px 6px;border:1px solid var(--dsw-alias-border-1,rgba(127,127,127,.35));border-radius:6px;background:transparent;color:inherit;font:inherit}',
    ].join('')
    var ITEM_CLASS = 'dsh-fm-item'
    var LISTENERS_KEY = '__dshFileMenuListeners'
    var GENERATION_KEY = '__dshFileMenuGeneration'
    var MAX_DEPTH = 20
    var CLIENT_VERSION = '0.6.6'

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
      'border:1px solid var(--dsw-alias-border-l2,var(--fm-border,#3a3a3d));border-radius:10px;',
      // Opaque: paint a solid layer first, then stack the (possibly translucent) menu tint on top.
      'background-color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,var(--fm-bg,#26262a)));',
      'background-image:linear-gradient(var(--dsw-specific-menu,transparent),var(--dsw-specific-menu,transparent));',
      'backdrop-filter:none;opacity:1;',
      'box-shadow:0 10px 30px rgba(0,0,0,.38);font:' + FONT + ';',
      'color:var(--dsw-alias-label-primary,var(--fm-fg,#e8e8ea));user-select:none}',
      '#' + MENU_ID + ' .' + ITEM_CLASS + '{display:flex;align-items:center;gap:10px;width:100%;padding:7px 10px;',
      'border:0;border-radius:7px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '#' + MENU_ID + ' .' + ITEM_CLASS + ':hover,#' + MENU_ID + ' .' + ITEM_CLASS + ':focus-visible{',
      'background:var(--dsw-alias-interactive-bg-hover,var(--fm-hover,rgba(255,255,255,.08)));outline:none}',
      '#' + MENU_ID + ' .dsh-fm-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#' + HINT_ID + '{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483001;',
      'padding:8px 14px;border-radius:8px;font:' + FONT + ';pointer-events:none;max-width:70vw;',
      'background-color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,var(--fm-bg,#26262a)));',
      'color:var(--dsw-alias-label-primary,var(--fm-fg,#e8e8ea));border:1px solid var(--dsw-alias-border-l2,var(--fm-border,#3a3a3d));',
      'box-shadow:0 8px 24px rgba(0,0,0,.35);opacity:1;white-space:pre-wrap;word-break:break-all;text-align:center}',
      '#' + MENU_ID + ' .dsh-fm-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l2,var(--fm-border,#3a3a3d))}',
      '#' + DIALOG_ID + '{position:fixed;inset:0;z-index:2147483002;display:flex;align-items:center;justify-content:center;',
      'background:rgba(0,0,0,.45);font:' + FONT + '}',
      '#' + DIALOG_ID + ' .dsh-fm-panel{width:380px;min-width:0;max-width:calc(100vw - 32px);box-sizing:border-box;padding:16px 18px;border-radius:12px;',
      'border:1px solid var(--dsw-alias-border-l2,var(--fm-border,#3a3a3d));',
      'background-color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,var(--fm-bg,#26262a)));',
      'color:var(--dsw-alias-label-primary,var(--fm-fg,#e8e8ea));box-shadow:0 16px 40px rgba(0,0,0,.45)}',
      '#' + DIALOG_ID + ' h3{margin:0 0 12px;font-size:14px;font-weight:600}',
      '#' + DIALOG_ID + ' .dsh-fm-group{margin:0 0 12px}',
      '#' + DIALOG_ID + ' .dsh-fm-group-title{font-size:12px;opacity:.72;margin-bottom:6px}',
      '#' + DIALOG_ID + ' label{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:13px;cursor:pointer}',
      '#' + DIALOG_ID + ' input[type=text]{width:100%;margin-top:6px;padding:6px 8px;border-radius:7px;font:' + FONT + ';',
      'border:1px solid var(--dsw-alias-border-l2,var(--fm-border,#3a3a3d));background:var(--dsw-alias-bg-base,var(--fm-input,#1e1e21));color:inherit}',
      '#' + DIALOG_ID + ' .dsh-fm-note{font-size:11px;opacity:.62;margin-top:4px}',
      '#' + DIALOG_ID + ' .dsh-fm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}',
      '#' + DIALOG_ID + ' .dsh-fm-btn{padding:6px 14px;border-radius:7px;cursor:pointer;font:' + FONT + ';',
      'border:1px solid var(--dsw-alias-border-l2,var(--fm-border,#3a3a3d));background:transparent;color:inherit}',
      '#' + DIALOG_ID + ' .dsh-fm-btn.primary{background:var(--dsw-alias-interactive-bg,#3b5bdb);border-color:transparent;color:#fff}',
      '#' + DIALOG_ID + ' select{width:100%;margin-top:6px;padding:6px 8px;border-radius:7px;font:' + FONT + ';',
      'border:1px solid var(--dsw-alias-border-l2,var(--fm-border,#3a3a3d));background:var(--dsw-alias-bg-base,var(--fm-input,#1e1e21));color:inherit}',
      // Theme fallbacks: used only when the running theme does not define the dsw tokens.
      '.dsh-fm-light{--fm-bg:#ffffff;--fm-fg:#1f2328;--fm-border:#d9d9de;--fm-hover:rgba(0,0,0,.06);--fm-input:#f3f4f6}',
      '.dsh-fm-dark{--fm-bg:#26262a;--fm-fg:#e8e8ea;--fm-border:#3a3a3d;--fm-hover:rgba(255,255,255,.08);--fm-input:#1e1e21}',
    ].join('')

    /**
     * Current scheme of the running Harness theme.
     * DSH projects the resolved scheme onto <html>: style.colorScheme plus a
     * data-* marker set by dsh-client-ui-layout, and the palette itself via
     * --dsw-* custom properties. Any of those counts; prefers-color-scheme is
     * the last resort so the menu still looks right outside DSH.
     */
    function themeScheme() {
      try {
        var root = document.documentElement
        var inline = String(root.style.colorScheme || '').toLowerCase()
        if (inline.indexOf('dark') >= 0) return 'dark'
        if (inline.indexOf('light') >= 0) return 'light'
        var computed = ''
        try {
          computed = String(getComputedStyle(root).colorScheme || '').toLowerCase()
        } catch (error) {
          computed = ''
        }
        if (computed.indexOf('dark') >= 0) return 'dark'
        if (computed.indexOf('light') >= 0) return 'light'
        var marker = String(root.getAttribute('data-theme') || root.getAttribute('data-color-scheme') || '')
        if (/dark/i.test(marker)) return 'dark'
        if (/light/i.test(marker)) return 'light'
        if (root.classList !== undefined && root.classList.contains('dark')) return 'dark'
        if (window.matchMedia !== undefined && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
      } catch (error) {
        log('theme-probe-failed', error)
      }
      return 'light'
    }

    /** Keep every open surface on the theme the Harness is using right now. */
    function syncThemeClasses() {
      var scheme = themeScheme()
      var ids = [MENU_ID, HINT_ID, DIALOG_ID]
      for (var index = 0; index < ids.length; index += 1) {
        var node = document.getElementById(ids[index])
        if (node === null) continue
        node.classList.remove('dsh-fm-light')
        node.classList.remove('dsh-fm-dark')
        node.classList.add('dsh-fm-' + scheme)
      }
    }

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
      style.textContent = CSS + ROW_STYLE + ANIM_STYLE
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
      if (action === 'copy-relative') {
        var relative = relativePathOf(sendPath)
        if (relative === '') {
          copyText(sendPath)
          showHint(pickLabels(dshLocale()).relativeFallback)
        } else {
          copyText(relative)
        }
        return
      }
      if (action === 'settings') {
        openSettings()
        return
      }
      var route = '/file-menu/open-external'
      var payload = { path: sendPath, base: base }
      if (action === 'reveal') {
        route = '/file-menu/reveal'
      } else if (action === 'open-pinned') {
        route = '/file-menu/open-with'
        payload.exe = pinnedFor(raw)
      } else if (action === 'other-app') {
        route = '/file-menu/open-as'
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
        node.classList.add('dsh-fm-' + themeScheme())
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
    var userConfig = null
    var detection = null
    var lastTarget = null
    var lastHandlers = null

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

    function pinnedFor(raw) {
      if (userConfig === null || userConfig.pins === undefined || userConfig.pins === null) return ''
      var ext = extOf(raw)
      if (ext === '') return ''
      var value = userConfig.pins[ext]
      return typeof value === 'string' ? value : ''
    }

    function nameOfExe(handlers, exe) {
      var wanted = String(exe).toLowerCase()
      for (var index = 0; index < handlers.length; index += 1) {
        var entry = handlers[index]
        if (entry === null || typeof entry !== 'object') continue
        if (typeof entry.exe !== 'string') continue
        if (entry.exe.toLowerCase() === wanted && typeof entry.label === 'string' && entry.label !== '') return entry.label
      }
      var parts = String(exe).split(/[\\/]/)
      var tail = parts[parts.length - 1]
      return tail.replace(/\.exe$/i, '')
    }

    function openItems(handlers, excludeExe) {
      var skip = typeof excludeExe === 'string' ? excludeExe.toLowerCase() : ''
      var labels = pickLabels(dshLocale())
      var items = []
      var usable = []
      for (var index = 0; index < handlers.length; index += 1) {
        var entry = handlers[index]
        if (entry === null || typeof entry !== 'object') continue
        if (entry.available !== true) continue
        if (typeof entry.exe !== 'string' || entry.exe === '') continue
        if (skip !== '' && entry.exe.toLowerCase() === skip) continue
        usable.push(entry)
      }
      for (var position = 0; position < usable.length && position < 6; position += 1) {
        var name = typeof usable[position].label === 'string' && usable[position].label !== '' ? usable[position].label : 'App'
        items.push({ action: 'openwith::' + usable[position].exe, label: formatLabel(labels.openWith, name) })
      }
      return items
    }
    var MENU_ORDER = ['copy-absolute', 'copy-relative', 'reveal', 'open-default', 'open-with']

    /** Enabled menu ids in fixed order; before the config arrives every item counts as enabled. */
    function configItems() {
      var enabled = userConfig !== null && Array.isArray(userConfig.items) ? userConfig.items : MENU_ORDER
      var result = []
      for (var index = 0; index < enabled.length; index += 1) {
        var id = enabled[index]
        if (MENU_ORDER.indexOf(id) === -1 || result.indexOf(id) !== -1) continue
        result.push(id)
      }
      for (var rest = 0; rest < MENU_ORDER.length; rest += 1) {
        if (enabled.indexOf(MENU_ORDER[rest]) === -1) continue
        if (result.indexOf(MENU_ORDER[rest]) === -1) result.push(MENU_ORDER[rest])
      }
      return result
    }

    /** Absolute path to workspace-relative path; empty when the file is outside the workspace. */
    function relativePathOf(absolute) {
      var base = workspaceBase()
      if (base === '' || absolute === '') return ''
      var trimmed = base.replace(/[\\/]+$/, '')
      var left = absolute.replace(/\//g, '\\').toLowerCase()
      var right = trimmed.replace(/\//g, '\\').toLowerCase()
      if (left === right) return ''
      if (left.indexOf(right + '\\') !== 0) return ''
      return absolute.slice(trimmed.length + 1)
    }

    function loadConfig() {
      getJson('/file-menu/config').then(function (body) {
        if (body === null || typeof body !== 'object' || body.ok !== true) return
        if (body.config !== null && typeof body.config === 'object') userConfig = body.config
        if (body.detected !== null && typeof body.detected === 'object') detection = body.detected
      })
    }

    function renderMenu(raw, x, y, handlerList) {
      closeMenu()
      lastTarget = raw
      if (Array.isArray(handlerList)) lastHandlers = handlerList
      var labels = pickLabels(dshLocale())
      var enabled = configItems()
      var items = []
      var pinnedExe = pinnedFor(raw)
      var pinnedAdded = false
      if (pinnedExe !== '' && Array.isArray(handlerList)) {
        items.push({ action: 'open-pinned', label: formatLabel(labels.pinnedOpen, nameOfExe(handlerList, pinnedExe)) })
        pinnedAdded = true
      }
      for (var enabledIndex = 0; enabledIndex < enabled.length; enabledIndex += 1) {
        var id = enabled[enabledIndex]
        if (id === 'copy-absolute') {
          items.push({ action: 'copy', label: labels.copyAbsPath })
        } else if (id === 'copy-relative') {
          items.push({ action: 'copy-relative', label: labels.copyRelPath })
        } else if (id === 'reveal') {
          items.push({ action: 'reveal', label: labels.revealInExplorer })
        } else if (id === 'open-default') {
          items.push({ action: 'open', label: labels.openWithDefault })
        } else if (id === 'open-with') {
          if (handlerList === null) {
            items.push({ action: '', label: labels.loading, disabled: true })
          } else {
            var extra = openItems(handlerList, pinnedExe)
            for (var position = 0; position < extra.length; position += 1) items.push(extra[position])
            if (extra.length === 0 && pinnedAdded === false) items.push({ action: '', label: labels.noHandler, disabled: true })
            items.push({ action: 'other-app', label: labels.otherApp })
          }
        }
      }
      if (detection !== null && detection.owner === 'other' && typeof detection.command === 'string' && detection.command !== '') {
        var appName = typeof detection.name === 'string' && detection.name !== '' ? detection.name : 'App'
        items.push({ action: 'reveal-detected', label: formatLabel(labels.revealDetected, appName) })
      }
      items.push({ separator: true })
      items.push({ action: 'settings', label: labels.menuSettings })
      var root = document.createElement('div')
      root.id = MENU_ID
      root.setAttribute('role', 'menu')
      root.classList.add('dsh-fm-' + themeScheme())
      for (var index = 0; index < items.length; index += 1) {
        if (items[index].separator === true) {
          var rule = document.createElement('div')
          rule.className = 'dsh-fm-sep'
          root.appendChild(rule)
          continue
        }
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

    // ---------------------------------------------------------------------
    // Settings dialog
    // ---------------------------------------------------------------------
    function closeSettings() {
      var existing = document.getElementById(DIALOG_ID)
      if (existing === null) return
      if (existing.classList.contains('dsh-fm-closing') === true) return
      existing.classList.add('dsh-fm-closing')
      var target = existing
      window.setTimeout(function () {
        if (target.parentNode !== null) target.parentNode.removeChild(target)
      }, 130)
    }

    function groupBox(titleText) {
      var wrap = document.createElement('div')
      wrap.className = 'dsh-fm-group'
      var title = document.createElement('div')
      title.className = 'dsh-fm-group-title'
      title.textContent = titleText
      wrap.appendChild(title)
      return wrap
    }

    function checkRow(text, checked) {
      var row = document.createElement('label')
      var box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = checked
      row.appendChild(box)
      var span = document.createElement('span')
      span.textContent = text
      row.appendChild(span)
      return { row: row, box: box }
    }

    /** Settings entry of the context menu: item checkboxes plus file-manager mode, persisted on save. */
    function openSettings() {
      var stale = document.getElementById(DIALOG_ID)
      if (stale !== null && stale.parentNode !== null) stale.parentNode.removeChild(stale)
      var labels = pickLabels(dshLocale())
      var config = userConfig !== null && typeof userConfig === 'object' ? userConfig : null
      var enabled = config !== null && Array.isArray(config.items) ? config.items.slice() : MENU_ORDER.slice()
      var manager = config !== null && config.fileManager !== null && typeof config.fileManager === 'object'
        ? config.fileManager
        : { mode: 'auto', command: '' }

      var overlay = document.createElement('div')
      overlay.id = DIALOG_ID
      overlay.setAttribute('role', 'dialog')
      overlay.classList.add('dsh-fm-' + themeScheme())
      var panel = document.createElement('div')
      panel.className = 'dsh-fm-panel'
      var title = document.createElement('h3')
      title.textContent = labels.settingsTitle
      panel.appendChild(title)

      var itemsGroup = groupBox(labels.settingsItems)
      var rowDefs = [
        ['copy-absolute', labels.copyAbsPath],
        ['copy-relative', labels.copyRelPath],
        ['reveal', labels.revealInExplorer],
        ['open-default', labels.openWithDefault],
        ['open-with', labels.itemOpenWith],
      ]
      var order = []
      var labelOf = {}
      for (var defIndex = 0; defIndex < rowDefs.length; defIndex += 1) labelOf[rowDefs[defIndex][0]] = rowDefs[defIndex][1]
      for (var enabledIndex = 0; enabledIndex < enabled.length; enabledIndex += 1) {
        if (labelOf[enabled[enabledIndex]] !== undefined && order.indexOf(enabled[enabledIndex]) === -1) order.push(enabled[enabledIndex])
      }
      for (var fillIndex = 0; fillIndex < rowDefs.length; fillIndex += 1) {
        if (order.indexOf(rowDefs[fillIndex][0]) === -1) order.push(rowDefs[fillIndex][0])
      }
      var checkedState = {}
      for (var stateIndex = 0; stateIndex < rowDefs.length; stateIndex += 1) {
        checkedState[rowDefs[stateIndex][0]] = enabled.indexOf(rowDefs[stateIndex][0]) !== -1
      }
      var listHost = document.createElement('div')
      var boxes = []
      var dragIndex = -1
      var markDrop = function (line, position) {
        for (var clear = 0; clear < listHost.children.length; clear += 1) {
          listHost.children[clear].classList.remove('dsh-fm-drop-before')
          listHost.children[clear].classList.remove('dsh-fm-drop-after')
        }
        if (position === 'before') line.classList.add('dsh-fm-drop-before')
        if (position === 'after') line.classList.add('dsh-fm-drop-after')
      }
      var renderRows = function () {
        var previousRects = {}
        for (var measure = 0; measure < listHost.children.length; measure += 1) {
          var measured = listHost.children[measure]
          var measuredId = measured.getAttribute('data-item-id')
          if (measuredId === null) continue
          previousRects[measuredId] = measured.getBoundingClientRect().top
        }
        listHost.textContent = ''
        boxes = []
        for (var rowIndex = 0; rowIndex < order.length; rowIndex += 1) {
          var id = order[rowIndex]
          var line = document.createElement('div')
          line.className = 'dsh-fm-item-row'
          line.setAttribute('data-item-id', id)
          line.setAttribute('draggable', 'true')
          var grip = document.createElement('span')
          grip.className = 'dsh-fm-grip'
          grip.textContent = '⠿'
          grip.setAttribute('aria-hidden', 'true')
          grip.title = labels.dragHandle
          var entry = checkRow(labelOf[id], checkedState[id] === true)
          entry.id = id
          entry.box.addEventListener('change', function (model) {
            return function () {
              checkedState[model] = this.checked
            }
          }(id))
          boxes.push(entry)
          line.appendChild(grip)
          line.appendChild(entry.row)
          line.addEventListener('dragstart', function (position) {
            return function (event) {
              dragIndex = position
              if (event.dataTransfer !== null && event.dataTransfer !== undefined) {
                event.dataTransfer.effectAllowed = 'move'
                try {
                  event.dataTransfer.setData('text/plain', String(position))
                } catch (error) {
                  log('drag-data-failed', error)
                }
              }
              line.classList.add('dsh-fm-dragging')
            }
          }(rowIndex))
          line.addEventListener('dragend', function () {
            dragIndex = -1
            line.classList.remove('dsh-fm-dragging')
            markDrop(line, '')
          })
          line.addEventListener('dragover', function (event) {
            event.preventDefault()
            if (event.dataTransfer !== null && event.dataTransfer !== undefined) event.dataTransfer.dropEffect = 'move'
            var rect = line.getBoundingClientRect()
            markDrop(line, event.clientY > rect.top + rect.height / 2 ? 'after' : 'before')
          })
          line.addEventListener('dragleave', function () {
            line.classList.remove('dsh-fm-drop-before')
            line.classList.remove('dsh-fm-drop-after')
          })
          line.addEventListener('drop', function (position) {
            return function (event) {
              event.preventDefault()
              var wantsAfter = line.classList.contains('dsh-fm-drop-after')
              markDrop(line, '')
              if (dragIndex < 0 || dragIndex === position) {
                renderRows()
                return
              }
              var moved = order.splice(dragIndex, 1)[0]
              var target = position + (wantsAfter ? 1 : 0)
              if (dragIndex < target) target -= 1
              order.splice(target, 0, moved)
              dragIndex = -1
              renderRows()
            }
          }(rowIndex))
          listHost.appendChild(line)
        }
        for (var flip = 0; flip < listHost.children.length; flip += 1) {
          var flipped = listHost.children[flip]
          var previousTop = previousRects[flipped.getAttribute('data-item-id')]
          if (previousTop === undefined) continue
          var delta = previousTop - flipped.getBoundingClientRect().top
          if (Math.abs(delta) < 1) continue
          flipped.classList.add('dsh-fm-flip')
          flipped.style.transform = 'translateY(' + delta + 'px)'
          window.requestAnimationFrame(function (node) {
            return function () {
              node.classList.remove('dsh-fm-flip')
              node.style.transform = ''
            }
          }(flipped))
        }
      }
      renderRows()
      itemsGroup.appendChild(listHost)
      var note = document.createElement('div')
      note.className = 'dsh-fm-note'
      note.textContent = labels.reorderHint
      itemsGroup.appendChild(note)
      panel.appendChild(itemsGroup)

      var managerGroup = groupBox(labels.settingsFileManager)
      var modes = [
        ['auto', labels.fmAuto],
        ['explorer', labels.fmExplorer],
        ['custom', labels.fmCustom],
      ]
      var radios = []
      var command = document.createElement('input')
      command.type = 'text'
      command.value = typeof manager.command === 'string' ? manager.command : ''
      command.disabled = manager.mode !== 'custom'
      function syncCommand() {
        command.disabled = true
        for (var position = 0; position < radios.length; position += 1) {
          if (radios[position].input.checked === true && radios[position].mode === 'custom') command.disabled = false
        }
      }
      for (var modeIndex = 0; modeIndex < modes.length; modeIndex += 1) {
        var radioRow = document.createElement('label')
        var radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'dsh-fm-mode'
        radio.value = modes[modeIndex][0]
        radio.checked = manager.mode === modes[modeIndex][0]
        radio.addEventListener('change', syncCommand)
        radioRow.appendChild(radio)
        var modeLabel = document.createElement('span')
        modeLabel.textContent = modes[modeIndex][1]
        radioRow.appendChild(modeLabel)
        radios.push({ mode: modes[modeIndex][0], input: radio })
        managerGroup.appendChild(radioRow)
      }
      managerGroup.appendChild(command)
      var note = document.createElement('div')
      note.className = 'dsh-fm-note'
      note.textContent = labels.customHint
      managerGroup.appendChild(note)
      if (detection !== null && typeof detection === 'object' && detection.owner === 'other') {
        var detectedNote = document.createElement('div')
        detectedNote.className = 'dsh-fm-note'
        detectedNote.textContent = formatLabel(labels.detectedOther, detection.name !== '' ? detection.name : 'App')
        managerGroup.appendChild(detectedNote)
      }
      panel.appendChild(managerGroup)

      var pinsDraft = {}
      var basePins = userConfig !== null && userConfig.pins !== null && typeof userConfig.pins === 'object' ? userConfig.pins : {}
      for (var basePinKey in basePins) {
        if (Object.prototype.hasOwnProperty.call(basePins, basePinKey)) pinsDraft[basePinKey] = basePins[basePinKey]
      }
      var pinGroup = groupBox(labels.pinSection)
      var pinListHost = document.createElement('div')
      var renderPins = function () {
        pinListHost.textContent = ''
        var keys = Object.keys(pinsDraft)
        if (keys.length === 0) {
          var empty = document.createElement('div')
          empty.className = 'dsh-fm-note'
          empty.textContent = labels.pinEmpty
          pinListHost.appendChild(empty)
          return
        }
        for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
          var ext = keys[keyIndex]
          var row = document.createElement('div')
          row.className = 'dsh-fm-pin-row'
          var tag = document.createElement('span')
          tag.className = 'dsh-fm-pin-ext'
          tag.textContent = ext
          var title = document.createElement('span')
          title.className = 'dsh-fm-pin-app'
          var exePath = String(pinsDraft[ext] || '')
          var pieces = exePath.split(/[\\/]/)
          title.textContent = pieces.length > 0 ? pieces[pieces.length - 1].replace(/\.exe$/i, '') : exePath
          title.title = exePath
          var remove = document.createElement('button')
          remove.type = 'button'
          remove.className = 'dsh-fm-pin-del'
          remove.textContent = '×'
          remove.title = labels.pinRemove
          remove.setAttribute('aria-label', labels.pinRemove)
          remove.addEventListener('click', function (model) {
            return function () {
              delete pinsDraft[model]
              renderPins()
            }
          }(ext))
          row.appendChild(tag)
          row.appendChild(title)
          row.appendChild(remove)
          pinListHost.appendChild(row)
        }
      }
      renderPins()
      pinGroup.appendChild(pinListHost)

      var addRow = document.createElement('div')
      addRow.className = 'dsh-fm-pin-row dsh-fm-pin-add'
      var extInput = document.createElement('input')
      extInput.type = 'text'
      extInput.className = 'dsh-fm-pin-input'
      extInput.placeholder = labels.pinExtPlaceholder
      var confirmExt = document.createElement('button')
      confirmExt.type = 'button'
      confirmExt.className = 'dsh-fm-pin-ok'
      confirmExt.textContent = '✓'
      confirmExt.title = labels.pinConfirm
      confirmExt.setAttribute('aria-label', labels.pinConfirm)
      var handlerSelect = document.createElement('select')
      handlerSelect.className = 'dsh-fm-pin-select'
      var hintOption = document.createElement('option')
      hintOption.value = ''
      hintOption.textContent = labels.pinPick
      handlerSelect.appendChild(hintOption)
      handlerSelect.disabled = true
      var addButton = document.createElement('button')
      addButton.type = 'button'
      addButton.className = 'dsh-fm-pin-del'
      addButton.textContent = '+'
      addButton.title = labels.pinAdd
      addButton.setAttribute('aria-label', labels.pinAdd)
      addButton.disabled = true

      var setLocked = function (locked) {
        extInput.readOnly = locked
        extInput.classList.toggle('dsh-fm-pin-locked', locked)
        confirmExt.style.display = locked ? 'none' : ''
      }
      var showPlaceholder = function (text) {
        handlerSelect.textContent = ''
        var option = document.createElement('option')
        option.value = ''
        option.textContent = text
        handlerSelect.appendChild(option)
        handlerSelect.disabled = true
        addButton.disabled = true
      }
      var unlock = function () {
        setLocked(false)
        showPlaceholder(labels.pinPick)
        extInput.removeAttribute('data-ext')
        addButton.disabled = true
      }

      var BROWSE = '__browse__'
      var browseOption = null

      // Ask the host to pop the native file picker; the chosen .exe is added to the list.
      var pickCustom = function () {
        handlerSelect.disabled = true
        addButton.disabled = true
        postJson('/file-menu/pick-exe', {}).then(function (result) {
          handlerSelect.disabled = false
          var body = result !== null && result.body !== null && typeof result.body === 'object' ? result.body : null
          handlerSelect.value = ''
          addButton.disabled = true
          if (body === null || body.ok !== true || typeof body.exe !== 'string' || body.exe === '') return
          var exePath = body.exe
          var pieces = exePath.split(/[\\/]/)
          var name = pieces.length > 0 ? pieces[pieces.length - 1].replace(/\.exe$/i, '') : exePath
          var found = null
          for (var scan = 0; scan < handlerSelect.options.length; scan += 1) {
            var option = handlerSelect.options[scan]
            if (option.value !== '' && option.value !== BROWSE && option.value.toLowerCase() === exePath.toLowerCase()) { found = option; break }
          }
          if (found === null) {
            found = document.createElement('option')
            found.value = exePath
            found.textContent = name
            if (browseOption !== null && browseOption.parentNode === handlerSelect) handlerSelect.insertBefore(found, browseOption)
            else handlerSelect.appendChild(found)
          }
          handlerSelect.value = found.value
          addButton.disabled = false
        })
      }

      // The user types an extension and presses the check button; only then is the input locked and the handler list requested.
      var loadHandlers = function () {
        var raw = extInput.value.trim()
        if (raw === '') return
        var ext = raw.charAt(0) === '.' ? raw.toLowerCase() : '.' + raw.toLowerCase()
        extInput.value = ext
        extInput.setAttribute('data-ext', ext)
        setLocked(true)
        showPlaceholder(labels.loading)
        postJson('/file-menu/handlers', { path: 'probe' + ext, base: '' }).then(function (result) {
          var body = result !== null && result.body !== null && typeof result.body === 'object' ? result.body : null
          if (body === null) {
            unlock()
            showHint(labels.failed)
            return
          }
          var list = Array.isArray(body.handlers) ? body.handlers : []
          handlerSelect.textContent = ''
          var pick = document.createElement('option')
          pick.value = ''
          pick.textContent = labels.pinPick
          handlerSelect.appendChild(pick)
          var usable = 0
          for (var handlerIndex = 0; handlerIndex < list.length; handlerIndex += 1) {
            var handler = list[handlerIndex]
            if (handler === null || typeof handler !== 'object') continue
            if (handler.available !== true || typeof handler.exe !== 'string' || handler.exe === '') continue
            var opt = document.createElement('option')
            opt.value = handler.exe
            opt.textContent = typeof handler.label === 'string' && handler.label !== '' ? handler.label : handler.exe
            handlerSelect.appendChild(opt)
            usable += 1
          }
          browseOption = document.createElement('option')
          browseOption.value = BROWSE
          browseOption.textContent = labels.browse
          handlerSelect.appendChild(browseOption)
          handlerSelect.disabled = false
          addButton.disabled = true
          // Even when the registry lists nothing, offer the file picker instead of a dead end.
          if (usable === 0) {
            handlerSelect.value = BROWSE
            showHint(labels.noHandler)
          }
        })
      }
      confirmExt.addEventListener('click', loadHandlers)
      extInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && extInput.readOnly !== true) {
          event.preventDefault()
          loadHandlers()
        }
      })
      handlerSelect.addEventListener('change', function () {
        if (handlerSelect.value === BROWSE) {
          pickCustom()
          return
        }
        addButton.disabled = handlerSelect.value === ''
      })
      addButton.addEventListener('click', function () {
        var ext = extInput.getAttribute('data-ext')
        if (ext === null || handlerSelect.value === '' || handlerSelect.value === BROWSE) return
        pinsDraft[ext] = handlerSelect.value
        extInput.value = ''
        unlock()
        renderPins()
      })
      addRow.appendChild(extInput)
      addRow.appendChild(confirmExt)
      addRow.appendChild(handlerSelect)
      addRow.appendChild(addButton)
      pinGroup.appendChild(addRow)
      var pinNote = document.createElement('div')
      pinNote.className = 'dsh-fm-note'
      pinNote.textContent = labels.pinHint
      pinGroup.appendChild(pinNote)
      panel.appendChild(pinGroup)
      var actions = document.createElement('div')
      actions.className = 'dsh-fm-actions'
      var cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = 'dsh-fm-btn'
      cancel.textContent = labels.cancel
      cancel.addEventListener('click', closeSettings)
      var save = document.createElement('button')
      save.type = 'button'
      save.className = 'dsh-fm-btn primary'
      save.textContent = labels.save
      save.addEventListener('click', function () {
        var chosen = []
        for (var position = 0; position < order.length; position += 1) {
          if (checkedState[order[position]] === true) chosen.push(order[position])
        }
        if (chosen.length === 0) {
          showHint(labels.keepOne)
          return
        }
        var mode = 'auto'
        for (var radioIndex = 0; radioIndex < radios.length; radioIndex += 1) {
          if (radios[radioIndex].input.checked === true) mode = radios[radioIndex].mode
        }
        var payload = {
          items: chosen,
          fileManager: { mode: mode, command: mode === 'custom' ? command.value : '' },
        }
        payload.pins = pinsDraft
        postJson('/file-menu/config', payload).then(function (result) {
          if (result.ok === true && result.body !== null && typeof result.body === 'object' && result.body.config !== null) {
            userConfig = result.body.config
            handlerCache = {}
            closeSettings()
            showHint(labels.saved)
            return
          }
          showHint(labels.failed)
        })
      })
      actions.appendChild(cancel)
      actions.appendChild(save)
      panel.appendChild(actions)

      overlay.appendChild(panel)
      overlay.addEventListener('pointerdown', function (event) {
        if (event.target === overlay) closeSettings()
      })
      document.body.appendChild(overlay)
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

    var themeObserver = null
    var themeMedia = null

    /** Watch the Harness theme: it rewrites <html> attributes when the user switches scheme. */
    function watchTheme() {
      try {
        if (themeObserver !== null) themeObserver.disconnect()
        themeObserver = new MutationObserver(function () {
          if (activeGeneration()) syncThemeClasses()
        })
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['style', 'class', 'data-theme', 'data-color-scheme'],
        })
      } catch (error) {
        log('theme-observer-failed', error)
      }
      try {
        if (themeMedia !== null && themeMedia.removeEventListener !== undefined) {
          themeMedia.removeEventListener('change', syncThemeClasses)
        }
        themeMedia = window.matchMedia('(prefers-color-scheme: dark)')
        if (themeMedia.addEventListener !== undefined) themeMedia.addEventListener('change', syncThemeClasses)
      } catch (error) {
        log('theme-media-failed', error)
      }
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
      if (themeObserver !== null) {
        try {
          themeObserver.disconnect()
        } catch (error) {
          log('theme-observer-disconnect-failed', error)
        }
        themeObserver = null
      }
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
        loadConfig()
        watchTheme()
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