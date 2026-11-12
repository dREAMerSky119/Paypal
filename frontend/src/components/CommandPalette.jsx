import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, Search } from "lucide-react";
import { destinations } from "../data/destinations.js";
import { navItems } from "../data/navigation.js";
import { buildSearchIndex, searchIndex, inventoryResultsToItems } from "../lib/search.js";
import { api } from "../lib/api.js";

const REMOTE_MIN_CHARS = 2;
const REMOTE_DEBOUNCE_MS = 250;

const pages = navItems.map((item) => ({ label: item.label, to: item.to }));

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const index = useMemo(() => buildSearchIndex({ pages, destinations }), []);
  const [remote, setRemote] = useState([]);
  const local = useMemo(() => searchIndex(index, query, 8), [index, query]);
  // Pages and destinations first, then up to 5 inventory items from the API.
  const results = useMemo(() => [...local.slice(0, 6), ...remote].slice(0, 11), [local, remote]);

  // Inventory lives on the server. Debounced, cancellable, and silent on failure
  // (an asleep or offline API just means no inventory rows in the palette).
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < REMOTE_MIN_CHARS) { setRemote([]); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api(`/inventory?q=${encodeURIComponent(q)}&page_size=5`, { signal: controller.signal, timeout: 8000 })
        .then((data) => setRemote(inventoryResultsToItems(data, destinations)))
        .catch((err) => { if (err?.name !== "AbortError") setRemote([]); });
    }, REMOTE_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setRemote([]);
      setActive(0);
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const go = (item) => {
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === "Enter" && results[active]) { event.preventDefault(); go(results[active]); }
  };

  return <div className="palette-overlay" onMouseDown={onClose}>
    <div className="palette" role="dialog" aria-modal="true" aria-label="Search Wayfare" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
      <div className="palette-input"><Search size={16}/><input ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} placeholder="Search pages, destinations and inventory" aria-label="Search pages, destinations and inventory" role="combobox" aria-expanded="true" aria-controls="palette-results" aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}/><kbd>ESC</kbd></div>
      <ul id="palette-results" role="listbox" className="palette-results">
        {results.length === 0 && <li className="palette-empty">Nothing matches “{query}”. Packages and suppliers will appear here once they exist.</li>}
        {results.map((item, i) => <li key={item.id} id={`palette-${item.id}`} role="option" aria-selected={i === active} className={i === active ? "is-active" : ""} onMouseEnter={() => setActive(i)} onClick={() => go(item)}><span className="palette-type">{item.type.toUpperCase()}</span><span className="palette-label">{item.label}</span>{item.hint && <small>{item.hint}</small>}{i === active && <CornerDownLeft size={13}/>}</li>)}
      </ul>
    </div>
  </div>;
}
