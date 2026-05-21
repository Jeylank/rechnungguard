import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScannedDocument } from '../types/ScannedDocument';
import { cancelDueDateReminders, reconcileDueDateReminders } from './dueDateReminders';

const STORAGE_KEY = 'rechnungguard.documents.v1';

const withDocumentDefaults = (document: ScannedDocument): ScannedDocument => ({
  ...document,
  cashflowType: document.cashflowType ?? (document.isExpense === false ? 'neutral' : 'payable'),
  amountReceivable: document.amountReceivable ?? '',
  originalAmount: document.originalAmount ?? '',
  reminderFee: document.reminderFee ?? '',
  collectionFee: document.collectionFee ?? '',
  paymentRecipient: document.paymentRecipient ?? '',
  payerName: document.payerName ?? '',
  reminderLevel: document.reminderLevel ?? '',
  originalCreditorName: document.originalCreditorName ?? '',
  caseNumber: document.caseNumber ?? '',
  expectedPaymentDate: document.expectedPaymentDate ?? '',
  receivedDate: document.receivedDate ?? '',
  expenseCategory: document.expenseCategory ?? 'other',
  isExpense: document.isExpense ?? true,
  paidDate: document.paidDate ?? '',
  paymentMethod: document.paymentMethod ?? 'unknown',
  taxRelevant: document.taxRelevant ?? false,
  reimbursable: document.reimbursable ?? false,
  ocrSource: document.ocrSource ?? 'fallback',
  riskNote: document.riskNote ?? '',
  actionRecommendation: document.actionRecommendation ?? '',
});

export const getDocuments = async (): Promise<ScannedDocument[]> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const documents = JSON.parse(raw) as ScannedDocument[];
    return Array.isArray(documents) ? documents.map(withDocumentDefaults) : [];
  } catch {
    return [];
  }
};

export const saveDocuments = async (documents: ScannedDocument[]) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
};

export const upsertDocument = async (document: ScannedDocument) => {
  const documents = await getDocuments();
  const updatedDocument = await reconcileDueDateReminders({
    ...withDocumentDefaults(document),
    updatedAt: new Date().toISOString(),
  });
  const existingIndex = documents.findIndex((item) => item.id === document.id);

  if (existingIndex >= 0) {
    documents[existingIndex] = updatedDocument;
  } else {
    documents.unshift(updatedDocument);
  }

  await saveDocuments(documents);
  return updatedDocument;
};

export const deleteDocument = async (documentId: string) => {
  const documents = await getDocuments();
  await cancelDueDateReminders(documentId);
  await saveDocuments(documents.filter((document) => document.id !== documentId));
};

export const deleteAllDocuments = async () => {
  const documents = await getDocuments();
  await Promise.all(documents.map((document) => cancelDueDateReminders(document.id)));
  await AsyncStorage.removeItem(STORAGE_KEY);
};
