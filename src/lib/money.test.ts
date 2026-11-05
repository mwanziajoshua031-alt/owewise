import { describe, it, expect } from 'vitest'
import {
  toMinor, fromMinor, sumByCurrency, parseAmountInput, planRepayment, addMonthsISO, formatMoney,
} from './money'

describe('minor units', () => {
  it('avoids float drift', () => {
    expect(toMinor(0.1 + 0.2, 'KES')).toBe(30)
    expect(fromMinor(toMinor('1,234.56', 'KES'), 'KES')).toBe(1234.56)
  })
  it('handles zero-decimal currencies', () => {
    expect(toMinor(1500, 'UGX')).toBe(1500)
  })
  it('rejects garbage', () => {
    expect(() => toMinor('abc', 'KES')).toThrow()
  })
})

describe('sumByCurrency', () => {
  it('never mixes currencies', () => {
    const r = sumByCurrency([
      { currency: 'KES', amount: 0.1 },
      { currency: 'KES', amount: 0.2 },
      { currency: 'USD', amount: 5 },
    ])
    expect(r).toEqual({ KES: 0.3, USD: 5 })
  })
})

describe('parseAmountInput', () => {
  it('validates', () => {
    expect(parseAmountInput('', 'KES').ok).toBe(false)
    expect(parseAmountInput('-5', 'KES').ok).toBe(false)
    expect(parseAmountInput('0', 'KES').ok).toBe(false)
    expect(parseAmountInput('10.123', 'KES').ok).toBe(false)
    expect(parseAmountInput('1000000000', 'KES').ok).toBe(false)
    expect(parseAmountInput('1,500.50', 'KES')).toEqual({ ok: true, value: 1500.5 })
  })
})

describe('planRepayment', () => {
  const debts = [
    { id: 'a', name: 'A', outstanding: 1000, dueDate: '2026-12-01' },
    { id: 'b', name: 'B', outstanding: 300, dueDate: '2026-11-15' },
    { id: 'c', name: 'C', outstanding: 700, dueDate: null },
  ]
  it('snowball clears smallest first and rolls over', () => {
    const p = planRepayment(debts, 500, 'KES', 'smallest_first')
    expect(p.months).toBe(4) // 2000 / 500
    expect(p.payoffOrder[0].id).toBe('b')
    expect(p.totalPaid).toBe(2000)
  })
  it('due-date strategy orders by due date', () => {
    const p = planRepayment(debts, 500, 'KES', 'due_date')
    expect(p.payoffOrder[0].id).toBe('b')
    expect(p.payoffOrder[1].id).toBe('a')
  })
  it('zero budget never finishes', () => {
    expect(planRepayment(debts, 0, 'KES', 'smallest_first').months).toBeNull()
  })
  it('nothing owed = 0 months', () => {
    expect(planRepayment([], 500, 'KES', 'smallest_first').months).toBe(0)
  })
})

describe('dates', () => {
  it('clamps month ends', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
  })
  it('formats KES', () => {
    expect(formatMoney(1500, 'KES')).toContain('1,500')
  })
})
