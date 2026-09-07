/** Todas as transações, agrupadas por mês: abre pelo "Ver tudo". */
import type { Txn } from '../lib/txns'
import TxnRow from './TxnRow'

function Topbar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="wallet__topbar">
      <button className="wallet__icon-btn" type="button" onClick={onBack} aria-label="Voltar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="15" y1="5" x2="8" y2="12" />
          <line x1="15" y1="19" x2="8" y2="12" />
        </svg>
      </button>
      <h2 className="settings__title">{title}</h2>
      <span className="settings__spacer" aria-hidden="true" />
    </div>
  )
}

export default function Txns({ txns, onBack, onSelect }: { txns: Txn[]; onBack: () => void; onSelect: (t: Txn) => void }) {
  /* Meses na ordem em que aparecem: o depósito novo abre o grupo do mês atual no topo. */
  const months = [...new Set(txns.map((t) => t.month))]
  return (
    <section className="wallet" aria-label="Transações">
      <Topbar title="Transações" onBack={onBack} />
      <div className="settings-scroll">
        {months.map((m) => (
          <div key={m}>
            <h3 className="txns-month">{m}</h3>
            <ul className="txns-list">
              {txns.filter((t) => t.month === m).map((t) => (
                <li key={t.id} className="txns-item">
                  <TxnRow txn={t} onSelect={() => onSelect(t)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
