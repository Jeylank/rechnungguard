import {
  createEmptyInkassoChecklist,
  documentTypeValues,
  expenseCategoryValues,
  paymentStatusValues,
  ScannedDocument,
  urgencyLevelValues,
} from '../types/ScannedDocument';

export type OcrMode = 'mock' | 'backend';

// Developer switch: set to 'backend' to test the local OCR backend from Expo Go.
export const OCR_MODE: OcrMode = 'backend';
export const BACKEND_OCR_URL = 'http://192.168.2.104:3001/ocr';
export const BACKEND_HEALTH_URL = BACKEND_OCR_URL.replace(/\/ocr\/?$/, '/health');

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type MockOcrExample = {
  documentType: ScannedDocument['documentType'];
  paymentStatus: ScannedDocument['paymentStatus'];
  senderName: string;
  creditorName: string;
  branchCategory: string;
  amountTotal: string;
  originalAmount: string;
  dueInDays: number;
  invoiceAgeDays: number;
  invoiceNumber: string;
  customerNumber: string;
  iban: string;
  bic: string;
  paymentReference: string;
  urgencyLevel: ScannedDocument['urgencyLevel'];
  expenseCategory: ScannedDocument['expenseCategory'];
  taxRelevant: boolean;
  reimbursable: boolean;
};

type BackendOcrResponse = Partial<
  Pick<
    ScannedDocument,
    | 'documentType'
    | 'paymentStatus'
    | 'senderName'
    | 'creditorName'
    | 'branchCategory'
    | 'amountTotal'
    | 'originalAmount'
    | 'dueDate'
    | 'invoiceDate'
    | 'invoiceNumber'
    | 'customerNumber'
    | 'iban'
    | 'bic'
    | 'paymentReference'
    | 'documentLanguage'
    | 'urgencyLevel'
    | 'expenseCategory'
    | 'isExpense'
    | 'paidDate'
    | 'paymentMethod'
    | 'taxRelevant'
    | 'reimbursable'
  >
> & {
  ocrProvider?: 'openai' | 'mock';
};

const mockExamples: MockOcrExample[] = [
  {
    documentType: 'utility_bill',
    paymentStatus: 'needs_review',
    senderName: 'Stadtwerke Berlin',
    creditorName: 'Stadtwerke Berlin',
    branchCategory: 'Energie',
    amountTotal: '132,40 EUR',
    originalAmount: '132,40 EUR',
    dueInDays: 9,
    invoiceAgeDays: 5,
    invoiceNumber: 'SWB-2026-4819',
    customerNumber: 'KND-904218',
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
    paymentReference: 'SWB-2026-4819 KND-904218',
    urgencyLevel: 'medium',
    expenseCategory: 'energy',
    taxRelevant: false,
    reimbursable: false,
  },
  {
    documentType: 'telecom_bill',
    paymentStatus: 'unpaid',
    senderName: 'ConnectTel GmbH',
    creditorName: 'ConnectTel GmbH',
    branchCategory: 'Telekom',
    amountTotal: '49,95 EUR',
    originalAmount: '49,95 EUR',
    dueInDays: 6,
    invoiceAgeDays: 8,
    invoiceNumber: 'CT-2026-77314',
    customerNumber: 'CON-118204',
    iban: 'DE12500105170648489890',
    bic: 'INGDDEFFXXX',
    paymentReference: 'CT-2026-77314 CON-118204',
    urgencyLevel: 'high',
    expenseCategory: 'telecom',
    taxRelevant: false,
    reimbursable: false,
  },
  {
    documentType: 'rent_letter',
    paymentStatus: 'needs_review',
    senderName: 'Hausverwaltung Mitte',
    creditorName: 'Hausverwaltung Mitte',
    branchCategory: 'Miete',
    amountTotal: '18,70 EUR',
    originalAmount: '18,70 EUR',
    dueInDays: 14,
    invoiceAgeDays: 3,
    invoiceNumber: 'NK-2026-0442',
    customerNumber: 'MV-30291',
    iban: 'DE75512108001245126199',
    bic: 'SOGEDEFFXXX',
    paymentReference: 'Nebenkosten NK-2026-0442',
    urgencyLevel: 'low',
    expenseCategory: 'housing',
    taxRelevant: false,
    reimbursable: false,
  },
  {
    documentType: 'insurance_document',
    paymentStatus: 'sent_to_insurance',
    senderName: 'SchutzPlus Versicherung',
    creditorName: 'SchutzPlus Versicherung',
    branchCategory: 'Versicherung',
    amountTotal: '86,30 EUR',
    originalAmount: '86,30 EUR',
    dueInDays: 12,
    invoiceAgeDays: 4,
    invoiceNumber: 'SPV-2026-6190',
    customerNumber: 'POL-775201',
    iban: 'DE02120300000000202051',
    bic: 'BYLADEM1001',
    paymentReference: 'SPV-2026-6190 POL-775201',
    urgencyLevel: 'medium',
    expenseCategory: 'insurance',
    taxRelevant: false,
    reimbursable: true,
  },
  {
    documentType: 'inkasso_letter',
    paymentStatus: 'needs_review',
    senderName: 'FairCollect Inkasso',
    creditorName: 'FairCollect Inkasso',
    branchCategory: 'Inkasso',
    amountTotal: '164,85 EUR',
    originalAmount: '119,90 EUR',
    dueInDays: 5,
    invoiceAgeDays: 21,
    invoiceNumber: 'FC-2026-8821',
    customerNumber: 'AZ-440193',
    iban: 'DE44500105175407324931',
    bic: 'INGDDEFFXXX',
    paymentReference: 'FC-2026-8821 AZ-440193',
    urgencyLevel: 'critical',
    expenseCategory: 'legal',
    taxRelevant: false,
    reimbursable: false,
  },
];

