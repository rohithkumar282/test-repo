import React, { useEffect, useState } from "react";

const INGEST_URL = process.env.REACT_APP_INGEST_URL || "";

export default function App() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!INGEST_URL) {
      setError("No INGEST_URL provided");
      return;
    }

    async function fetchPayload() {
      try {
        const res = await fetch(INGEST_URL);
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }
        const data = await res.json(); 
        setPayload(data);
      } catch (err) {
        setError(err.message);
      }
    }

    fetchPayload();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Streaming Demo</h1>

      <section className="p-4 rounded bg-gray-100">
        <div className="font-semibold mb-1">Ingest URL (from env)</div>
        <code className="text-sm break-all">
          {INGEST_URL || "(not set — ensure REACT_APP_INGEST_URL is passed to the build)"}
        </code>
      </section>

      <section className="p-4 rounded bg-gray-100">
        <div className="font-semibold mb-2">Payload (fetched)</div>
        {error ? (
          <div className="text-red-500">Error: {error}</div>
        ) : (
          <pre className="text-sm">
            {payload ? JSON.stringify(payload, null, 2) : "(waiting for payload…)"}
          </pre>
        )}
      </section>
    </div>
  );
}
