/** Linha de transação clicável: avatar, nome, data e valor. */
import { brl, type Txn } from '../lib/txns'

/* Saque e transferência usam viewBox recortado no contorno do desenho;
   depósito usa o mesmo "+" do botão Depositar. */
export function TxnIcon({ kind }: { kind: Txn['kind'] }) {
  if (kind === 'saque') {
    return (
      <svg viewBox="19 19 62 62" fill="currentColor" aria-hidden="true">
        <path d="M80,38.8a18.69,18.69,0,0,0-5.22-13.58c-5-5-12.73-6.46-21.31-4.12l-1.15.34A3.19,3.19,0,0,0,50,24.08a3,3,0,0,0,1.12,2.64,2.89,2.89,0,0,0,2.73.52c7-2.21,13.05-1.41,16.68,2.22A12.84,12.84,0,0,1,74,38.8c0,6.09-3,13.41-8.21,20.08L64,61.16V51a3,3,0,0,0-1-2.22A3,3,0,0,0,61,48h-.3A3.12,3.12,0,0,0,58,51.17V63a7,7,0,0,0,7,7H77a3,3,0,0,0,3-3.3A3.12,3.12,0,0,0,76.83,64H69.42l1.25-1.61C76.69,54.63,80,46.25,80,38.8Z" />
        <path d="M20,61.2a18.69,18.69,0,0,0,5.22,13.58c5,5,12.73,6.46,21.31,4.12q.72-.2,1.44-.43a3,3,0,0,0,2-3.49,2.81,2.81,0,0,0-1.34-1.85,3.4,3.4,0,0,0-2.72-.29C39,75,33,74.12,29.46,70.54A12.84,12.84,0,0,1,26,61.2c0-6.09,3-13.41,8.21-20.08L36,38.84V49a3,3,0,0,0,3.3,3A3.12,3.12,0,0,0,42,48.83V37a7,7,0,0,0-7-7H23.17A3.12,3.12,0,0,0,20,32.7,3,3,0,0,0,23,36h7.58l-1.25,1.61C23.31,45.37,20,53.75,20,61.2Z" />
      </svg>
    )
  }
  if (kind === 'deposito') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="4" y1="12" x2="20" y2="12" />
      </svg>
    )
  }
  return (
    <svg viewBox="18 18 64 64" fill="currentColor" aria-hidden="true">
      <path d="M66.5,56a12.56,12.56,0,0,0-10.79,6.22l-.39.68-.75-.22a15.78,15.78,0,0,0-9.12,0l-.75.22-.4-.68A12.49,12.49,0,1,0,46,69.47l.05-.65.62-.22a9.76,9.76,0,0,1,6.77,0l.62.22.05.65A12.49,12.49,0,1,0,66.5,56Zm-33,19A6.5,6.5,0,1,1,40,68.5,6.51,6.51,0,0,1,33.5,75Zm33,0A6.5,6.5,0,1,1,73,68.5,6.51,6.51,0,0,1,66.5,75Z" />
      <path d="M81,45a3,3,0,0,0-3-3H72.51L68.75,27.91A12,12,0,0,0,57.16,19H42.84a12,12,0,0,0-11.59,8.91L27.49,42H22a3,3,0,0,0,0,6H78A3,3,0,0,0,81,45ZM33.7,42,37,29.45A6,6,0,0,1,42.84,25H57.16A6,6,0,0,1,63,29.45L66.3,42Z" />
    </svg>
  )
}

export default function TxnRow({ txn, onSelect }: { txn: Txn; onSelect: () => void }) {
  return (
    <button className="txn-btn" type="button" onClick={onSelect} aria-label={`${txn.name}, ${brl(txn.value)}`}>
      <span className="wallet__txn-avatar" aria-hidden="true">
        <TxnIcon kind={txn.kind} />
      </span>
      <span className="wallet__txn-info">
        <span className="wallet__txn-name">{txn.name}</span>
        <span className="wallet__txn-meta">
          <span className="wallet__txn-date">{txn.date}</span>
          <span className={`wallet__txn-value wallet__txn-value--${txn.dir}`}>
            {txn.dir === 'out' ? '- ' : '+ '}
            {brl(txn.value)}
          </span>
        </span>
      </span>
    </button>
  )
}