let nextMockExampleIndex = 0;

const isDocumentType = (value: unknown): value is ScannedDocument['documentType'] =>
  typeof value === 'string' && documentTypeValues.includes(value as ScannedDocument['documentType']);

const isPaymentStatus = (value: unknown): value is ScannedDocument['paymentStatus'] =>
  typeof value === 'string' && paymentStatusValues.includes(value as ScannedDocument['paymentStatus']);

const isUrgencyLevel = (value: unknown): value is ScannedDocument['urgencyLevel'] =>
  typeof value === 'string' && urgencyLevelValues.includes(value as ScannedDocument['urgencyLevel']);

const isExpenseCategory = (value: unknown): value is ScannedDocument['expenseCategory'] =>
  typeof value === 'string' && expenseCategoryValues.includes(value as ScannedDocument['expenseCategory']);

const isPaymentMethod = (value: unknown): value is ScannedDocument['paymentMethod'] =>
  value === 'unknown' ||
  value === 'bank_transfer' ||
  value === 'direct_debit' ||
  value === 'card' ||
  value === 'cash' ||
  value === 'paypal' ||
  value === 'other';

const stringOrEmpty = (value: unknown) => (typeof value === 'string' ? value : '');
const booleanOrFalse = (value: unknown) => (typeof value === 'boolean' ? value : false);

export const mockOcrDocument = async (imageUri: string): Promise<ScannedDocument> => {
  await new Promise((resolve) => setTimeout(resolve, 900));

  const now = new Date().toISOString();
  const example = mockExamples[nextMockExampleIndex % mockExamples.length];
  nextMockExampleIndex += 1;

  return {
    id: makeId(),
    imageUri,
    createdAt: now,
    updatedAt: now,
    documentType: example.documentType,
    paymentStatus: example.paymentStatus,
    senderName: example.senderName,
    creditorName: example.creditorName,
    branchCategory: example.branchCategory,
    amountTotal: example.amountTotal,
    originalAmount: example.originalAmount,
    dueDate: addDays(example.dueInDays),
    invoiceDate: addDays(-example.invoiceAgeDays),
    invoiceNumber: example.invoiceNumber,
    customerNumber: example.customerNumber,
    iban: example.iban,
    bic: example.bic,
    paymentReference: example.paymentReference,
    documentLanguage: 'de',
    urgencyLevel: example.urgencyLevel,
    paymentNote: '',
    inkassoChecklist: createEmptyInkassoChecklist(),
    expenseCategory: example.expenseCategory,
    isExpense: true,
    paidDate: '',
    paymentMethod: 'unknown',
    taxRelevant: example.taxRelevant,
    reimbursable: example.reimbursable,
    ocrSource: 'mock',
  };
};

