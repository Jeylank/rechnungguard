import {
  createEmptyInkassoChecklist,
  cashflowTypeValues,
  documentTypeValues,
  expenseCategoryValues,
  paymentStatusValues,
  ScannedDocument,
  urgencyLevelValues,
} from '../types/ScannedDocument';

export type OcrMode = 'mock' | 'backend';

// Developer switch: set to 'backend' to test the local OCR backend from Expo Go.
export const OCR_MODE: OcrMode = 'backend';
export const BACKEND_OCR_URL = 'https://rechnungguard-ocr-695020261440.europe-west3.run.app/ocr';
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
  payerName: string;
  branchCategory: string;
  amountTotal: string;
  amountReceivable: string;
  originalAmount: string;
  reminderFee: string;
  collectionFee: string;
  dueInDays: number;
  expectedPaymentInDays: number;
  invoiceAgeDays: number;
  invoiceNumber: string;
  customerNumber: string;
  reminderLevel: string;
  originalCreditorName: string;
  caseNumber: string;
  iban: string;
  bic: string;
  paymentReference: string;
  urgencyLevel: ScannedDocument['urgencyLevel'];
  expenseCategory: ScannedDocument['expenseCategory'];
  taxRelevant: boolean;
  reimbursable: boolean;
  cashflowType: ScannedDocument['cashflowType'];
  riskNote: string;
  actionRecommendation: string;
};

