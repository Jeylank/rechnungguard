import { createEmptyInkassoChecklist, ScannedDocument } from '../types/ScannedDocument';

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const mockOcrDocument = async (imageUri: string): Promise<ScannedDocument> => {
  await new Promise((resolve) => setTimeout(resolve, 900));

  const now = new Date().toISOString();

  return {
    id: makeId(),
    imageUri,
    createdAt: now,
    updatedAt: now,
    documentType: 'dental_invoice',
    paymentStatus: 'needs_review',
    senderName: 'Zahnarztpraxis Dr. Anna Keller',
    creditorName: 'Zahnarztpraxis Dr. Anna Keller',
    amountTotal: '248,60 EUR',
    originalAmount: '248,60 EUR',
    dueDate: addDays(10),
    invoiceDate: addDays(-4),
    invoiceNumber: 'ZR-2026-1048',
    customerNumber: 'PAT-58291',
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
    paymentReference: 'ZR-2026-1048 PAT-58291',
    documentLanguage: 'de',
    urgencyLevel: 'medium',
    paymentNote: '',
    inkassoChecklist: createEmptyInkassoChecklist(),
  };
};
