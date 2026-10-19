/**
 * dsh-file-menu 文案字典（唯一权威副本）。
 *
 * 客户端 bundle（lib/client.js）是 classic script，不能 import 本文件，
 * 因此 lib/client.js 顶部有一份内联镜像；两者由
 * 06-脚本与工具/脚本/check-labels.mjs 断言逐字一致，改文案必须两边同改。
 *
 * 第一版只交付中文；英文词典留空，发布前补。
 */

/** @typedef {{ copyAbsPath: string, revealInExplorer: string, openWithDefault: string, notFound: string, failed: string, multiple: string, openWith: string, noHandler: string, loading: string }} MenuLabels */

/** @type {Record<string, MenuLabels>} */
export const LABELS = {
  'zh-CN': {
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
  // TODO: 待补 en 文案 → 发布前（见 TODO.md）
  // en: {
  //   copyAbsPath: 'Copy absolute path',
  //   revealInExplorer: 'Reveal in Explorer',
  //   openWithDefault: 'Open with default app',
  // },
}

/**
 * 按浏览器语言挑一组文案，取不到或没有对应语言时一律回退中文。
 * @param {string} [lang]
 * @returns {MenuLabels}
 */
export function pickLabels(lang) {
  let value = ''
  try {
    value = typeof lang === 'string' && lang !== '' ? lang : typeof navigator === 'undefined' ? '' : String(navigator.language || '')
  } catch {
    value = ''
  }
  const exact = LABELS[value]
  if (exact !== undefined) return exact
  const short = value.split('-')[0]
  const byShort = short === '' ? undefined : LABELS[short]
  if (byShort !== undefined) return byShort
  return LABELS['zh-CN']
}
