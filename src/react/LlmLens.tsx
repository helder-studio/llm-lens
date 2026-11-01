import { type CSSProperties, useState } from 'react';
import type { LlmCall } from '../core/store';
import { llmLens } from '../lens';
import { describeCall, type LlmLensProps, summary, useActivation, useCalls } from './shared';

/** Web: records LLM calls and shows a badge; click it for the call list. */
export function LlmLens(props: LlmLensProps & { children?: React.ReactNode }) {
  useActivation(props);
  return (
    <>
      {props.children}
      {props.enabled && props.badge !== false && <WebLens />}
    </>
  );
}

const font = '13px system-ui, sans-serif';
const muted: CSSProperties = { color: '#5f6368' };

function WebLens() {
  const calls = useCalls();
  const [open, setOpen] = useState(false);
  const totals = llmLens.totals();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed',
          left: 12,
          bottom: 52,
          zIndex: 2147483647,
          padding: '6px 12px',
          border: 0,
          borderRadius: 999,
          font: '600 12px system-ui, sans-serif',
          color: '#fff',
          background: totals.errors ? '#d93025' : '#0b57d0',
          cursor: 'pointer',
        }}
      >
        {`🤖 ${summary(totals)}`}
      </button>
      {open && (
        <section
          aria-label="LLM calls"
          style={{
            position: 'fixed',
            left: 12,
            bottom: 92,
            zIndex: 2147483647,
            width: 420,
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: '70vh',
            overflow: 'auto',
            padding: 16,
            borderRadius: 12,
            background: '#fff',
            color: '#202124',
            boxShadow: '0 8px 32px rgba(0,0,0,.24)',
            font,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>LLM calls</strong>
            <button type="button" onClick={llmLens.clear}>
              Clear
            </button>
          </div>
          {calls.length === 0 && <p style={muted}>No LLM calls yet.</p>}
          {calls.map((call) => (
            <CallRow key={call.id} call={call} />
          ))}
        </section>
      )}
    </>
  );
}

function CallRow({ call }: { call: LlmCall }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ borderTop: '1px solid #f1f3f4', padding: '8px 0' }}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none',
          border: 0,
          padding: 0,
          color: 'inherit',
          font: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        {describeCall(call)}
      </button>
      {expanded && (
        <dl
          style={{
            margin: '6px 0 0',
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '2px 8px',
          }}
        >
          <dt style={muted}>URL</dt>
          <dd style={{ margin: 0, wordBreak: 'break-all' }}>{call.url}</dd>
          {call.stopReason && (
            <>
              <dt style={muted}>Stop</dt>
              <dd style={{ margin: 0 }}>{call.stopReason}</dd>
            </>
          )}
          {call.error && (
            <>
              <dt style={muted}>Error</dt>
              <dd style={{ margin: 0, color: '#d93025' }}>{call.error}</dd>
            </>
          )}
          {call.prompt && (
            <>
              <dt style={muted}>Prompt</dt>
              <dd style={{ margin: 0 }}>{call.prompt}</dd>
            </>
          )}
          {call.response && (
            <>
              <dt style={muted}>Reply</dt>
              <dd style={{ margin: 0 }}>{call.response}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