const mapBackendResponseToDocument = (imageUri: string, response: BackendOcrResponse): ScannedDocument => {
  const now = new Date().toISOString();

  return {
    id: makeId(),
    imageUri,
    createdAt: now,
    updatedAt: now,
    documentType: isDocumentType(response.documentType) ? response.documentType : 'unknown',
    paymentStatus: isPaymentStatus(response.paymentStatus) ? response.paymentStatus : 'needs_review',
    senderName: stringOrEmpty(response.senderName),
    creditorName: stringOrEmpty(response.creditorName),
    branchCategory: stringOrEmpty(response.branchCategory),
    amountTotal: stringOrEmpty(response.amountTotal),
    originalAmount: stringOrEmpty(response.originalAmount),
    dueDate: stringOrEmpty(response.dueDate),
    invoiceDate: stringOrEmpty(response.invoiceDate),
    invoiceNumber: stringOrEmpty(response.invoiceNumber),
    customerNumber: stringOrEmpty(response.customerNumber),
    iban: stringOrEmpty(response.iban),
    bic: stringOrEmpty(response.bic),
    paymentReference: stringOrEmpty(response.paymentReference),
    documentLanguage: stringOrEmpty(response.documentLanguage) || 'de',
    urgencyLevel: isUrgencyLevel(response.urgencyLevel) ? response.urgencyLevel : 'medium',
    paymentNote: '',
    inkassoChecklist: createEmptyInkassoChecklist(),
    dueDateReminderStatus: undefined,
    expenseCategory: isExpenseCategory(response.expenseCategory) ? response.expenseCategory : 'other',
    isExpense: response.isExpense ?? true,
    paidDate: stringOrEmpty(response.paidDate),
    paymentMethod: isPaymentMethod(response.paymentMethod) ? response.paymentMethod : 'unknown',
    taxRelevant: booleanOrFalse(response.taxRelevant),
    reimbursable: booleanOrFalse(response.reimbursable),
    ocrSource: 'backend',
  };
};

const getFilenameFromUri = (imageUri: string) => imageUri.split('/').pop() || `rechnungguard-${Date.now()}.jpg`;

const backendOcrDocument = async (imageUri: string): Promise<ScannedDocument> => {
  if (!BACKEND_OCR_URL) {
    throw new Error('BACKEND_OCR_URL is not configured.');
  }

  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    name: getFilenameFromUri(imageUri),
    type: 'image/jpeg',
  } as unknown as Blob);

  let response: Response;
  try {
    response = await fetch(BACKEND_OCR_URL, {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    console.log('backend response status', 'request_failed');
    throw error;
  }
  console.log('backend response status', response.status);

  if (!response.ok) {
    let failureReason = `OCR backend failed with status ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: unknown; details?: unknown };
      const backendMessage =
        typeof payload.error === 'string'
          ? payload.error
          : typeof payload.details === 'string'
            ? payload.details
            : '';
      failureReason = backendMessage ? `${failureReason} ${backendMessage}` : failureReason;
    } catch {
      // Keep the status-based reason when the backend did not return JSON.
    }
    throw new Error(failureReason);
  }

  const payload = (await response.json()) as BackendOcrResponse;
  if (payload.ocrProvider === 'mock') {
    throw new Error('OCR backend returned mock data while OCR_MODE is backend.');
  }

  const document = mapBackendResponseToDocument(imageUri, payload);
  console.log('OCR source', document.ocrSource);
  return document;
};

export const scanDocumentWithOcr = async (imageUri: string): Promise<ScannedDocument> => {
  console.log('OCR_MODE', OCR_MODE);
  console.log('BACKEND_OCR_URL', BACKEND_OCR_URL);

  if (OCR_MODE === 'backend') {
    return backendOcrDocument(imageUri);
  }

  const document = await mockOcrDocument(imageUri);
  console.log('OCR source', document.ocrSource);
  return document;
};
