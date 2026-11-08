import type { BizDebt } from './biz'
import { formatMoney } from './money'

/** One-customer statement: every debt with amount, paid and balance. jsPDF loads only when needed. */
export async function downloadStatement(business: string, customer: string, phone: string, debts: BizDebt[]): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 18
  doc.setFontSize(16).setFont('helvetica', 'bold').text(`Statement for ${customer}`, 14, y); y += 7
  doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(100).text(`${business} · ${phone} · ${new Date().toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi' })}`, 14, y); y += 10
  doc.setTextColor(0).setFont('helvetica', 'bold')
  doc.text('For', 14, y); doc.text('Due', 105, y); doc.text('Amount', 135, y); doc.text('Paid', 160, y); doc.text('Balance', 182, y)
  y += 2; doc.line(14, y, 200, y); y += 6
  doc.setFont('helvetica', 'normal')
  const totals: Record<string, number> = {}
  for (const d of debts) {
    if (y > 275) { doc.addPage(); y = 18 }
    doc.text(doc.splitTextToSize(d.description, 85)[0], 14, y)
    doc.text(d.due_date, 105, y)
    doc.text(formatMoney(d.amount, d.currency), 135, y)
    doc.text(formatMoney(d.paid_total, d.currency), 160, y)
    doc.text(formatMoney(d.outstanding, d.currency), 182, y)
    totals[d.currency] = (totals[d.currency] ?? 0) + d.outstanding
    y += 7
  }
  y += 4; doc.setFont('helvetica', 'bold')
  for (const [c, v] of Object.entries(totals)) { doc.text(`Total balance (${c}): ${formatMoney(v, c)}`, 14, y); y += 7 }
  doc.save(`statement-${customer.replace(/\W+/g, '-').toLowerCase()}.pdf`)
}
