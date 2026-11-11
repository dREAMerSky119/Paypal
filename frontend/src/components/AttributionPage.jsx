import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { usedSources, notUsedYet } from "../data/attribution.js";
import "../attribution.css";

export default function AttributionPage() {
  return (
    <main className="attr-page" id="main">
      <Link className="back-link" to="/home"><ArrowLeft size={15} aria-hidden="true" /> Back to Wayfare</Link>
      <p className="eyebrow">DATA SOURCES</p>
      <h1>Sources and attribution</h1>
      <p className="attr-lead">
        Everything you see in Wayfare is either <strong>sample data</strong> (seeded or simulated, never a live rate,
        booking or availability) or comes from the open sources below, under the licences shown.
      </p>
      <div className="attr-scroll">
        <table className="attr-table">
          <caption className="sr-only">Data sources, what each is used for, and its licence</caption>
          <thead><tr><th scope="col">Source</th><th scope="col">Used for</th><th scope="col">Licence</th></tr></thead>
          <tbody>
            {usedSources.map((s) => (
              <tr key={s.name}>
                <th scope="row"><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a><small>{s.by}</small></th>
                <td>{s.use}</td>
                <td>{s.licence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Not used yet</h2>
      <ul className="attr-list">
        {notUsedYet.map((s) => <li key={s.name}><strong>{s.name}.</strong> {s.note}</li>)}
      </ul>
      <p className="attr-foot">
        Share-alike text (Wikipedia, Wikivoyage) keeps its contributor credit where it is shown. Suppliers, rates, bookings,
        responsible-travel claims and simulator events are synthetic samples. Full detail: <code>docs/data-sources.md</code>.
      </p>
    </main>
  );
}