type BackendOcrResponse = Partial<
  Pick<
    ScannedDocument,
    | 'documentType'
    | 'paymentStatus'
    | 'senderName'
    | 'creditorName'
    | 'payerName'
    | 'branchCategory'
    | 'amountTotal'
    | 'amountReceivable'
    | 'originalAmount'
    | 'reminderFee'
    | 'collectionFee'
    | 'dueDate'
    | 'expectedPaymentDate'
    | 'invoiceDate'
    | 'invoiceNumber'
    | 'customerNumber'
    | 'reminderLevel'
    | 'originalCreditorName'
    | 'caseNumber'
    | 'iban'
    | 'bic'
    | 'paymentReference'
    | 'paymentRecipient'
    | 'documentLanguage'
    | 'urgencyLevel'
    | 'expenseCategory'
    | 'isExpense'
    | 'paidDate'
    | 'paymentMethod'
    | 'taxRelevant'
    | 'reimbursable'
    | 'cashflowType'
    | 'receivedDate'
    | 'riskNote'
    | 'actionRecommendation'
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
    payerName: '',
    branchCategory: 'Energie',
    amountTotal: '132,40 EUR',
    amountReceivable: '',
    originalAmount: '132,40 EUR',
    reminderFee: '',
    collectionFee: '',
    dueInDays: 9,
    expectedPaymentInDays: 0,
    invoiceAgeDays: 5,
    invoiceNumber: 'SWB-2026-4819',
    customerNumber: 'KND-904218',
    reminderLevel: '',
    originalCreditorName: '',
    caseNumber: '',
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
    paymentReference: 'SWB-2026-4819 KND-904218',
    urgencyLevel: 'medium',
    expenseCategory: 'energy',
    taxRelevant: false,
    reimbursable: false,
    cashflowType: 'payable',
    riskNote: '',
    actionRecommendation: '',
  },
  {
    documentType: 'telecom_bill',
    paymentStatus: 'unpaid',
    senderName: 'ConnectTel GmbH',
    creditorName: 'ConnectTel GmbH',
    payerName: '',
    branchCategory: 'Telekom',
    amountTotal: '49,95 EUR',
    amountReceivable: '',
    originalAmount: '49,95 EUR',
    reminderFee: '',
    collectionFee: '',
    dueInDays: 6,
    expectedPaymentInDays: 0,
    invoiceAgeDays: 8,
    invoiceNumber: 'CT-2026-77314',
    customerNumber: 'CON-118204',
    reminderLevel: '',
    originalCreditorName: '',
    caseNumber: '',
    iban: 'DE12500105170648489890',
    bic: 'INGDDEFFXXX',
    paymentReference: 'CT-2026-77314 CON-118204',
    urgencyLevel: 'high',
    expenseCategory: 'telecom',
    taxRelevant: false,
    reimbursable: false,
    cashflowType: 'payable',
    riskNote: '',
    actionRecommendation: '',
  },
  {
    documentType: 'rent_letter',
    paymentStatus: 'needs_review',
    senderName: 'Hausverwaltung Mitte',
    creditorName: 'Hausverwaltung Mitte',
    payerName: '',
    branchCategory: 'Miete',
    amountTotal: '18,70 EUR',
    amountReceivable: '',
    originalAmount: '18,70 EUR',
    reminderFee: '',
    collectionFee: '',
    dueInDays: 14,
    expectedPaymentInDays: 0,
    invoiceAgeDays: 3,
    invoiceNumber: 'NK-2026-0442',
    customerNumber: 'MV-30291',
    reminderLevel: '',
    originalCreditorName: '',
    caseNumber: '',
    iban: 'DE75512108001245126199',
    bic: 'SOGEDEFFXXX',
    paymentReference: 'Nebenkosten NK-2026-0442',
    urgencyLevel: 'low',
    expenseCategory: 'housing',
    taxRelevant: false,
    reimbursable: false,
    cashflowType: 'payable',
    riskNote: '',
    actionRecommendation: '',
  },
  {
    documentType: 'insurance_document',
    paymentStatus: 'sent_to_insurance',
    senderName: 'SchutzPlus Versicherung',
    creditorName: 'SchutzPlus Versicherung',
    payerName: '',
    branchCategory: 'Versicherung',
    amountTotal: '86,30 EUR',
    amountReceivable: '',
    originalAmount: '86,30 EUR',
    reminderFee: '',
    collectionFee: '',
    dueInDays: 12,
    expectedPaymentInDays: 0,
    invoiceAgeDays: 4,
    invoiceNumber: 'SPV-2026-6190',
    customerNumber: 'POL-775201',
    reminderLevel: '',
    originalCreditorName: '',
    caseNumber: '',
    iban: 'DE02120300000000202051',
    bic: 'BYLADEM1001',
    paymentReference: 'SPV-2026-6190 POL-775201',
    urgencyLevel: 'medium',
    expenseCategory: 'insurance',
    taxRelevant: false,
    reimbursable: true,
    cashflowType: 'payable',
    riskNote: '',
    actionRecommendation: '',
  },
  {
    documentType: 'inkasso_letter',
    paymentStatus: 'needs_review',
    senderName: 'FairCollect Inkasso',
    creditorName: 'FairCollect Inkasso',
    payerName: '',
    branchCategory: 'Inkasso',
    amountTotal: '164,85 EUR',
    amountReceivable: '',
    originalAmount: '119,90 EUR',
    reminderFee: '5,00 EUR',
    collectionFee: '39,95 EUR',
    dueInDays: 5,
    expectedPaymentInDays: 0,
    invoiceAgeDays: 21,
    invoiceNumber: 'FC-2026-8821',
    customerNumber: 'AZ-440193',
    reminderLevel: 'Inkasso',
    originalCreditorName: 'ConnectTel GmbH',
    caseNumber: 'AZ-440193',
    iban: 'DE44500105175407324931',
    bic: 'INGDDEFFXXX',
    paymentReference: 'FC-2026-8821 AZ-440193',
    urgencyLevel: 'critical',
    expenseCategory: 'legal',
    taxRelevant: false,
    reimbursable: false,
    cashflowType: 'payable',
    riskNote: 'Inkasso-Forderung mit kurzer Frist.',
    actionRecommendation: 'Forderung, ursprünglichen Gläubiger, Aktenzeichen und Gebühren prüfen; bei Unsicherheit Beratung kontaktieren.',
  },
  {
    documentType: 'tax_letter',
    paymentStatus: 'expected',
    senderName: 'Finanzamt Berlin',
    creditorName: '',
    payerName: 'Finanzamt Berlin',
    branchCategory: 'Behörde',
    amountTotal: '',
    amountReceivable: '248,10 EUR',
    originalAmount: '',
    reminderFee: '',
    collectionFee: '',
    dueInDays: 0,
    expectedPaymentInDays: 10,
    invoiceAgeDays: 2,
    invoiceNumber: 'EST-2026-5521',
    customerNumber: 'StNr. 12/345/67890',
    reminderLevel: '',
    originalCreditorName: '',
    caseNumber: '',
    iban: '',
    bic: '',
    paymentReference: 'Steuererstattung 2026',
    urgencyLevel: 'low',
    expenseCategory: 'tax_government',
    taxRelevant: true,
    reimbursable: false,
    cashflowType: 'receivable',
    riskNote: '',
    actionRecommendation: '',
  },
];

let nextMockExampleIndex = 0;

const isDocumentType = (value: unknown): value is ScannedDocument['documentType'] =>
  typeof value === 'string' && documentTypeValues.includes(value as ScannedDocument['documentType']);

