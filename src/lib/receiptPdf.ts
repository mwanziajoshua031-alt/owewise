import type { Receipt } from './biz'
import { formatMoney } from './money'

/** Builds a simple one-page receipt PDF. jsPDF loads only when needed. */
export async function downloadReceipt(r: Receipt): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  let y = 18
  doc.setFontSize(18).setFont('helvetica', 'bold').text('Payment receipt', 14, y); y += 8
  doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(100).text(`Receipt no. ${r.receipt_no}`, 14, y); y += 10
  doc.setTextColor(0)
  const rows: [string, string][] = [
    ['Business', r.business_name], ['Paid by', r.customer_name], ['For', r.debt_description],
    ['Amount paid', formatMoney(r.amount, r.currency)],
    ['Method', r.method === 'mpesa_stk' ? 'M-Pesa' : r.method === 'cash' ? 'Cash' : 'Other'],
    ...(r.mpesa_receipt ? [['M-Pesa code', r.mpesa_receipt] as [string, string]] : []),
    ['Balance after payment', formatMoney(r.balance_after, r.currency)],
    ['Date', new Date(r.issued_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })],
  ]
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'bold').text(k, 14, y)
    doc.setFont('helvetica', 'normal').text(doc.splitTextToSize(v, 80), 58, y)
    y += 7 * Math.max(1, doc.splitTextToSize(v, 80).length)
  }
  y += 6
  doc.setFontSize(8).setTextColor(120).text('Issued through OweWise. This receipt records a payment made to the business named above.', 14, y, { maxWidth: 120 })
  doc.save(`${r.receipt_no}.pdf`)
}
