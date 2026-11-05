import { currenciesOf, totalsFor } from './derive'
import { METHOD_LABEL, STATUS_LABEL, type Creditor, type DebtBalance, type Payment } from './types'
import { decimalsFor, todayNairobi } from './money'

const money = (n: number, cur: string) =>
  `${cur} ${n.toLocaleString('en-KE', { minimumFractionDigits: decimalsFor(cur), maximumFractionDigits: decimalsFor(cur) })}`

// The PDF libraries are large, so they load only when someone taps "Download PDF".
export async function exportPDF(opts: { debts: DebtBalance[]; payments: Payment[]; creditors: Creditor[]; name?: string | null }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF()
  const cn = (id: string) => opts.creditors.find((c) => c.id === id)?.name ?? ''
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 30
  const head = { fillColor: [11, 31, 58] as [number, number, number] }

  doc.setFontSize(18)
  doc.text('OweWise statement', 14, 18)
  doc.setFontSize(10)
  doc.text(`${opts.name ? opts.name + ' · ' : ''}Generated ${todayNairobi()}`, 14, 25)

  const active = opts.debts.filter((d) => !d.archived_at)
  autoTable(doc, {
    startY: 31,
    head: [['Currency', 'Total owed', 'Overdue', 'Paid so far']],
    body: currenciesOf(active).map((c) => {
      const t = totalsFor(active, c)
      return [c, money(t.outstanding, c), money(t.overdue, c), money(t.paid, c)]
    }),
    headStyles: head,
    styles: { fontSize: 9 },
  })

  autoTable(doc, {
    startY: lastY() + 8,
    head: [['Creditor', 'Debt', 'Due', 'Status', 'Total due', 'Paid', 'Owed now']],
    body: active.map((d) => [cn(d.creditor_id), d.description, d.due_date ?? '', STATUS_LABEL[d.status], money(d.total_due, d.currency), money(d.paid_total, d.currency), money(d.outstanding, d.currency)]),
    headStyles: head,
    styles: { fontSize: 8 },
  })

  autoTable(doc, {
    startY: lastY() + 8,
    head: [['Date', 'Debt', 'Type', 'Amount', 'Method', 'Reference']],
    body: opts.payments.map((p) => [
      p.paid_on,
      opts.debts.find((d) => d.id === p.debt_id)?.description ?? '',
      p.kind === 'reversal' ? 'Reversal' : 'Payment',
      (p.kind === 'reversal' ? '-' : '') + money(p.amount, p.currency),
      METHOD_LABEL[p.method],
      p.reference ?? '',
    ]),
    headStyles: head,
    styles: { fontSize: 8 },
  })

  doc.save(`owewise-statement-${todayNairobi()}.pdf`)
}
