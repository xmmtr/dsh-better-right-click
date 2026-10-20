/**
 * dsh-file-menu 文案字典（唯一权威副本）。
 *
 * 客户端 bundle（lib/client.js）是 classic script，不能 import 本文件，
 * 因此 lib/client.js 顶部有一份内联镜像；两者由
 * 06-脚本与工具/脚本/check-labels.mjs 断言逐字一致，改文案必须两边同改。
 *
 * 语言跟随 DSH 的 locale（`ctx.locale.getSnapshot().active`），
 * 取不到时退回 `<html lang>`，再退回 `navigator.language`；
 * 三种都拿不到或语言不认识时用英文（与 DSH 自身的回退一致）。
 */

/** @typedef {{ copyAbsPath: string, copyRelPath: string, revealInExplorer: string, openWithDefault: string, notFound: string, failed: string, multiple: string, openWith: string, noHandler: string, loading: string, menuSettings: string, settingsTitle: string, settingsItems: string, itemOpenWith: string, settingsFileManager: string, fmAuto: string, fmExplorer: string, fmCustom: string, customHint: string, save: string, cancel: string, saved: string, keepOne: string, detectedOther: string, revealDetected: string, relativeFallback: string, pinSection: string, pinCurrent: string, pinNone: string, pinnedOpen: string, otherApp: string }} MenuLabels */

/** @type {Record<string, MenuLabels>} */
export const LABELS = {
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
      pinCurrent: '当前文件类型：{name}',
      pinNone: '不固定（每次都列出全部程序）',
      pinnedOpen: '用 {name} 打开（已固定）',
      otherApp: '用其他程序打开…',
    reorderHint: '↑ ↓ 调整菜单里的先后顺序',
    moveUp: '上移',
    moveDown: '下移',
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
      pinCurrent: 'Current file type: {name}',
      pinNone: 'Not pinned (list every app each time)',
      pinnedOpen: 'Open with {name} (pinned)',
      otherApp: 'Open with another app…',
    reorderHint: 'Use ↑ ↓ to change the order shown in the menu',
    moveUp: 'Move up',
    moveDown: 'Move down',
    },
  }

/**
 * 把任意 BCP 47 标签收敛到我们支持的两个语言键。
 * @param {string} value
 * @returns {string} 'zh' / 'en' / ''
 */
export function languageKey(value) {
  const lower = String(value === undefined || value === null ? '' : value).toLowerCase()
  if (lower === '') return ''
  if (lower.startsWith('zh')) return 'zh'
  if (lower.startsWith('en')) return 'en'
  return ''
}

/**
 * 按给定语言挑一组文案；不知道的语言一律回退英文。
 * @param {string} [lang]
 * @returns {MenuLabels}
 */
export function pickLabels(lang) {
  let value = ''
  try {
    if (typeof lang === 'string' && lang !== '') value = lang
    else if (typeof navigator === 'undefined') value = ''
    else value = String(navigator.language || '')
  } catch {
    value = ''
  }
  const key = languageKey(value)
  if (key !== '' && LABELS[key] !== undefined) return LABELS[key]
  return LABELS.en
}
