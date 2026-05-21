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
  | 'payment_proof'
  | 'subscription_bill'
  | 'unknown';

export type PaymentStatus =
  | 'needs_review'
  | 'unpaid'
  | 'expected'
  | 'paid'
  | 'received'
  | 'sent_to_insurance'
  | 'waiting_reimbursement'
  | 'disputed'
  | 'closed';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';
export type CashflowType = 'payable' | 'receivable' | 'neutral' | 'unknown';

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
export type OcrSource = 'backend' | 'mock' | 'fallback';

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
  payerName: string;
  branchCategory: string;
  amountTotal: string;
  amountReceivable: string;
  originalAmount: string;
  reminderFee: string;
  collectionFee: string;
  dueDate: string;
  expectedPaymentDate: string;
  invoiceDate: string;
  invoiceNumber: string;
  customerNumber: string;
  reminderLevel: string;
  originalCreditorName: string;
  caseNumber: string;
  iban: string;
  bic: string;
  paymentReference: string;
  paymentRecipient?: string;
  documentLanguage: string;
  urgencyLevel: UrgencyLevel;
  paymentNote: string;
  inkassoChecklist: Record<string, boolean>;
  dueDateReminderStatus?: DueDateReminderStatus;
  expenseCategory: ExpenseCategory;
  isExpense: boolean;
  paidDate: string;
  receivedDate: string;
  paymentMethod: PaymentMethod;
  taxRelevant: boolean;
  reimbursable: boolean;
  cashflowType: CashflowType;
  ocrSource: OcrSource;
  riskNote: string;
  actionRecommendation: string;
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
  'payment_proof',
  'subscription_bill',
  'unknown',
];

export const paymentStatusValues: PaymentStatus[] = [
  'needs_review',
  'unpaid',
  'expected',
  'paid',
  'received',
  'sent_to_insurance',
  'waiting_reimbursement',
  'disputed',
  'closed',
];

export const urgencyLevelValues: UrgencyLevel[] = ['low', 'medium', 'high', 'critical'];
export const cashflowTypeValues: CashflowType[] = ['payable', 'receivable', 'neutral', 'unknown'];

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
