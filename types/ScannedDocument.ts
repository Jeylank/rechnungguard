export type DocumentType =
  | 'receipt'
  | 'invoice'
  | 'medical_invoice'
  | 'dental_invoice'
  | 'utility_bill'
  | 'telecom_bill'
  | 'rent_letter'
  | 'insurance_document'
  | 'government_letter'
  | 'tax_letter'
  | 'payment_reminder'
  | 'inkasso_letter'
  | 'subscription_bill'
  | 'unknown';

export type PaymentStatus =
  | 'needs_review'
  | 'unpaid'
  | 'paid'
  | 'sent_to_insurance'
  | 'waiting_reimbursement'
  | 'disputed'
  | 'closed';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export type ExpenseCategory =
  | 'housing'
  | 'energy'
  | 'telecom'
  | 'insurance'
  | 'health'
  | 'transport'
  | 'shopping'
  | 'subscriptions'
  | 'tax_government'
  | 'education'
  | 'travel'
  | 'legal'
  | 'other';

export type PaymentMethod = 'unknown' | 'bank_transfer' | 'direct_debit' | 'card' | 'cash' | 'paypal' | 'other';

export type DueDateReminderKey = 'sevenDaysBefore' | 'threeDaysBefore' | 'dueDate';

export type DueDateReminderState =
  | 'not_required'
  | 'permission_denied'
  | 'scheduled'
  | 'no_future_dates'
  | 'failed'
  | 'expo_go_limited';

export type DueDateReminderStatus = {
  state: DueDateReminderState;
  notificationIds: Partial<Record<DueDateReminderKey, string>>;
  scheduledFor: Partial<Record<DueDateReminderKey, string>>;
  updatedAt: string;
};

export type ScannedDocument = {
  id: string;
  imageUri: string;
  createdAt: string;
  updatedAt: string;
  documentType: DocumentType;
  paymentStatus: PaymentStatus;
  senderName: string;
  creditorName: string;
  branchCategory: string;
  amountTotal: string;
  originalAmount: string;
  dueDate: string;
  invoiceDate: string;
  invoiceNumber: string;
  customerNumber: string;
  iban: string;
  bic: string;
  paymentReference: string;
  documentLanguage: string;
  urgencyLevel: UrgencyLevel;
  paymentNote: string;
  inkassoChecklist: Record<string, boolean>;
  dueDateReminderStatus?: DueDateReminderStatus;
  expenseCategory: ExpenseCategory;
  isExpense: boolean;
  paidDate: string;
  paymentMethod: PaymentMethod;
  taxRelevant: boolean;
  reimbursable: boolean;
};

export const documentTypeValues: DocumentType[] = [
  'receipt',
  'invoice',
  'medical_invoice',
  'dental_invoice',
  'utility_bill',
  'telecom_bill',
  'rent_letter',
  'insurance_document',
  'government_letter',
  'tax_letter',
  'payment_reminder',
  'inkasso_letter',
  'subscription_bill',
  'unknown',
];

export const paymentStatusValues: PaymentStatus[] = [
  'needs_review',
  'unpaid',
  'paid',
  'sent_to_insurance',
  'waiting_reimbursement',
  'disputed',
  'closed',
];

export const urgencyLevelValues: UrgencyLevel[] = ['low', 'medium', 'high', 'critical'];

export const expenseCategoryValues: ExpenseCategory[] = [
  'housing',
  'energy',
  'telecom',
  'insurance',
  'health',
  'transport',
  'shopping',
  'subscriptions',
  'tax_government',
  'education',
  'travel',
  'legal',
  'other',
];

export const paymentMethodValues: PaymentMethod[] = [
  'unknown',
  'bank_transfer',
  'direct_debit',
  'card',
  'cash',
  'paypal',
  'other',
];

export const inkassoChecklistItems = [
  'Check original creditor',
  'Check original invoice date',
  'Check if already paid',
  'Check whether reminder was received',
  'Save proof of payment',
  'Consider disputing unclear extra fees',
] as const;

export const createEmptyInkassoChecklist = (): Record<string, boolean> =>
  inkassoChecklistItems.reduce<Record<string, boolean>>((items, label) => {
    items[label] = false;
    return items;
  }, {});