const isPaymentStatus = (value: unknown): value is ScannedDocument['paymentStatus'] =>
  typeof value === 'string' && paymentStatusValues.includes(value as ScannedDocument['paymentStatus']);

const isCashflowType = (value: unknown): value is ScannedDocument['cashflowType'] =>
  typeof value === 'string' && cashflowTypeValues.includes(value as ScannedDocument['cashflowType']);

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
    payerName: example.payerName,
    branchCategory: example.branchCategory,
    amountTotal: example.amountTotal,
    amountReceivable: example.amountReceivable,
    originalAmount: example.originalAmount,
    reminderFee: example.reminderFee,
    collectionFee: example.collectionFee,
    dueDate: addDays(example.dueInDays),
    expectedPaymentDate: example.expectedPaymentInDays ? addDays(example.expectedPaymentInDays) : '',
    invoiceDate: addDays(-example.invoiceAgeDays),
    invoiceNumber: example.invoiceNumber,
    customerNumber: example.customerNumber,
    reminderLevel: example.reminderLevel,
    originalCreditorName: example.originalCreditorName,
    caseNumber: example.caseNumber,
    iban: example.iban,
    bic: example.bic,
    paymentReference: example.paymentReference,
    documentLanguage: 'de',
    urgencyLevel: example.urgencyLevel,
    paymentNote: '',
    inkassoChecklist: createEmptyInkassoChecklist(),
    expenseCategory: example.expenseCategory,
    isExpense: example.cashflowType === 'payable',
    paidDate: '',
    receivedDate: '',
    paymentMethod: 'unknown',
    taxRelevant: example.taxRelevant,
    reimbursable: example.reimbursable,
    cashflowType: example.cashflowType,
    ocrSource: 'mock',
    riskNote: example.riskNote,
    actionRecommendation: example.actionRecommendation,
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
    payerName: stringOrEmpty(response.payerName),
    branchCategory: stringOrEmpty(response.branchCategory),
    amountTotal: stringOrEmpty(response.amountTotal),
    amountReceivable: stringOrEmpty(response.amountReceivable),
    originalAmount: stringOrEmpty(response.originalAmount),
    reminderFee: stringOrEmpty(response.reminderFee),
    collectionFee: stringOrEmpty(response.collectionFee),
    dueDate: stringOrEmpty(response.dueDate),
    expectedPaymentDate: stringOrEmpty(response.expectedPaymentDate),
    invoiceDate: stringOrEmpty(response.invoiceDate),
    invoiceNumber: stringOrEmpty(response.invoiceNumber),
    customerNumber: stringOrEmpty(response.customerNumber),
    reminderLevel: stringOrEmpty(response.reminderLevel),
    originalCreditorName: stringOrEmpty(response.originalCreditorName),
    caseNumber: stringOrEmpty(response.caseNumber),
    iban: stringOrEmpty(response.iban),
    bic: stringOrEmpty(response.bic),
    paymentReference: stringOrEmpty(response.paymentReference),
    paymentRecipient: stringOrEmpty(response.paymentRecipient),
    documentLanguage: stringOrEmpty(response.documentLanguage) || 'de',
    urgencyLevel: isUrgencyLevel(response.urgencyLevel) ? response.urgencyLevel : 'medium',
    paymentNote: '',
    inkassoChecklist: createEmptyInkassoChecklist(),
    dueDateReminderStatus: undefined,
    expenseCategory: isExpenseCategory(response.expenseCategory) ? response.expenseCategory : 'other',
    isExpense: response.isExpense ?? true,
    paidDate: stringOrEmpty(response.paidDate),
    receivedDate: stringOrEmpty(response.receivedDate),
    paymentMethod: isPaymentMethod(response.paymentMethod) ? response.paymentMethod : 'unknown',
    taxRelevant: booleanOrFalse(response.taxRelevant),
    reimbursable: booleanOrFalse(response.reimbursable),
    cashflowType: isCashflowType(response.cashflowType) ? response.cashflowType : 'payable',
    ocrSource: 'backend',
    riskNote: stringOrEmpty(response.riskNote),
    actionRecommendation: stringOrEmpty(response.actionRecommendation),
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
    throw error;
  }

  if (!response.ok) {
    let failureReason = `OCR backend failed with status ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: unknown };
      const backendMessage = typeof payload.error === 'string' ? payload.error : '';
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
  return document;
};

export const scanDocumentWithOcr = async (imageUri: string): Promise<ScannedDocument> => {
  if (OCR_MODE === 'backend') {
    return backendOcrDocument(imageUri);
  }

  return mockOcrDocument(imageUri);
};
