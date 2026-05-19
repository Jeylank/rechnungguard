import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScannedDocument } from '../types/ScannedDocument';

const STORAGE_KEY = 'rechnungguard.documents.v1';

export const getDocuments = async (): Promise<ScannedDocument[]> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const documents = JSON.parse(raw) as ScannedDocument[];
    return Array.isArray(documents) ? documents : [];
  } catch {
    return [];
  }
};

export const saveDocuments = async (documents: ScannedDocument[]) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
};

export const upsertDocument = async (document: ScannedDocument) => {
  const documents = await getDocuments();
  const updatedDocument = {
    ...document,
    updatedAt: new Date().toISOString(),
  };
  const existingIndex = documents.findIndex((item) => item.id === document.id);

  if (existingIndex >= 0) {
    documents[existingIndex] = updatedDocument;
  } else {
    documents.unshift(updatedDocument);
  }

  await saveDocuments(documents);
  return updatedDocument;
};
