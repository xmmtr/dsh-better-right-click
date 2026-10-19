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

/** @typedef {{ copyAbsPath: string, revealInExplorer: string, openWithDefault: string, notFound: string, failed: string, multiple: string, openWith: string, noHandler: string, loading: string }} MenuLabels */

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
