import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

/** The "···" menu on a table row. Closes on outside click or Escape. */
export default function RowMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return <div className="row-menu" ref={ref}>
    <button type="button" className="row-more" aria-label={`More options for ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>···</button>
    {open && <div className="row-menu-pop" role="menu">{items.map((item) => item.onClick
      ? <button key={item.label} type="button" role="menuitem" className={item.danger ? "row-menu-danger" : ""} onClick={() => { setOpen(false); item.onClick(); }}>{item.label}</button>
      : <Link key={item.to} role="menuitem" to={item.to} onClick={() => setOpen(false)}>{item.label}</Link>)}</div>}
  </div>;
}
