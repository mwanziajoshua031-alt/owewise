export type DebtStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'disputed'

export type Profile = {
  id: string
  full_name: string | null
  phone: string | null
  country: string
  default_currency: string
  theme: 'light' | 'dark' | 'system'
  notification_prefs: { sms: boolean; email: boolean; days_before: number; overdue_digest: string }
}

export type Subscription = {
  id: string
  user_id: string
  plan: 'free' | 'premium'
  billing_interval: 'monthly' | 'annual' | null
  status: 'active' | 'canceled' | 'expired'
  current_period_end: string | null
  cancel_at_period_end: boolean
  provider: 'paystack' | 'mpesa' | null
}

export type Creditor = {
  id: string
  client_id: string | null
  name: string
  category: string | null
  contact_phone: string | null
  notes: string | null
  archived_at: string | null
  created_at: string
  pending?: boolean
}

export type DebtBalance = {
  id: string
  user_id: string
  creditor_id: string
  client_id: string | null
  description: string
  currency: string
  original_amount: number
  additional_charges: number
  charges_note: string | null
  incurred_on: string
  due_date: string | null
  notes: string | null
  is_disputed: boolean
  dispute_reason: string | null
  dispute_notes: string | null
  archived_at: string | null
  created_at: string
  total_due: number
  paid_total: number
  outstanding: number
  status: DebtStatus
  pending?: boolean
}

export type Payment = {
  id: string
  debt_id: string
  client_id: string | null
  kind: 'payment' | 'reversal'
  reverses_payment_id: string | null
  amount: number
  currency: string
  paid_on: string
  method: 'mpesa' | 'cash' | 'bank_transfer' | 'card' | 'other'
  reference: string | null
  note: string | null
  created_at: string
  pending?: boolean
}

export type Reminder = {
  id: string
  debt_id: string
  remind_on: string
  frequency: 'once' | 'daily' | 'weekly' | 'monthly'
  channels: string[]
  active: boolean
  last_sent_on: string | null
}

export type AppNotification = {
  id: string
  type: string
  title: string
  body: string | null
  debt_id: string | null
  read_at: string | null
  created_at: string
}

export type DocumentRow = {
  id: string
  debt_id: string | null
  payment_id: string | null
  kind: 'receipt' | 'invoice' | 'payment_confirmation' | 'statement' | 'other'
  title: string
  storage_path: string
  mime_type: string
  size_bytes: number
  created_at: string
}

export type Goal = {
  id: string
  title: string
  currency: string
  start_amount: number
  target_amount: number
  target_date: string | null
  achieved_at: string | null
  created_at: string
}

export const METHOD_LABEL: Record<Payment['method'], string> = {
  mpesa: 'M-Pesa', cash: 'Cash', bank_transfer: 'Bank transfer', card: 'Card', other: 'Other',
}

export const STATUS_LABEL: Record<DebtStatus, string> = {
  unpaid: 'Unpaid', partially_paid: 'Partly paid', paid: 'Paid', overdue: 'Overdue', disputed: 'Disputed',
}

export const DISPUTE_REASONS: Record<string, string> = {
  incorrect_amount: 'Incorrect amount',
  payment_not_recognized: 'Payment not recognised',
  unrecognized_debt: 'I do not recognise this debt',
  duplicate: 'Duplicate charge',
}

export const FREE_LIMITS = { debts: 5, creditors: 5, docs: 20 }
