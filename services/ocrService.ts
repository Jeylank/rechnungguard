import { createEmptyInkassoChecklist, DocumentType, ScannedDocument } from '../types/ScannedDocument';

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type MockOcrExample = {
  documentType: DocumentType;
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
  },
];

let nextMockExampleIndex = 0;

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
  };
};
