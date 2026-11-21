/**
 * dossier: the page a person reads about one sealed record, beside the receipt a
 * verifier reads. Used by inspector.mjs, which writes one page per record.
 *
 * It says, in plain words, what the receipt proves (this record, exactly as shown,
 * was sealed at that time and has not changed since), and, when the record names
 * a regime pack, which article each field relates to according to that pack, and
 * whether every field the pack lists as required for the kind is present.
 *
 * It also says what it does not prove, because a document put before a supervisor
 * or a court is only as good as its limits are clear: not that the content is true
 * or complete, not that the decision was right, and not that any law was complied
 * with. The pack's article summaries are RiskRouter's reading; the official text is
 * linked, and only the Official Journal is authentic. Whether a record meets an
 * article is for the firm, its advisers, and in the end a supervisor or a court.
 *
 * No dependencies. Apache-2.0, like the rest of recorders/.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The fields every pack record carries (tools/records.mjs, COMMON_FIELDS). */
const COMMON_REQUIRED = ['pack', 'pack_version', 'kind', 'record_id'];

/**
 * Where a record stands against its pack. Presence only: the fields' formats are
 * checked by the pack's validator (tools/records.mjs, validateRecord), not here.
 * Returns null when the record names no pack or the pack is not the one given.
 */
export function packCoverage(record, pack) {
  if (!pack || !record || record.pack !== pack.id) return null;
  const kind = (pack.kinds || []).find((k) => k.kind === record.kind);
  const base = { pack: pack.id, pack_title: pack.title, pack_version: pack.version, version_matches: record.pack_version === pack.version };
  if (!kind) return { ...base, kind: null };
  const articles = new Map((pack.articles || []).map((a) => [a.id, a]));
  const instruments = new Map((pack.instruments || []).map((i) => [i.id, i]));
  const required = [...COMMON_REQUIRED, ...kind.fields.filter((f) => f.required).map((f) => f.name)];
  const missing = required.filter((n) => !(n in record));
  const byArticle = new Map();
  for (const f of kind.fields) {
    for (const id of f.evidences || []) {
      if (!byArticle.has(id)) byArticle.set(id, { recorded: [], absent: [] });
      byArticle.get(id)[f.name in record ? 'recorded' : 'absent'].push(f.name);
    }
  }
  const fieldArticles = {};
  for (const f of kind.fields) if (f.name in record) fieldArticles[f.name] = (f.evidences || []).map((id) => articleRef(articles.get(id), instruments));
  return {
    ...base,
    kind: kind.kind,
    kind_title: kind.title,
    required: required.length,
    missing,
    field_articles: fieldArticles,
    articles: [...byArticle.entries()].map(([id, f]) => {
      const a = articles.get(id);
      const inst = instruments.get(a?.instrument);
      return { id, ref: articleRef(a, instruments), asks: a?.asks || '', source: inst?.source || '', recorded: f.recorded, absent: f.absent };
    })
  };
}

function articleRef(a, instruments) {
  if (!a) return '';
  const inst = instruments.get(a.instrument);
  return `${inst ? inst.name : a.instrument}, ${a.ref}`;
}

const value = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

/**
 * One page about one record. Every value is escaped; the page runs no script and
 * makes no request (the links are for the reader to follow).
 */
