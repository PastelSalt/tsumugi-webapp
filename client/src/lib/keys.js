// OS-aware keyboard labels. Detection only changes what is shown, never what works (both Ctrl and Cmd are accepted).
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')
export const modKey = isMac ? '⌘' : 'Ctrl'
export const shortcutLabel = (key) => (isMac ? `${modKey}${key}` : `${modKey}+${key}`)
