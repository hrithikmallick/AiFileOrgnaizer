import { useState } from "react";
import { useApp } from "../store";
import type { SearchResult } from "../types";
import { CategoryBadge, EmptyState, FileTypeIcon, SourceBadge } from "../components/ui";
import { IconSearch } from "../components/icons";
import { formatBytes, formatNumber } from "../lib/format";

const EXAMPLES = [
  "find my AWS invoice",
  "show Docker notes",
  "machine-learning PDFs",
  "September bank statement",
];

export function SearchPage() {
  const { backend, notify } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (value = query) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      const next = await backend.search(trimmed);
      setResults(next);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="card">
        <div className="card-body stack">
          <form
            className="input-row"
            onSubmit={(event) => {
              event.preventDefault();
              void run();
            }}
          >
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by meaning, tags or filename..."
              autoFocus
            />
            <button className="btn primary" type="submit" disabled={busy}>
              <IconSearch size={16} /> Search
            </button>
          </form>
          <div className="row">
            <span className="hint">Examples:</span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                className="btn ghost sm"
                onClick={() => {
                  setQuery(example);
                  void run(example);
                }}
              >
                {example}
              </button>
            ))}
          </div>
          <p className="hint">Uses local embeddings when available. No LLM is invoked for search.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Results</h3>
          <span className="hint">{results ? `${formatNumber(results.length)} match(es)` : "Run a query"}</span>
        </div>
        {results === null ? (
          <EmptyState title="Semantic search is local" hint="Embeddings stay on this device. Try one of the example queries." icon={<IconSearch size={28} />} />
        ) : results.length === 0 ? (
          <EmptyState title="No matches" hint="Try a shorter query or a filename fragment." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Category</th>
                  <th>Match</th>
                  <th>Score</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.file.id}>
                    <td>
                      <div className="row">
                        <FileTypeIcon extension={result.file.extension} />
                        <div className="cell-name">
                          <span className="name">{result.file.name}</span>
                          <span className="path">{result.analysis?.summary ?? formatBytes(result.file.size)}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {result.analysis ? (
                        <CategoryBadge category={result.analysis.category} subcategory={result.analysis.subcategory} />
                      ) : (
                        <span className="badge neutral">Unclassified</span>
                      )}
                    </td>
                    <td><span className="badge neutral">{result.matchedOn}</span></td>
                    <td className="mono">{Math.round(result.score * 100)}%</td>
                    <td>{result.analysis ? <SourceBadge source={result.analysis.source} /> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