export function dossierHtml({ record, entry, receipt, coverage, packFile = null, signingKey = 'signing-key.json' }) {
  const label = record.record_id || record.file_name || record.source_ref || entry.record_digest.slice(0, 16);
  const rows = Object.keys(record).map((k) => {
    const refs = coverage?.field_articles?.[k] || [];
    return `<tr><th scope="row"><code>${esc(k)}</code></th><td>${esc(value(record[k]))}</td><td>${refs.map(esc).join('<br>')}</td></tr>`;
  }).join('\n');

  let packPart = '<p>The record names no regime pack, so no field is related to an article here.</p>';
  if (record.pack && !coverage) {
    packPart = `<p>The record names the pack <code>${esc(record.pack)}</code>, but that pack was not available when this file was made, so no field is related to an article here.</p>`;
  } else if (coverage && !coverage.kind) {
    packPart = `<p>The record names the pack <code>${esc(coverage.pack)}</code>, which has no kind <code>${esc(record.kind)}</code>.</p>`;
  } else if (coverage) {
    const fieldsLine = coverage.missing.length
      ? `<p><strong>Not every required field is present.</strong> The pack lists ${esc(coverage.required)} required fields for this kind; missing: ${coverage.missing.map((m) => `<code>${esc(m)}</code>`).join(', ')}.</p>`
      : `<p>All ${esc(coverage.required)} fields the pack lists as required for this kind are present. (Presence only: the pack's validator checks their formats.)</p>`;
    const versionLine = coverage.version_matches ? ''
      : `<p><strong>The record says pack version ${esc(record.pack_version)}; the pack in this file is version ${esc(coverage.pack_version)}.</strong></p>`;
    const art = coverage.articles.map((a) => `<tr><td>${a.source ? `<a href="${esc(a.source)}">${esc(a.ref)}</a>` : esc(a.ref)}</td><td>${esc(a.asks)}</td>` +
      `<td>${a.recorded.length ? a.recorded.map((f) => `<code>${esc(f)}</code>`).join(', ') : '<em>none recorded</em>'}</td>` +
      `<td>${a.absent.map((f) => `<code>${esc(f)}</code>`).join(', ')}</td></tr>`).join('\n');
    packPart = `<p>This record is a <em>${esc(coverage.kind_title)}</em> (<code>${esc(coverage.kind)}</code>) of the pack
<em>${esc(coverage.pack_title)}</em>, version ${esc(coverage.pack_version)}${packFile ? ` (<a href="../${esc(packFile)}">the pack as used</a>)` : ''}.</p>
${versionLine}${fieldsLine}
<table><thead><tr><th>Article</th><th>What the article asks, in our words</th><th>Fields recorded for it</th><th>Its fields not in this record</th></tr></thead>
<tbody>
${art}
</tbody></table>
<p class="note">The summaries in the second column are RiskRouter's reading of each article, not the law. Follow the link for the official text;
only the version published in the Official Journal of the European Union is authentic.</p>`;
  }

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Evidence dossier: entry ${esc(entry.leaf_index)}</title>
<style>body{font:15px/1.55 Georgia,serif;margin:2rem auto;max-width:56rem;padding:0 1rem;color:#1a1a1a;background:#fff}
h1,h2{font-family:system-ui,sans-serif}table{border-collapse:collapse;width:100%;font-size:13px;margin:.5rem 0}
th,td{border-bottom:1px solid #ddd;padding:.35rem .5rem;text-align:left;vertical-align:top}code{font-family:ui-monospace,monospace;font-size:12px}.fp{word-break:break-all}
.note{color:#555;font-size:13px}dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem}dt{font-weight:bold}dd{margin:0}</style></head>
<body>
<p><a href="../index.html">All records in this file</a></p>
<h1>Evidence dossier: ${esc(label)}</h1>
<dl>
<dt>Log entry</dt><dd>${esc(entry.leaf_index)}</dd>
<dt>Sealed at</dt><dd>${esc(entry.created_at)} (UTC, the log's time)</dd>
<dt>Kind</dt><dd><code>${esc(record.kind)}</code></dd>
<dt>Fingerprint</dt><dd><code class="fp">${esc(entry.record_digest)}</code></dd>
<dt>Receipt</dt><dd><a href="../${esc(receipt)}">${esc(receipt)}</a></dd>
</dl>

<h2>What this shows</h2>
<p>The record below, with its salt, gives the fingerprint above. That fingerprint became entry ${esc(entry.leaf_index)} of a public,
append-only log at ${esc(entry.created_at)}. So this record existed in exactly this form no later than that moment, and it has not been changed
since: changing any character of it, or of its salt, gives a different fingerprint, and the log cannot change or remove an entry without its
signed history, and the independent witnesses that co-sign it, showing the change. The record itself never left its holder; only the
fingerprint was sent.</p>

<h2>Against its regime pack</h2>
${packPart}

<h2>What this does not show</h2>
<ul>
<li>That the record's content is true, complete or correct, or that the decision it describes was the right one. It shows only that the
content has not changed since it was sealed.</li>
<li>That any law was complied with. The pack says which article each field relates to; whether this record meets that article is for the
firm, its advisers and, in the end, a supervisor or a court.</li>
<li>That a court will accept it. Admissibility and weight are for the court. The log's time is not a qualified electronic time stamp
under Regulation (EU) No 910/2014 (eIDAS), Article 41(2), unless the receipt says otherwise.</li>
</ul>

<h2>How to check it yourself, without RiskRouter</h2>
<ol>
<li>Check the receipt offline: <code>python3 riskrouter_verify.py ${esc(receipt)} --key ${esc(signingKey)}</code>. The verifier is one file,
standard library only, published at https://github.com/aniljangrabe-dev/riskrouter-verify.</li>
<li>Compare <code>${esc(signingKey)}</code> with the key published in that repository (<code>anchors/</code>), so the key is not only ours to vouch for.</li>
<li>Compare the record below with the one in the receipt: they must be identical, field for field.</li>
</ol>

<h2>The record</h2>
<table><thead><tr><th>Field</th><th>Value</th><th>Relates to, according to the pack</th></tr></thead>
<tbody>
${rows}
</tbody></table>
</body></html>
`;
}
