import { useState } from 'react'
import { Search } from 'lucide-react'
import Modal from './Modal'
import { useWorkspace } from '../context'
import { shortcutLabel } from '../../../lib/keys'

const SHORTCUTS = [
  ['Open Quick add', 'Q', 'Single key; only when shortcuts are on and you are not typing'],
  ['Search or jump to', shortcutLabel('K'), 'Opens the command palette'],
  ['Undo the last change', shortcutLabel('Z'), 'Up to 20 changes, this visit only'],
  ['Show this list', '?', 'Single key; only when shortcuts are on'],
  ['Close a dialog, menu, or panel', 'Esc', ''],
  ['Add the task in Quick add', 'Enter', 'The dialog stays open for the next one'],
  ['Move in the palette', '↑ ↓', 'Enter opens the highlighted result'],
]

export default function ShortcutsDialog({ open, onClose }) {
  const { shortcuts, setShortcuts } = useWorkspace()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const list = q ? SHORTCUTS.filter(([name, keys, note]) => `${name} ${keys} ${note}`.toLowerCase().includes(q)) : SHORTCUTS
  return (
    <Modal open={open} onClose={() => { setQuery(''); onClose() }} label="Keyboard shortcuts" className="ws-modal--shortcuts">
      <div className="ws-modal__head"><h2 className="ws-modal__title">Keyboard shortcuts</h2><p className="ws-modal__lede">Everything here can also be done with the mouse or touch.</p></div>
      <label className="ws-search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">Search shortcuts</span><input type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shortcuts" /></label>
      <dl className="shortcut-list">
        {list.map(([name, keys, note]) => (
          <div key={name}><dt>{name}{note && <small>{note}</small>}</dt><dd><kbd>{keys}</kbd></dd></div>
        ))}
      </dl>
      {!list.length && <p className="muted">No shortcut matches “{query}”.</p>}
      <label className="field--check"><input type="checkbox" checked={shortcuts} onChange={(event) => setShortcuts(event.target.checked)} /> <span>Single-key shortcuts (Q and ?)</span></label>
      <div className="ws-modal__actions"><button className="button button--small button--secondary" type="button" onClick={onClose}>Close</button></div>
    </Modal>
  )
}
