import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import {
  defaultLanguage,
  isLanguage,
  Language,
  Translation,
  translations,
} from './i18n';
import { deleteAllDocuments, deleteDocument, getDocuments, upsertDocument } from './services/documentStorage';
import { BACKEND_HEALTH_URL, OCR_MODE, scanDocumentWithOcr } from './services/ocrService';
import {
  AppMode,
  appModeValues,
  businessExpenseCategoryValues,
  documentTypeValues,
  DocumentType,
  ExpenseCategory,
  privateExpenseCategoryValues,
  cashflowTypeValues,
  inkassoChecklistItems,
  paymentStatusValues,
  PaymentStatus,
  ScannedDocument,
  urgencyLevelValues,
} from './types/ScannedDocument';

type Screen = 'home' | 'scan' | 'review' | 'detail' | 'paymentPreparation';
type BackendStatus = 'checking' | 'reachable' | 'unreachable';
type EditableField =
  | 'documentType'
  | 'paymentStatus'
  | 'cashflowType'
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
  | 'riskNote'
  | 'actionRecommendation'
  | 'documentLanguage'
  | 'urgencyLevel'
  | 'receivedDate';
type FieldLabelKey = keyof typeof translations.de.fields;

type ExpenseSummary = {
  openAmount: number;
  expectedReceivableAmount: number;
  paidOrReceivedThisMonth: number;
  openInvoiceCount: number;
  categoryBreakdown: ExpenseCategorySummary[];
};

type ExpenseCategorySummary = {
  category: ExpenseCategory;
  openAmount: number;
  paidOrReceivedThisMonth: number;
};

type SupplierSummary = {
  supplierName: string;
  openInvoiceCount: number;
  totalOpenAmount: number;
  nextDueDate: string;
};

type BusinessPayablesDashboard = {
  overdue: ScannedDocument[];
  dueToday: ScannedDocument[];
  dueSoon: ScannedDocument[];
  upcoming: ScannedDocument[];
  openSupplierInvoices: ScannedDocument[];
  paidThisMonth: ScannedDocument[];
  supplierSummaries: SupplierSummary[];
};

type DueDateReminderState = 'overdue' | 'dueToday' | 'dueSoon' | 'upcoming';
type DueDateReminderSummary = Record<DueDateReminderState, ScannedDocument[]>;

type DuplicateInvoiceCandidate = {
  document: ScannedDocument;
  strength: 'strong' | 'possible';
};
type SupplierCategorySuggestion = {
  category: ExpenseCategory;
};
type PaymentDataWarningKey =
  | 'missingRecipient'
  | 'missingAmount'
  | 'missingIban'
  | 'missingPaymentReference'
  | 'missingDueDate';

const unpaidStatuses = new Set(['needs_review', 'unpaid', 'sent_to_insurance', 'waiting_reimbursement']);
const openExpenseStatuses = new Set<ScannedDocument['paymentStatus']>(['needs_review', 'unpaid']);
const openSupplierPayableStatuses = new Set<ScannedDocument['paymentStatus']>(['needs_review', 'unpaid', 'disputed']);
const receivableOpenStatuses = new Set<ScannedDocument['paymentStatus']>(['needs_review', 'expected', 'waiting_reimbursement']);
const blockedPaymentPreparationStatuses = new Set<ScannedDocument['paymentStatus']>(['paid', 'closed']);
const paymentDataWarningStatuses = new Set<ScannedDocument['paymentStatus']>(['needs_review', 'unpaid', 'disputed']);
const LANGUAGE_STORAGE_KEY = 'rechnungguard.language.v1';
const APP_MODE_STORAGE_KEY = 'rechnungguard.appMode.v1';
const PRIVACY_NOTICE_ACCEPTED_STORAGE_KEY = 'rechnungguard.privacyNoticeAccepted.v1';
const STORE_DOCUMENT_IMAGES_STORAGE_KEY = 'rechnungguard.storeDocumentImages.v1';

const primaryReviewFields: EditableField[] = [
  'documentType',
  'paymentStatus',
  'cashflowType',
  'senderName',
  'creditorName',
  'amountTotal',
  'dueDate',
  'iban',
  'paymentReference',
];

const advancedReviewFields: EditableField[] = [
  'payerName',
  'branchCategory',
  'amountReceivable',
  'expectedPaymentDate',
  'invoiceDate',
  'invoiceNumber',
  'customerNumber',
  'originalAmount',
  'reminderFee',
  'collectionFee',
  'reminderLevel',
  'originalCreditorName',
  'caseNumber',
  'bic',
  'riskNote',
  'actionRecommendation',
  'documentLanguage',
  'urgencyLevel',
];

const fieldOrder: EditableField[] = [...primaryReviewFields, ...advancedReviewFields, 'receivedDate'];

const receivableOnlyFields = new Set<EditableField>(['amountReceivable', 'payerName', 'expectedPaymentDate']);
const reminderOrInkassoFields = new Set<EditableField>([
  'originalAmount',
  'reminderFee',
  'collectionFee',
  'reminderLevel',
  'originalCreditorName',
  'caseNumber',
  'riskNote',
  'actionRecommendation',
]);
const paymentPreparationFields = new Set<EditableField>(['iban', 'bic', 'paymentReference']);
const businessReviewFields = new Set<EditableField>([
  'paymentStatus',
  'senderName',
  'creditorName',
  'amountTotal',
  'dueDate',
  'invoiceNumber',
  'customerNumber',
  'iban',
  'paymentReference',
]);
const businessPaymentStatusValues: PaymentStatus[] = ['needs_review', 'unpaid', 'paid', 'disputed', 'closed'];

const sortByDateDesc = (a: ScannedDocument, b: ScannedDocument) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

const isUrgent = (document: ScannedDocument) => {
  if (document.cashflowType !== 'payable') {
    return false;
  }

  if (!unpaidStatuses.has(document.paymentStatus)) {
    return false;
  }
  if (document.urgencyLevel === 'critical' || document.urgencyLevel === 'high') {
    return true;
  }
  const dueDate = document.dueDate ? new Date(document.dueDate).getTime() : Number.POSITIVE_INFINITY;
  const inSevenDays = Date.now() + 7 * 24 * 60 * 60 * 1000;
  return dueDate <= inSevenDays;
};

const getDocumentTypeLabel = (t: Translation, value: DocumentType) => t.documentTypes[value] ?? value;
const paymentStatusAliases: Record<string, ScannedDocument['paymentStatus']> = {
  open: 'unpaid',
};

const getPaymentStatusLabel = (t: Translation, value: ScannedDocument['paymentStatus'] | string) => {
  const status = paymentStatusAliases[value.toLowerCase()] ?? value;
  return t.paymentStatuses[status as ScannedDocument['paymentStatus']] ?? value;
};
const getUrgencyLevelLabel = (t: Translation, value: ScannedDocument['urgencyLevel']) =>
  t.urgencyLevels[value] ?? value;
const getCashflowTypeLabel = (t: Translation, value: ScannedDocument['cashflowType']) =>
  t.cashflowTypes[value] ?? value;
const expenseCategoryAliases: Record<string, ScannedDocument['expenseCategory']> = {
  rent: 'rent',
};

const getExpenseCategoryLabel = (t: Translation, value: ScannedDocument['expenseCategory'] | string) => {
  const category = expenseCategoryAliases[value.toLowerCase()] ?? value;
  return t.expenseCategories[category as ScannedDocument['expenseCategory']] ?? value;
};
const getPaymentMethodLabel = (t: Translation, value: ScannedDocument['paymentMethod']) =>
  t.paymentMethods[value] ?? value;
const getBooleanLabel = (t: Translation, value: boolean) => (value ? t.yes : t.no);
const getFieldLabel = (t: Translation, field: FieldLabelKey) => t.fields[field] || translations.de.fields[field] || field;
const getModeFieldLabel = (t: Translation, appMode: AppMode, field: FieldLabelKey) =>
  appMode === 'business' && field === 'creditorName' ? t.fields.businessCreditorName : getFieldLabel(t, field);

const copyToClipboard = (value: string) => Clipboard.setStringAsync(value);

const isReminderOrInkassoDocument = (document: ScannedDocument) =>
  document.documentType === 'payment_reminder' || document.documentType === 'inkasso_letter';

const isOpenDebtWarningDocument = (document: ScannedDocument) =>
  isReminderOrInkassoDocument(document) && document.paymentStatus !== 'closed' && document.paymentStatus !== 'paid';

const isExpectedReimbursementDocument = (document: ScannedDocument) =>
  document.cashflowType === 'receivable' && receivableOpenStatuses.has(document.paymentStatus);

const getSupplierName = (document: ScannedDocument, fallback: string) =>
  document.supplierName?.trim() || document.creditorName.trim() || document.senderName.trim() || fallback;

const getDocumentTitle = (document: ScannedDocument, appMode: AppMode, t: Translation) =>
  appMode === 'business' ? getSupplierName(document, t.unknownSupplier) : document.senderName || document.creditorName || t.unknownSender;

const normalizeMatchText = (value?: string) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const getSupplierMatchNames = (document: ScannedDocument) =>
  [document.supplierName, document.creditorName, document.senderName]
    .map(normalizeMatchText)
    .filter((value): value is string => value.length > 0);

const normalizeSupplierMemoryName = (value?: string) =>
  (value ?? '')
    .toLowerCase()
    .replace(/\b(gmbh|ug|ag|e\.?\s*k\.?|kg|ohg|ltd)\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getSupplierMemoryNames = (document: ScannedDocument) =>
  [document.supplierName, document.creditorName, document.senderName]
    .map(normalizeSupplierMemoryName)
    .filter((value): value is string => value.length > 0);

const hasSupplierMemoryMatch = (a: ScannedDocument, b: ScannedDocument) => {
  const aNames = getSupplierMemoryNames(a);
  const bNames = new Set(getSupplierMemoryNames(b));
  return aNames.some((name) => bNames.has(name));
};

const hasSuggestibleExpenseCategory = (document: ScannedDocument) =>
  !document.expenseCategory ||
  document.expenseCategory === 'other' ||
  normalizeMatchText(document.expenseCategory) === 'sonstiges';

const hasSameSupplierOrCreditor = (a: ScannedDocument, b: ScannedDocument) => {
  const aNames = getSupplierMatchNames(a);
  const bNames = new Set(getSupplierMatchNames(b));
  return aNames.some((name) => bNames.has(name));
};

const hasSameInvoiceNumber = (a: ScannedDocument, b: ScannedDocument) => {
  const aInvoiceNumber = normalizeMatchText(a.invoiceNumber);
  const bInvoiceNumber = normalizeMatchText(b.invoiceNumber);
  return Boolean(aInvoiceNumber && bInvoiceNumber && aInvoiceNumber === bInvoiceNumber);
};

const hasSameAmount = (a: ScannedDocument, b: ScannedDocument) => {
  const aAmount = parseAmount(a.amountTotal);
  const bAmount = parseAmount(b.amountTotal);
  return aAmount > 0 && bAmount > 0 && Math.round(aAmount * 100) === Math.round(bAmount * 100);
};

const hasEditableFieldValue = (document: ScannedDocument, field: EditableField) => {
  const value = document[field];
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
};

const shouldShowEditableField = (document: ScannedDocument, field: EditableField) => {
  if (receivableOnlyFields.has(field)) {
    return document.cashflowType === 'receivable';
  }

  if (paymentPreparationFields.has(field)) {
    return document.cashflowType !== 'receivable' && document.cashflowType !== 'neutral';
  }

  if (reminderOrInkassoFields.has(field)) {
    return isReminderOrInkassoDocument(document) || hasEditableFieldValue(document, field);
  }

  return true;
};

const getVisibleFields = (document: ScannedDocument, fields: EditableField[]) =>
  fields.filter((field) => shouldShowEditableField(document, field));

const getVisibleReviewFields = (document: ScannedDocument, fields: EditableField[], appMode: AppMode) => {
  const visibleFields = getVisibleFields(document, fields);
  return appMode === 'business' ? visibleFields.filter((field) => businessReviewFields.has(field)) : visibleFields;
};

const isAppMode = (value: string | null): value is AppMode =>
  typeof value === 'string' && appModeValues.includes(value as AppMode);

const isBusinessSupplierInvoice = (document: ScannedDocument) =>
  document.appMode === 'business' && document.cashflowType === 'payable' && document.documentType !== 'payment_proof';

const asBusinessSupplierInvoice = (document: ScannedDocument): ScannedDocument => ({
  ...document,
  appMode: 'business',
  documentType: document.documentType === 'unknown' ? 'invoice' : document.documentType,
  cashflowType: 'payable',
  isExpense: true,
  supplierName: document.supplierName || document.creditorName || document.senderName,
  expenseCategory: businessExpenseCategoryValues.includes(document.expenseCategory) ? document.expenseCategory : 'other',
  amountReceivable: '',
  expectedPaymentDate: '',
  receivedDate: '',
});

const getExpenseCategoryValuesForMode = (appMode: AppMode) =>
  appMode === 'business' ? businessExpenseCategoryValues : privateExpenseCategoryValues;

const mentionsMahnbescheid = (document: ScannedDocument) =>
  [
    document.riskNote,
    document.actionRecommendation,
    document.reminderLevel,
    document.branchCategory,
    document.documentType,
  ].some((value) => typeof value === 'string' && /mahnbescheid/i.test(value));

const getPaymentRecipient = (document: ScannedDocument) =>
  document.paymentRecipient || document.creditorName || document.supplierName || document.senderName || '';

const normalizePaymentReferenceValue = (value: string) =>
  value.replace(/ertragsnummer/gi, 'Vertragsnummer');

const normalizeDocumentPaymentReference = (document: ScannedDocument): ScannedDocument => ({
  ...document,
  paymentReference: normalizePaymentReferenceValue(document.paymentReference),
});

const getPaymentReference = (document: ScannedDocument) =>
  normalizePaymentReferenceValue(document.paymentReference || document.invoiceNumber || document.customerNumber || '');

const isPaymentReferenceSuspicious = (value: string) => {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return false;
  }

  return [
    'ihre belegnr',
    'aus der obigen liste',
    'verwendungszweck',
    'bitte angeben',
    'ertragsnummer',
  ].some((phrase) => normalizedValue.includes(phrase));
};

const normalizeQrText = (value: string, maxLength: number) =>
  value.replace(/[\r\n]+/g, ' ').trim().slice(0, maxLength);

const normalizeIbanForQr = (value: string) => value.replace(/\s+/g, '').toUpperCase();

const formatIbanForDisplay = (value: string) =>
  normalizeIbanForQr(value)
    .replace(/(.{4})/g, '$1 ')
    .trim();

const formatEpcAmount = (value: string) => {
  const amount = parseAmount(value);
  if (amount <= 0) {
    return null;
  }

  return `EUR${amount.toFixed(2)}`;
};

const canPreparePayment = (document: ScannedDocument) => {
  if (document.documentType === 'payment_proof') {
    return false;
  }

  if (document.cashflowType !== 'payable' && document.cashflowType !== 'unknown') {
    return false;
  }

  if (blockedPaymentPreparationStatuses.has(document.paymentStatus)) {
    return false;
  }

  return true;
};

const canGenerateSepaQr = (document: ScannedDocument) => {
  if (document.cashflowType !== 'payable' && document.cashflowType !== 'unknown') {
    return false;
  }

  if (blockedPaymentPreparationStatuses.has(document.paymentStatus)) {
    return false;
  }

  return true;
};

const getSepaQrPayload = (document: ScannedDocument, recipient: string, paymentReference: string) => {
  if (!canGenerateSepaQr(document)) {
    return null;
  }

  const qrRecipient = normalizeQrText(recipient, 70);
  const qrIban = normalizeIbanForQr(document.iban);
  const qrAmount = formatEpcAmount(document.amountTotal);
  if (!qrRecipient || !qrIban || !qrAmount) {
    return null;
  }

  const qrBic = normalizeQrText(document.bic, 11);
  const qrReference = normalizeQrText(paymentReference, 35);
  const qrRemittanceText = normalizeQrText(paymentReference, 140);

  return [
    'BCD',
    '002',
    '1',
    'SCT',
    qrBic,
    qrRecipient,
    qrIban,
    qrAmount,
    '',
    qrReference,
    qrRemittanceText,
    'RechnungGuard',
  ].join('\n');
};

const getDetailValue = (t: Translation, document: ScannedDocument, field: EditableField) => {
  if (field === 'documentType') {
    return getDocumentTypeLabel(t, document.documentType);
  }
  if (field === 'paymentStatus') {
    return getPaymentStatusLabel(t, document.paymentStatus);
  }
  if (field === 'urgencyLevel') {
    return getUrgencyLevelLabel(t, document.urgencyLevel);
  }
  if (field === 'cashflowType') {
    return getCashflowTypeLabel(t, document.cashflowType);
  }
  if (field === 'iban') {
    return formatIbanForDisplay(document.iban);
  }
  return String(document[field] ?? '') || '-';
};

const parseAmount = (value: string) => {
  const normalizedValue = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const amount = Number.parseFloat(normalizedValue);
  return Number.isFinite(amount) ? amount : 0;
};

const formatEuro = (value: number) =>
  new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);

const shouldValidatePaymentData = (document: ScannedDocument) => {
  if (document.documentType === 'payment_proof') {
    return false;
  }

  if (document.cashflowType !== 'payable' && document.cashflowType !== 'unknown') {
    return false;
  }

  return paymentDataWarningStatuses.has(document.paymentStatus);
};

const getPaymentDataWarningKeys = (document: ScannedDocument): PaymentDataWarningKey[] => {
  if (!shouldValidatePaymentData(document)) {
    return [];
  }

  return [
    !getPaymentRecipient(document).trim() ? 'missingRecipient' : null,
    parseAmount(document.amountTotal) <= 0 ? 'missingAmount' : null,
    !document.iban.trim() ? 'missingIban' : null,
    !document.paymentReference.trim() || isPaymentReferenceSuspicious(document.paymentReference)
      ? 'missingPaymentReference'
      : null,
    !document.dueDate.trim() ? 'missingDueDate' : null,
  ].filter(Boolean) as PaymentDataWarningKey[];
};

const getDocumentAccountingMonthValue = (document: ScannedDocument) =>
  document.invoiceDate || document.createdAt.slice(0, 10);

const accountantCsvHeaders = [
  'Lieferant',
  'Gläubiger',
  'Rechnungsnummer',
  'Rechnungsdatum',
  'Fälligkeitsdatum',
  'Betrag',
  'Kategorie',
  'Zahlungsstatus',
  'Bezahlt am',
  'IBAN',
  'Verwendungszweck',
];

const escapeCsvCell = (value: string) => {
  const normalizedValue = value.replace(/\r?\n/g, ' ').trim();
  return /[";\n\r]/.test(normalizedValue) ? `"${normalizedValue.replace(/"/g, '""')}"` : normalizedValue;
};

const createAccountantCsv = (documents: ScannedDocument[]) => {
  const exportTranslation = translations.de;
  const rows = documents
    .slice()
    .sort((a, b) => getDocumentAccountingMonthValue(a).localeCompare(getDocumentAccountingMonthValue(b)) || sortByDateDesc(a, b))
    .map((document) => [
      getSupplierName(document, exportTranslation.unknownSupplier),
      document.creditorName,
      document.invoiceNumber,
      document.invoiceDate,
      document.dueDate,
      document.amountTotal,
      getExpenseCategoryLabel(exportTranslation, document.expenseCategory),
      getPaymentStatusLabel(exportTranslation, document.paymentStatus),
      document.paidDate,
      formatIbanForDisplay(document.iban),
      getPaymentReference(document),
    ]);

  return `\uFEFF${[accountantCsvHeaders, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(String(cell ?? ''))).join(';'))
    .join('\n')}`;
};

const formatCardAmount = (value: string) =>
  value
    .replace(/\bEuro\b/gi, '€')
    .replace(/\bEUR\b/g, '€')
    .replace(/\s+/g, ' ')
    .trim();

const isThisMonth = (value: string) => {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
};

const createEmptyCategoryBreakdown = (appMode: AppMode): ExpenseCategorySummary[] =>
  getExpenseCategoryValuesForMode(appMode).map((category) => ({
    category,
    openAmount: 0,
    paidOrReceivedThisMonth: 0,
  }));

const getExpenseSummary = (documents: ScannedDocument[], appMode: AppMode): ExpenseSummary => {
  const summaryDocuments = appMode === 'business' ? documents.filter(isBusinessSupplierInvoice) : documents;
  const categoryBreakdown = createEmptyCategoryBreakdown(appMode);
  const categoryByName = new Map(categoryBreakdown.map((item) => [item.category, item]));

  return summaryDocuments.reduce<ExpenseSummary>(
    (summary, document) => {
      if (document.cashflowType === 'receivable') {
        const receivableAmount = parseAmount(document.amountReceivable || document.amountTotal);
        if (receivableOpenStatuses.has(document.paymentStatus)) {
          summary.expectedReceivableAmount += receivableAmount;
        }
        if (document.paymentStatus === 'received' && isThisMonth(document.receivedDate)) {
          summary.paidOrReceivedThisMonth += receivableAmount;
        }
        return summary;
      }

      if (document.cashflowType !== 'payable' || document.isExpense === false) {
        return summary;
      }

      const amount = parseAmount(document.amountTotal);
      const categorySummary = categoryByName.get(document.expenseCategory) ?? categoryByName.get('other');

      if (openExpenseStatuses.has(document.paymentStatus)) {
        summary.openAmount += amount;
        summary.openInvoiceCount += 1;
        if (categorySummary) {
          categorySummary.openAmount += amount;
        }
      }

      if (document.paymentStatus === 'paid' && isThisMonth(document.paidDate)) {
        summary.paidOrReceivedThisMonth += amount;
        if (categorySummary) {
          categorySummary.paidOrReceivedThisMonth += amount;
        }
      }

      return summary;
    },
    { openAmount: 0, expectedReceivableAmount: 0, paidOrReceivedThisMonth: 0, openInvoiceCount: 0, categoryBreakdown },
  );
};

const formatLocalIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const todayIsoDate = () => formatLocalIsoDate(new Date());

const addDaysToIsoDate = (isoDate: string, days: number) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatLocalIsoDate(date);
};

const getIsoDateValue = (value: string) => {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  const date = new Date(trimmedValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const createEmptyDueDateReminderSummary = (): DueDateReminderSummary => ({
  overdue: [],
  dueToday: [],
  dueSoon: [],
  upcoming: [],
});

const getDueDateReminderState = (document: ScannedDocument): DueDateReminderState | null => {
  if (
    (document.cashflowType !== 'payable' && document.cashflowType !== 'unknown') ||
    !openSupplierPayableStatuses.has(document.paymentStatus)
  ) {
    return null;
  }

  const dueDate = getIsoDateValue(document.dueDate);
  if (!dueDate) {
    return null;
  }

  const today = todayIsoDate();
  if (dueDate < today) {
    return 'overdue';
  }
  if (dueDate === today) {
    return 'dueToday';
  }
  if (dueDate <= addDaysToIsoDate(today, 3)) {
    return 'dueSoon';
  }
  if (dueDate <= addDaysToIsoDate(today, 7)) {
    return 'upcoming';
  }

  return null;
};

const getDueDateReminderSummary = (documents: ScannedDocument[]): DueDateReminderSummary =>
  documents.reduce<DueDateReminderSummary>((summary, document) => {
    const state = getDueDateReminderState(document);
    if (state) {
      summary[state].push(document);
    }
    return summary;
  }, createEmptyDueDateReminderSummary());

const getDateDistanceInDays = (a: string, b: string) => {
  if (!a || !b) {
    return Number.POSITIVE_INFINITY;
  }

  const aTime = new Date(`${a}T00:00:00`).getTime();
  const bTime = new Date(`${b}T00:00:00`).getTime();
  if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(aTime - bTime) / (24 * 60 * 60 * 1000);
};

const hasCloseInvoiceDate = (a: ScannedDocument, b: ScannedDocument) =>
  getDateDistanceInDays(a.invoiceDate, b.invoiceDate) <= 7;

const hasCloseDueDate = (a: ScannedDocument, b: ScannedDocument) =>
  getDateDistanceInDays(a.dueDate, b.dueDate) <= 7;

const getEffectiveAppMode = (document: ScannedDocument): AppMode => document.appMode ?? 'private';

const getDuplicateInvoiceCandidate = (
  draft: ScannedDocument | null,
  documents: ScannedDocument[],
): DuplicateInvoiceCandidate | null => {
  if (!draft) {
    return null;
  }

  const draftMode = getEffectiveAppMode(draft);
  let possibleCandidate: DuplicateInvoiceCandidate | null = null;

  for (const document of documents) {
    if (
      document.id === draft.id ||
      getEffectiveAppMode(document) !== draftMode ||
      !hasSameSupplierOrCreditor(draft, document)
    ) {
      continue;
    }

    const sameAmount = hasSameAmount(draft, document);
    if (hasSameInvoiceNumber(draft, document) && sameAmount) {
      return { document, strength: 'strong' };
    }

    if (sameAmount && (hasCloseInvoiceDate(draft, document) || hasCloseDueDate(draft, document))) {
      possibleCandidate = possibleCandidate ?? { document, strength: 'possible' };
    }
  }

  return possibleCandidate;
};

const getSupplierCategorySuggestion = (
  draft: ScannedDocument,
  documents: ScannedDocument[],
  appMode: AppMode,
): SupplierCategorySuggestion | null => {
  if (appMode !== 'business' || !hasSuggestibleExpenseCategory(draft)) {
    return null;
  }

  const categoryValues = new Set(getExpenseCategoryValuesForMode(appMode));
  const matchingDocument = documents
    .filter((document) =>
      document.id !== draft.id &&
      getEffectiveAppMode(document) === appMode &&
      document.expenseCategory !== 'other' &&
      categoryValues.has(document.expenseCategory) &&
      hasSupplierMemoryMatch(draft, document),
    )
    .sort(sortByDateDesc)[0];

  return matchingDocument ? { category: matchingDocument.expenseCategory } : null;
};

const sortByDueDateAsc = (a: ScannedDocument, b: ScannedDocument) => {
  const aDue = a.dueDate || '9999-12-31';
  const bDue = b.dueDate || '9999-12-31';
  if (aDue === bDue) {
    return sortByDateDesc(a, b);
  }
  return aDue.localeCompare(bDue);
};

const getBusinessPayablesDashboard = (documents: ScannedDocument[], unknownSupplier: string): BusinessPayablesDashboard => {
  const supplierInvoices = documents.filter(isBusinessSupplierInvoice);
  const openSupplierInvoices = supplierInvoices
    .filter((document) => openSupplierPayableStatuses.has(document.paymentStatus))
    .sort(sortByDueDateAsc);
  const paidThisMonth = supplierInvoices
    .filter((document) => document.paymentStatus === 'paid' && isThisMonth(document.paidDate))
    .sort(sortByDateDesc);
  const summaries = new Map<string, SupplierSummary>();

  openSupplierInvoices.forEach((document) => {
    const supplierName = getSupplierName(document, unknownSupplier);
    const existing = summaries.get(supplierName) ?? {
      supplierName,
      openInvoiceCount: 0,
      totalOpenAmount: 0,
      nextDueDate: '',
    };

    existing.openInvoiceCount += 1;
    existing.totalOpenAmount += parseAmount(document.amountTotal);
    if (document.dueDate && (!existing.nextDueDate || document.dueDate < existing.nextDueDate)) {
      existing.nextDueDate = document.dueDate;
    }
    summaries.set(supplierName, existing);
  });

  return {
    ...getDueDateReminderSummary(openSupplierInvoices),
    openSupplierInvoices,
    paidThisMonth,
    supplierSummaries: Array.from(summaries.values()).sort((a, b) => {
      if (a.nextDueDate === b.nextDueDate) {
        return b.totalOpenAmount - a.totalOpenAmount;
      }
      return (a.nextDueDate || '9999-12-31').localeCompare(b.nextDueDate || '9999-12-31');
    }),
  };
};

const reminderOrder = ['sevenDaysBefore', 'threeDaysBefore', 'dueDate'] as const;

const formatReminderDate = (value?: string) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getReminderStatusText = (t: Translation, document: ScannedDocument) => {
  const status = document.dueDateReminderStatus;
  if (!status) {
    return t.remindersUnknown;
  }

  if (status.state === 'expo_go_limited') {
    return t.reminderExpoGoLimited;
  }

  const scheduledDates = reminderOrder
    .map((key) => formatReminderDate(status.scheduledFor[key]))
    .filter((value): value is string => Boolean(value));

  if (status.state === 'scheduled' && scheduledDates.length > 0) {
    return `${t.remindersScheduled}: ${scheduledDates.join(', ')}`;
  }

  return t.reminderStates[status.state] ?? t.remindersUnknown;
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [draft, setDraft] = useState<ScannedDocument | null>(null);
  const [supplierCategorySuggestion, setSupplierCategorySuggestion] = useState<SupplierCategorySuggestion | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<ScannedDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingAccountantCsv, setIsExportingAccountantCsv] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const [appMode, setAppMode] = useState<AppMode>('private');
  const [privacyNoticeAccepted, setPrivacyNoticeAccepted] = useState(false);
  const [storeDocumentImages, setStoreDocumentImages] = useState(false);
  const t = translations[language];

  const loadDocuments = useCallback(async () => {
    const storedDocuments = await getDocuments();
    setDocuments(storedDocuments.sort(sortByDateDesc));
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    const loadLocalSettings = async () => {
      const [storedLanguage, storedAppMode] = await Promise.all([
        AsyncStorage.getItem(LANGUAGE_STORAGE_KEY),
        AsyncStorage.getItem(APP_MODE_STORAGE_KEY),
      ]);
      if (isLanguage(storedLanguage)) {
        setLanguage(storedLanguage);
      }
      if (isAppMode(storedAppMode)) {
        setAppMode(storedAppMode);
      }
    };

    loadLocalSettings();
  }, []);

  useEffect(() => {
    const loadPrivacySettings = async () => {
      const [storedPrivacyNoticeAccepted, storedStoreDocumentImages] = await Promise.all([
        AsyncStorage.getItem(PRIVACY_NOTICE_ACCEPTED_STORAGE_KEY),
        AsyncStorage.getItem(STORE_DOCUMENT_IMAGES_STORAGE_KEY),
      ]);
      setPrivacyNoticeAccepted(storedPrivacyNoticeAccepted === 'true');
      setStoreDocumentImages(storedStoreDocumentImages === 'true');
    };

    loadPrivacySettings();
  }, []);

  const changeLanguage = async (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  };

  const changeAppMode = async (nextAppMode: AppMode) => {
    setAppMode(nextAppMode);
    await AsyncStorage.setItem(APP_MODE_STORAGE_KEY, nextAppMode);
  };

  const changeStoreDocumentImages = async (enabled: boolean) => {
    setStoreDocumentImages(enabled);
    await AsyncStorage.setItem(STORE_DOCUMENT_IMAGES_STORAGE_KEY, enabled ? 'true' : 'false');
  };

  const homeDocuments = useMemo(
    () => (appMode === 'business' ? documents.filter(isBusinessSupplierInvoice) : documents),
    [appMode, documents],
  );

  const urgentDocuments = useMemo(() => homeDocuments.filter(isUrgent).sort((a, b) => {
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  }), [homeDocuments]);

  const recentDocuments = useMemo(() => homeDocuments.slice().sort(sortByDateDesc).slice(0, 8), [homeDocuments]);
  const expenseSummary = useMemo(() => getExpenseSummary(documents, appMode), [appMode, documents]);
  const privateDueDateReminderSummary = useMemo(
    () => getDueDateReminderSummary(appMode === 'private' ? homeDocuments : []),
    [appMode, homeDocuments],
  );
  const duplicateInvoiceCandidate = useMemo(
    () => getDuplicateInvoiceCandidate(draft, documents),
    [documents, draft],
  );
  const businessPayablesDashboard = useMemo(
    () => getBusinessPayablesDashboard(documents, t.unknownSupplier),
    [documents, t.unknownSupplier],
  );
  const debtWarningDocuments = useMemo(
    () => (appMode === 'business' ? [] : homeDocuments.filter(isOpenDebtWarningDocument).sort(sortByDateDesc).slice(0, 5)),
    [appMode, homeDocuments],
  );
  const expectedReimbursementDocuments = useMemo(
    () => (appMode === 'business' ? [] : homeDocuments.filter(isExpectedReimbursementDocument).sort(sortByDateDesc).slice(0, 5)),
    [appMode, homeDocuments],
  );

  useEffect(() => {
    if (screen !== 'scan' || OCR_MODE !== 'backend') {
      setBackendStatus(null);
      return;
    }

    let isActive = true;
    const checkBackendStatus = async () => {
      setBackendStatus('checking');
      try {
        const response = await fetch(BACKEND_HEALTH_URL);
        if (isActive) {
          setBackendStatus(response.ok ? 'reachable' : 'unreachable');
        }
      } catch {
        if (isActive) {
          setBackendStatus('unreachable');
        }
      }
    };

    checkBackendStatus();

    return () => {
      isActive = false;
    };
  }, [screen]);

  const openDocument = (document: ScannedDocument) => {
    setSelectedDocument(document);
    setScreen('detail');
  };

  const changeDraft = (nextDraft: ScannedDocument) => {
    if (
      supplierCategorySuggestion &&
      draft &&
      nextDraft.expenseCategory !== draft.expenseCategory &&
      nextDraft.expenseCategory !== supplierCategorySuggestion.category
    ) {
      setSupplierCategorySuggestion(null);
    } else if (!supplierCategorySuggestion && (!draft || nextDraft.expenseCategory === draft.expenseCategory)) {
      const categorySuggestion = getSupplierCategorySuggestion(nextDraft, documents, appMode);
      if (categorySuggestion) {
        setSupplierCategorySuggestion(categorySuggestion);
        setDraft({ ...nextDraft, expenseCategory: categorySuggestion.category });
        return;
      }
    }

    setDraft(nextDraft);
  };

  const saveDocument = async (document: ScannedDocument) => {
    const savedDocument = await upsertDocument({
      ...normalizeDocumentPaymentReference(document),
      appMode: document.appMode ?? appMode,
      imageUri: storeDocumentImages ? document.imageUri : '',
    });
    setDraft(null);
    setSupplierCategorySuggestion(null);
    setSelectedDocument(savedDocument);
    await loadDocuments();
    setScreen('detail');
  };

  const exportAccountantCsv = async () => {
    if (appMode !== 'business' || isExportingAccountantCsv) {
      return;
    }

    const businessDocuments = documents.filter(isBusinessSupplierInvoice);
    if (businessDocuments.length === 0) {
      Alert.alert(t.exportForAccountant, t.noBusinessDocuments);
      return;
    }

    setIsExportingAccountantCsv(true);
    try {
      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (!isSharingAvailable) {
        Alert.alert(t.exportForAccountant, t.exportUnavailable);
        return;
      }

      const csv = createAccountantCsv(businessDocuments);
      const fileName = `rechnungguard-steuerberater-${new Date().toISOString().slice(0, 10)}.csv`;
      const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!directory) {
        Alert.alert(t.exportForAccountant, t.exportFailed);
        return;
      }

      const fileUri = `${directory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, {
        dialogTitle: t.exportForAccountant,
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (error) {
      Alert.alert(t.exportForAccountant, t.exportFailed);
    } finally {
      setIsExportingAccountantCsv(false);
    }
  };

  const confirmAction = (title: string, message: string) =>
    new Promise<boolean>((resolve) => {
      Alert.alert(title, message, [
        { text: t.cancel, style: 'cancel', onPress: () => resolve(false) },
        { text: t.delete, style: 'destructive', onPress: () => resolve(true) },
      ]);
    });

  const confirmPrivacyNotice = () =>
    new Promise<boolean>((resolve) => {
      Alert.alert(t.privacyNoticeTitle, t.ocrPrivacyNotice, [
        { text: t.cancel, style: 'cancel', onPress: () => resolve(false) },
        { text: t.understood, onPress: () => resolve(true) },
      ]);
    });

  const deleteSelectedDocument = async () => {
    if (!selectedDocument?.id) {
      return;
    }

    const confirmed = await confirmAction(t.deleteDocument, t.deleteDocumentConfirm);
    if (!confirmed) {
      return;
    }

    await deleteDocument(selectedDocument.id);
    setSelectedDocument(null);
    await loadDocuments();
    setScreen('home');
  };

  const deleteAllLocalData = async () => {
    const confirmed = await confirmAction(t.deleteAllLocalData, t.deleteAllLocalDataConfirm);
    if (!confirmed) {
      return;
    }

    await deleteAllDocuments();
    await AsyncStorage.multiRemove([
      LANGUAGE_STORAGE_KEY,
      APP_MODE_STORAGE_KEY,
      PRIVACY_NOTICE_ACCEPTED_STORAGE_KEY,
      STORE_DOCUMENT_IMAGES_STORAGE_KEY,
    ]);
    setDocuments([]);
    setDraft(null);
    setSupplierCategorySuggestion(null);
    setSelectedDocument(null);
    setSelectedImageUri(null);
    setLanguage(defaultLanguage);
    setAppMode('private');
    setPrivacyNoticeAccepted(false);
    setStoreDocumentImages(false);
    setScreen('home');
  };

  const updateDocumentStatus = async (status: Extract<PaymentStatus, 'expected' | 'paid' | 'received' | 'disputed' | 'closed'>) => {
    if (!selectedDocument?.id) {
      Alert.alert(t.documentDetails, 'Kein Dokument ausgewahlt.');
      return;
    }

    if (isSavingStatus) {
      return;
    }

    setIsSavingStatus(true);
    try {
      const updatedDocument: ScannedDocument = {
        ...selectedDocument,
        paymentStatus: status,
        paidDate: status === 'paid' ? todayIsoDate() : selectedDocument.paidDate,
        receivedDate: status === 'received' ? todayIsoDate() : selectedDocument.receivedDate,
      };

      const savedDocument = await upsertDocument(updatedDocument);
      setSelectedDocument(savedDocument);
      await loadDocuments();
      Alert.alert(t.documentDetails, getPaymentStatusLabel(t, savedDocument.paymentStatus));
    } catch (error) {
      Alert.alert(t.documentDetails, 'Status konnte nicht gespeichert werden.');
    } finally {
      setIsSavingStatus(false);
    }
  };

  const chooseImage = async () => {
    if (isLoading) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t.permissionTitle, t.permissionMessage);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (result.canceled) {
      return;
    }

    setSelectedImageUri(result.assets[0].uri);
  };

  const processSelectedImage = async () => {
    if (!selectedImageUri || isLoading) {
      return;
    }

    if (!privacyNoticeAccepted) {
      const confirmed = await confirmPrivacyNotice();
      if (!confirmed) {
        return;
      }

      setPrivacyNoticeAccepted(true);
      await AsyncStorage.setItem(PRIVACY_NOTICE_ACCEPTED_STORAGE_KEY, 'true');
    }

    setDraft(null);
    setSupplierCategorySuggestion(null);
    setIsLoading(true);
    try {
      try {
        const scannedDocument = await scanDocumentWithOcr(selectedImageUri);
        if (OCR_MODE === 'backend' && scannedDocument.ocrSource !== 'backend') {
          throw new Error('Backend OCR mode did not return backend data.');
        }
        const document = normalizeDocumentPaymentReference(
          appMode === 'business' ? asBusinessSupplierInvoice(scannedDocument) : scannedDocument,
        );
        const categorySuggestion = getSupplierCategorySuggestion(document, documents, appMode);
        const documentWithSuggestion = categorySuggestion
          ? { ...document, expenseCategory: categorySuggestion.category }
          : document;
        setSupplierCategorySuggestion(categorySuggestion);
        setDraft({
          ...documentWithSuggestion,
          imageUri: storeDocumentImages ? documentWithSuggestion.imageUri : '',
        });
        setScreen('review');
      } catch (error) {
        setDraft(null);
        setSupplierCategorySuggestion(null);
        setScreen('scan');
        Alert.alert(t.ocrFailedTitle, t.ocrFailedManualReview);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f7f4ee" />
      <View style={styles.appShell}>
        {screen !== 'home' ? (
          <Pressable
            disabled={isLoading}
            hitSlop={10}
            style={[styles.backButton, isLoading && styles.disabledButton]}
            onPress={() => setScreen(screen === 'paymentPreparation' ? 'detail' : 'home')}
          >
            <Text style={styles.backButtonText}>{t.back}</Text>
          </Pressable>
        ) : null}

        {screen === 'home' ? (
          <HomeScreen
            urgentDocuments={urgentDocuments}
            debtWarningDocuments={debtWarningDocuments}
            expectedReimbursementDocuments={expectedReimbursementDocuments}
            recentDocuments={recentDocuments}
            expenseSummary={expenseSummary}
            privateDueDateReminderSummary={privateDueDateReminderSummary}
            businessPayablesDashboard={businessPayablesDashboard}
            appMode={appMode}
            language={language}
            storeDocumentImages={storeDocumentImages}
            isExportingAccountantCsv={isExportingAccountantCsv}
            t={t}
            onChangeAppMode={changeAppMode}
            onChangeLanguage={changeLanguage}
            onChangeStoreDocumentImages={changeStoreDocumentImages}
            onDeleteAllLocalData={deleteAllLocalData}
            onExportAccountantCsv={exportAccountantCsv}
            onScan={() => {
              setSelectedImageUri(null);
              setDraft(null);
              setSupplierCategorySuggestion(null);
              setScreen('scan');
            }}
            onOpenDocument={openDocument}
          />
        ) : null}

        {screen === 'scan' ? (
          <ScanScreen
            backendStatus={backendStatus}
            appMode={appMode}
            imageUri={selectedImageUri}
            isLoading={isLoading}
            t={t}
            onPickImage={chooseImage}
            onProcessImage={processSelectedImage}
          />
        ) : null}

        {screen === 'review' && draft ? (
          <ReviewScreen
            draft={draft}
            duplicateCandidate={duplicateInvoiceCandidate}
            categorySuggestion={supplierCategorySuggestion}
            appMode={appMode}
            t={t}
            onChange={changeDraft}
            onSave={() => saveDocument(draft)}
          />
        ) : null}

        {screen === 'detail' && selectedDocument ? (
          <DetailScreen
            document={selectedDocument}
            appMode={appMode}
            isSavingStatus={isSavingStatus}
            t={t}
            onChange={setSelectedDocument}
            onPreparePayment={() => setScreen('paymentPreparation')}
            onDeleteDocument={deleteSelectedDocument}
            onUpdateStatus={updateDocumentStatus}
            onSave={async (document) => {
              const savedDocument = await upsertDocument({
                ...normalizeDocumentPaymentReference(document),
                appMode: document.appMode ?? appMode,
                imageUri: storeDocumentImages ? document.imageUri : '',
              });
              setSelectedDocument(savedDocument);
              await loadDocuments();
            }}
          />
        ) : null}

        {screen === 'paymentPreparation' && selectedDocument ? (
          <PaymentPreparationScreen
            document={selectedDocument}
            isSavingStatus={isSavingStatus}
            t={t}
            onMarkAsPaid={async () => {
              await updateDocumentStatus('paid');
              setScreen('detail');
            }}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function HomeScreen({
  urgentDocuments,
  debtWarningDocuments,
  expectedReimbursementDocuments,
  recentDocuments,
  expenseSummary,
  privateDueDateReminderSummary,
  businessPayablesDashboard,
  appMode,
  language,
  storeDocumentImages,
  isExportingAccountantCsv,
  t,
  onChangeAppMode,
  onChangeLanguage,
  onChangeStoreDocumentImages,
  onDeleteAllLocalData,
  onExportAccountantCsv,
  onScan,
  onOpenDocument,
}: {
  urgentDocuments: ScannedDocument[];
  debtWarningDocuments: ScannedDocument[];
  expectedReimbursementDocuments: ScannedDocument[];
  recentDocuments: ScannedDocument[];
  expenseSummary: ExpenseSummary;
  privateDueDateReminderSummary: DueDateReminderSummary;
  businessPayablesDashboard: BusinessPayablesDashboard;
  appMode: AppMode;
  language: Language;
  storeDocumentImages: boolean;
  isExportingAccountantCsv: boolean;
  t: Translation;
  onChangeAppMode: (appMode: AppMode) => void;
  onChangeLanguage: (language: Language) => void;
  onChangeStoreDocumentImages: (enabled: boolean) => void;
  onDeleteAllLocalData: () => void;
  onExportAccountantCsv: () => void;
  onScan: () => void;
  onOpenDocument: (document: ScannedDocument) => void;
}) {
  const hasDocuments = recentDocuments.length > 0;
  const scanLabel = appMode === 'business' ? t.scanSupplierInvoice : t.scanBillOrLetter;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.62}
          ellipsizeMode="clip"
          style={styles.brand}
        >
          {t.appTitle}
        </Text>
        <Text style={styles.promise}>{t.promise}</Text>
      </View>

      <View style={styles.languageSetting}>
        <Text style={styles.inputLabel}>{t.appModeSetting}</Text>
        <View style={styles.languageButtons}>
          <Pressable
            style={[styles.languageButton, appMode === 'private' && styles.languageButtonSelected]}
            onPress={() => onChangeAppMode('private')}
          >
            <Text style={[styles.languageButtonText, appMode === 'private' && styles.languageButtonTextSelected]}>
              {t.privateMode}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.languageButton, appMode === 'business' && styles.languageButtonSelected]}
            onPress={() => onChangeAppMode('business')}
          >
            <Text style={[styles.languageButtonText, appMode === 'business' && styles.languageButtonTextSelected]}>
              {t.businessMode}
            </Text>
          </Pressable>
        </View>
        {appMode === 'business' ? <Text style={styles.settingHint}>{t.businessHelperText}</Text> : null}
      </View>

      <View style={styles.languageSetting}>
        <Text style={styles.inputLabel}>{t.languageSetting}</Text>
        <View style={styles.languageButtons}>
          <Pressable
            style={[styles.languageButton, language === 'de' && styles.languageButtonSelected]}
            onPress={() => onChangeLanguage('de')}
          >
            <Text style={[styles.languageButtonText, language === 'de' && styles.languageButtonTextSelected]}>
              {t.languageDeutsch}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.languageButton, language === 'en' && styles.languageButtonSelected]}
            onPress={() => onChangeLanguage('en')}
          >
            <Text style={[styles.languageButtonText, language === 'en' && styles.languageButtonTextSelected]}>
              {t.languageEnglish}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable style={styles.primaryButton} onPress={onScan}>
        <Text style={styles.primaryButtonText}>{scanLabel}</Text>
      </Pressable>

      <PrivacySettingsSection
        storeDocumentImages={storeDocumentImages}
        t={t}
        onChangeStoreDocumentImages={onChangeStoreDocumentImages}
        onDeleteAllLocalData={onDeleteAllLocalData}
      />

      {appMode === 'business' ? (
        <View>
          <Pressable
            disabled={isExportingAccountantCsv}
            style={[styles.secondaryFullButton, isExportingAccountantCsv && styles.disabledButton]}
            onPress={onExportAccountantCsv}
          >
            <Text style={styles.secondaryFullButtonText}>{t.exportForAccountant}</Text>
          </Pressable>
          <Text style={styles.settingHint}>{t.accountantExportHelperText}</Text>
        </View>
      ) : null}

      {appMode === 'business' ? (
        <BusinessPayablesSections
          dashboard={businessPayablesDashboard}
          t={t}
          onOpenDocument={onOpenDocument}
        />
      ) : (
        <>
          <DueDateSummaryCard title={t.privateDueDateSummaryTitle} summary={privateDueDateReminderSummary} t={t} />

          {urgentDocuments.length > 0 ? (
            <>
              <SectionTitle title={t.urgentUnpaidBills} />
              {urgentDocuments.map((document) => (
                <DocumentRow key={document.id} document={document} t={t} onPress={() => onOpenDocument(document)} urgent />
              ))}
            </>
          ) : null}

          {debtWarningDocuments.length > 0 ? (
            <>
              <SectionTitle title={t.debtWarnings} />
              {debtWarningDocuments.map((document) => (
                <DocumentRow key={document.id} document={document} t={t} onPress={() => onOpenDocument(document)} urgent />
              ))}
            </>
          ) : null}

          {expectedReimbursementDocuments.length > 0 ? (
            <>
              <SectionTitle title={t.expectedReimbursements} />
              {expectedReimbursementDocuments.map((document) => (
                <DocumentRow key={document.id} document={document} t={t} onPress={() => onOpenDocument(document)} />
              ))}
            </>
          ) : null}
        </>
      )}

      <ExpenseSummarySection summary={expenseSummary} appMode={appMode} t={t} />

      {hasDocuments ? (
        <SectionTitle title={appMode === 'business' ? t.recentScannedSupplierInvoices : t.recentScannedDocuments} />
      ) : null}
      {!hasDocuments ? (
        <EmptyState text={appMode === 'business' ? t.supplierInvoicesEmpty : t.scannedDocumentsEmpty} />
      ) : (
        recentDocuments.map((document) => (
          <DocumentRow key={document.id} document={document} appMode={appMode} t={t} onPress={() => onOpenDocument(document)} />
        ))
      )}
    </ScrollView>
  );
}

function PrivacySettingsSection({
  storeDocumentImages,
  t,
  onChangeStoreDocumentImages,
  onDeleteAllLocalData,
}: {
  storeDocumentImages: boolean;
  t: Translation;
  onChangeStoreDocumentImages: (enabled: boolean) => void;
  onDeleteAllLocalData: () => void;
}) {
  return (
    <View style={styles.privacySettings}>
      <Text style={styles.sectionTitle}>{t.privacyNoticeTitle}</Text>
      <Text style={styles.paymentSafetyNote}>{t.privacySummary}</Text>
      <View style={styles.settingRow}>
        <View style={styles.settingTextBlock}>
          <Text style={styles.inputLabel}>{t.storeDocumentImages}</Text>
          <Text style={styles.settingHint}>{t.storeDocumentImagesHint}</Text>
        </View>
        <Pressable
          style={[styles.settingToggleButton, storeDocumentImages && styles.settingToggleButtonEnabled]}
          onPress={() => onChangeStoreDocumentImages(!storeDocumentImages)}
        >
          <Text style={[styles.settingToggleButtonText, storeDocumentImages && styles.settingToggleButtonTextEnabled]}>
            {storeDocumentImages ? t.on : t.off}
          </Text>
        </Pressable>
      </View>
      <Pressable style={styles.secondaryFullButton} onPress={onDeleteAllLocalData}>
        <Text style={styles.secondaryFullButtonText}>{t.deleteAllLocalData}</Text>
      </Pressable>
    </View>
  );
}

function BusinessPayablesSections({
  dashboard,
  t,
  onOpenDocument,
}: {
  dashboard: BusinessPayablesDashboard;
  t: Translation;
  onOpenDocument: (document: ScannedDocument) => void;
}) {
  return (
    <>
      <DueDateSummaryCard title={t.businessDueDateSummaryTitle} summary={dashboard} t={t} showUpcoming={false} />
      <BusinessDocumentSection
        title={t.overdue}
        documents={dashboard.overdue}
        t={t}
        urgent
        onOpenDocument={onOpenDocument}
      />
      <BusinessDocumentSection
        title={t.dueToday}
        documents={dashboard.dueToday}
        t={t}
        urgent
        onOpenDocument={onOpenDocument}
      />
      <BusinessDocumentSection
        title={t.dueSoon}
        documents={dashboard.dueSoon}
        t={t}
        onOpenDocument={onOpenDocument}
      />
      <SupplierSummarySection summaries={dashboard.supplierSummaries} t={t} />
      <BusinessDocumentSection
        title={t.openSupplierInvoicesSection}
        documents={dashboard.openSupplierInvoices}
        t={t}
        onOpenDocument={onOpenDocument}
      />
      <BusinessDocumentSection
        title={t.paidThisMonthSection}
        documents={dashboard.paidThisMonth}
        t={t}
        onOpenDocument={onOpenDocument}
      />
    </>
  );
}

function DueDateSummaryCard({
  title,
  summary,
  t,
  showUpcoming = true,
}: {
  title: string;
  summary: DueDateReminderSummary;
  t: Translation;
  showUpcoming?: boolean;
}) {
  return (
    <View style={styles.businessDueDateSummaryCard}>
      <Text style={styles.businessDueDateSummaryTitle}>{title}</Text>
      <View style={styles.businessDueDateSummaryGrid}>
        <Text style={styles.businessDueDateSummaryItem}>
          {t.overdue}: {summary.overdue.length}
        </Text>
        <Text style={styles.businessDueDateSummaryItem}>
          {t.dueToday}: {summary.dueToday.length}
        </Text>
        <Text style={styles.businessDueDateSummaryItem}>
          {t.dueSoonSummary}: {summary.dueSoon.length}
        </Text>
        {showUpcoming ? (
          <Text style={styles.businessDueDateSummaryItem}>
            {t.upcomingSummary}: {summary.upcoming.length}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function BusinessDocumentSection({
  title,
  documents,
  t,
  urgent = false,
  onOpenDocument,
}: {
  title: string;
  documents: ScannedDocument[];
  t: Translation;
  urgent?: boolean;
  onOpenDocument: (document: ScannedDocument) => void;
}) {
  return (
    <>
      <SectionTitle title={title} />
      {documents.length > 0 ? (
        documents.map((document) => (
          <DocumentRow
            key={document.id}
            document={document}
            appMode="business"
            t={t}
            urgent={urgent}
            onPress={() => onOpenDocument(document)}
          />
        ))
      ) : (
        <EmptyState text={t.noBusinessPayables} />
      )}
    </>
  );
}

function SupplierSummarySection({ summaries, t }: { summaries: SupplierSummary[]; t: Translation }) {
  return (
    <>
      <SectionTitle title={t.supplierSummary} />
      {summaries.length > 0 ? (
        <View style={styles.supplierSummaryGrid}>
          {summaries.map((summary) => (
            <View key={summary.supplierName} style={styles.supplierSummaryCard}>
              <Text style={styles.supplierSummaryName}>{summary.supplierName}</Text>
              <View style={styles.supplierSummaryMetrics}>
                <Text style={styles.supplierSummaryMetric}>
                  {t.openInvoicesShort}: {summary.openInvoiceCount}
                </Text>
                <Text style={styles.supplierSummaryMetric}>{formatEuro(summary.totalOpenAmount)}</Text>
                <Text style={styles.supplierSummaryMuted}>
                  {t.nextDueDate}: {summary.nextDueDate || '-'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState text={t.noBusinessPayables} />
      )}
    </>
  );
}

function ScanScreen({
  backendStatus,
  appMode,
  imageUri,
  isLoading,
  t,
  onPickImage,
  onProcessImage,
}: {
  backendStatus: BackendStatus | null;
  appMode: AppMode;
  imageUri: string | null;
  isLoading: boolean;
  t: Translation;
  onPickImage: () => void;
  onProcessImage: () => void;
}) {
  const statusText =
    backendStatus === 'checking'
      ? t.ocrRunning
      : backendStatus === 'reachable'
        ? t.backendReachable
        : backendStatus === 'unreachable'
          ? t.backendUnreachable
          : null;

  return (
    <ScrollView contentContainerStyle={styles.scanContent}>
      <Text style={styles.screenTitle}>{appMode === 'business' ? t.scanSupplierInvoice : t.scanBillOrLetter}</Text>
      {appMode === 'business' ? <Text style={styles.subtleText}>{t.businessHelperText}</Text> : null}
      <Text style={styles.paymentSafetyNote}>{t.aiDisclaimer}</Text>
      <View style={styles.statusBadgeGroup}>
        {statusText ? <Text style={styles.modeBadge}>{statusText}</Text> : null}
      </View>
      <Pressable disabled={isLoading} style={[styles.primaryButton, isLoading && styles.disabledButton]} onPress={onPickImage}>
        <Text style={styles.primaryButtonText}>{imageUri ? t.changeImage : t.pickImage}</Text>
      </Pressable>
      {imageUri ? (
        <>
          <ImagePreview imageUri={imageUri} t={t} />
          <Pressable
            disabled={isLoading}
            style={[styles.primaryButton, isLoading && styles.disabledButton]}
            onPress={onProcessImage}
          >
            <Text style={styles.primaryButtonText}>{isLoading ? t.ocrRunning : t.processInvoice}</Text>
          </Pressable>
        </>
      ) : null}
      {isLoading ? (
        <View style={styles.processingState}>
          <ActivityIndicator color="#0d5c63" size="large" style={styles.loader} />
          <Text style={styles.processingText}>{t.ocrRunning}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function ReviewScreen({
  draft,
  duplicateCandidate,
  categorySuggestion,
  appMode,
  t,
  onChange,
  onSave,
}: {
  draft: ScannedDocument;
  duplicateCandidate: DuplicateInvoiceCandidate | null;
  categorySuggestion: SupplierCategorySuggestion | null;
  appMode: AppMode;
  t: Translation;
  onChange: (document: ScannedDocument) => void;
  onSave: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.screenTitle}>{t.reviewScan}</Text>
      <ImagePreview imageUri={draft.imageUri} t={t} />
      {duplicateCandidate ? (
        <DuplicateInvoiceWarning candidate={duplicateCandidate} t={t} />
      ) : null}
      {appMode === 'business' && categorySuggestion ? (
        <SupplierCategorySuggestionCard suggestion={categorySuggestion} t={t} />
      ) : null}
      <Text style={styles.paymentSafetyNote}>{t.aiDisclaimer}</Text>
      <PaymentDataWarningCard document={draft} t={t} />
      <DocumentForm document={draft} appMode={appMode} t={t} onChange={onChange} />
      <Pressable style={styles.primaryButton} onPress={onSave}>
        <Text style={styles.primaryButtonText}>{t.save}</Text>
      </Pressable>
    </ScrollView>
  );
}

function DuplicateInvoiceWarning({
  candidate,
  t,
}: {
  candidate: DuplicateInvoiceCandidate;
  t: Translation;
}) {
  const existingDocument = candidate.document;

  return (
    <View style={styles.duplicateWarningCard}>
      <Text style={styles.duplicateWarningTitle}>{t.possibleDuplicateTitle}</Text>
      <Text style={styles.duplicateWarningText}>{t.possibleDuplicateText}</Text>
      <DuplicateComparisonRow
        label={t.duplicateExistingSupplier}
        value={getSupplierName(existingDocument, t.unknownSender)}
      />
      <DuplicateComparisonRow label={t.duplicateExistingAmount} value={existingDocument.amountTotal} />
      <DuplicateComparisonRow label={t.duplicateExistingInvoiceNumber} value={existingDocument.invoiceNumber} />
      <DuplicateComparisonRow label={t.duplicateExistingInvoiceDate} value={existingDocument.invoiceDate} />
      <DuplicateComparisonRow label={t.duplicateExistingDueDate} value={existingDocument.dueDate} />
      <DuplicateComparisonRow
        label={t.duplicateExistingPaymentStatus}
        value={getPaymentStatusLabel(t, existingDocument.paymentStatus)}
      />
    </View>
  );
}

function DuplicateComparisonRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.duplicateComparisonRow}>
      <Text style={styles.duplicateComparisonLabel}>{label}</Text>
      <Text style={styles.duplicateComparisonValue}>{value || '-'}</Text>
    </View>
  );
}

function SupplierCategorySuggestionCard({
  suggestion,
  t,
}: {
  suggestion: SupplierCategorySuggestion;
  t: Translation;
}) {
  return (
    <View style={styles.categorySuggestionCard}>
      <Text style={styles.categorySuggestionTitle}>{t.categorySuggestionTitle}</Text>
      <Text style={styles.categorySuggestionText}>
        {t.categorySuggestionText.replace('{category}', getExpenseCategoryLabel(t, suggestion.category))}
      </Text>
    </View>
  );
}

function PaymentDataWarningCard({ document, t }: { document: ScannedDocument; t: Translation }) {
  const warningKeys = getPaymentDataWarningKeys(document);
  if (warningKeys.length === 0) {
    return null;
  }

  return (
    <View style={styles.paymentDataWarningCard}>
      <Text style={styles.paymentDataWarningTitle}>{t.paymentDataWarningTitle}</Text>
      <Text style={styles.paymentDataWarningText}>{t.paymentDataWarningText}</Text>
      <View style={styles.paymentDataWarningList}>
        {warningKeys.map((warningKey) => (
          <Text key={warningKey} style={styles.paymentDataWarningItem}>
            - {t.paymentDataWarningItems[warningKey]}
          </Text>
        ))}
      </View>
    </View>
  );
}

function DueDateReminderWarningCard({ state, t }: { state: DueDateReminderState | null; t: Translation }) {
  if (!state) {
    return null;
  }

  return (
    <View style={[styles.dueDateWarningCard, state === 'upcoming' && styles.dueDateHintCard]}>
      <Text style={styles.dueDateWarningText}>{t.dueDateReminderWarnings[state]}</Text>
    </View>
  );
}

function DetailScreen({
  document,
  appMode,
  isSavingStatus,
  t,
  onChange,
  onPreparePayment,
  onDeleteDocument,
  onUpdateStatus,
  onSave,
}: {
  document: ScannedDocument;
  appMode: AppMode;
  isSavingStatus: boolean;
  t: Translation;
  onChange: (document: ScannedDocument) => void;
  onPreparePayment: () => void;
  onDeleteDocument: () => void;
  onUpdateStatus: (status: Extract<PaymentStatus, 'expected' | 'paid' | 'received' | 'disputed' | 'closed'>) => Promise<void>;
  onSave: (document: ScannedDocument) => Promise<void>;
}) {
  const dueDateReminderState = getDueDateReminderState(document);

  const updateAndSave = async (updates: Partial<ScannedDocument>) => {
    const nextDocument = { ...document, ...updates };
    onChange(nextDocument);
    await onSave(nextDocument);
  };

  const setChecklistItem = async (label: string) => {
    await updateAndSave({
      inkassoChecklist: {
        ...document.inkassoChecklist,
        [label]: !document.inkassoChecklist[label],
      },
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.screenTitle}>{t.documentDetails}</Text>
      <ImagePreview imageUri={document.imageUri} t={t} />

      <View style={styles.actionRow}>
        {document.cashflowType === 'payable' ? (
          <>
            {canPreparePayment(document) ? (
              <AppButton label={t.preparePayment} disabled={isSavingStatus} onPress={onPreparePayment} />
            ) : null}
            <AppButton label={t.markAsPaid} disabled={isSavingStatus} onPress={() => onUpdateStatus('paid')} />
          </>
        ) : null}
        {document.cashflowType === 'unknown' && canPreparePayment(document) ? (
          <AppButton label={t.preparePayment} disabled={isSavingStatus} onPress={onPreparePayment} />
        ) : null}
        {document.cashflowType === 'receivable' ? (
          <>
            <AppButton label={t.markAsExpected} disabled={isSavingStatus} onPress={() => onUpdateStatus('expected')} />
            <AppButton label={t.markAsReceived} disabled={isSavingStatus} onPress={() => onUpdateStatus('received')} />
          </>
        ) : null}
        <AppButton label={t.markAsDisputed} disabled={isSavingStatus} onPress={() => onUpdateStatus('disputed')} />
        <AppButton label={t.markAsClosed} disabled={isSavingStatus} onPress={() => onUpdateStatus('closed')} />
        <AppButton label={t.deleteDocument} disabled={isSavingStatus} onPress={onDeleteDocument} />
      </View>

      <PaymentDataWarningCard document={document} t={t} />

      {document.cashflowType === 'receivable' ? (
        <View style={styles.receivableHighlight}>
          <Text style={styles.detailLabel}>{t.expectedReimbursement}</Text>
          <Text style={styles.receivableAmount}>{document.amountReceivable || document.amountTotal || '-'}</Text>
        </View>
      ) : null}

      {isReminderOrInkassoDocument(document) ? <DebtRiskCard document={document} t={t} /> : null}

      <DueDateReminderWarningCard state={dueDateReminderState} t={t} />

      <Text style={styles.inputLabel}>{t.paymentNote}</Text>
      <TextInput
        multiline
        value={document.paymentNote}
        onBlur={() => onSave(document)}
        onChangeText={(value) => onChange({ ...document, paymentNote: value })}
        placeholder={t.paymentNotePlaceholder}
        style={[styles.input, styles.noteInput]}
      />

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{t.reminders}</Text>
        <Text style={styles.detailValue}>{getReminderStatusText(t, document)}</Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{getFieldLabel(t, 'isExpense')}</Text>
        <Text style={styles.detailValue}>{getBooleanLabel(t, document.isExpense)}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{getModeFieldLabel(t, appMode, 'expenseCategory')}</Text>
        <Text style={styles.detailValue}>{getExpenseCategoryLabel(t, document.expenseCategory)}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{getFieldLabel(t, 'paidDate')}</Text>
        <Text style={styles.detailValue}>{document.paidDate || '-'}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{getFieldLabel(t, 'paymentMethod')}</Text>
        <Text style={styles.detailValue}>{getPaymentMethodLabel(t, document.paymentMethod)}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{getFieldLabel(t, 'taxRelevant')}</Text>
        <Text style={styles.detailValue}>{getBooleanLabel(t, document.taxRelevant)}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{getFieldLabel(t, 'reimbursable')}</Text>
        <Text style={styles.detailValue}>{getBooleanLabel(t, document.reimbursable)}</Text>
      </View>

      {getVisibleReviewFields(document, fieldOrder, appMode).map((field) => (
        <View key={field} style={styles.detailRow}>
          <Text style={styles.detailLabel}>{getModeFieldLabel(t, appMode, field)}</Text>
          <Text style={styles.detailValue}>{getDetailValue(t, document, field)}</Text>
        </View>
      ))}

      {document.documentType === 'inkasso_letter' ? (
        <View style={styles.checklist}>
          <Text style={styles.sectionTitle}>{t.inkassoChecklist}</Text>
          {inkassoChecklistItems.map((label, index) => (
            <Pressable key={label} style={styles.checklistRow} onPress={() => setChecklistItem(label)}>
              <View style={[styles.checkbox, document.inkassoChecklist[label] && styles.checkboxChecked]}>
                <Text style={styles.checkboxText}>{document.inkassoChecklist[label] ? 'X' : ''}</Text>
              </View>
              <Text style={styles.checklistText}>{t.checklistItems[index] ?? label}</Text>
            </Pressable>
          ))}
          <Text style={styles.disclaimer}>{t.disclaimer}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function PaymentPreparationScreen({
  document,
  isSavingStatus,
  t,
  onMarkAsPaid,
}: {
  document: ScannedDocument;
  isSavingStatus: boolean;
  t: Translation;
  onMarkAsPaid: () => void | Promise<void>;
}) {
  const recipient = getPaymentRecipient(document);
  const paymentReference = getPaymentReference(document);
  const normalizedIban = normalizeIbanForQr(document.iban);
  const epcAmount = formatEpcAmount(document.amountTotal);
  const sepaQrPayload = getSepaQrPayload(document, recipient, paymentReference);
  const sepaQrWarnings = [
    !recipient ? t.sepaQrWarnings.missingRecipient : null,
    !normalizedIban ? t.sepaQrWarnings.missingIban : null,
    !document.amountTotal || !epcAmount ? t.sepaQrWarnings.missingAmount : null,
  ].filter(Boolean) as string[];

  const copyValue = async (value: string, label: string) => {
    if (!value) {
      return;
    }

    await copyToClipboard(value);
    Alert.alert(t.paymentPreparationTitle, `${label}: ${t.copied}`);
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.screenTitle}>{t.paymentPreparationTitle}</Text>
      <Text style={styles.paymentSafetyNote}>{t.aiDisclaimer}</Text>
      <Text style={styles.paymentSafetyNote}>{t.paymentPreparationSafetyNote}</Text>
      <Text style={styles.paymentSafetyNote}>{t.sepaQrDisclaimer}</Text>

      <PaymentDataWarningCard document={document} t={t} />

      <View style={styles.paymentPreparationPanel}>
        <PaymentPreparationRow label={t.paymentTransferLabels.recipient} value={recipient} />
        <PaymentPreparationRow label={t.paymentTransferLabels.iban} value={formatIbanForDisplay(document.iban)} />
        <PaymentPreparationRow label={t.paymentTransferLabels.amount} value={document.amountTotal} />
        <PaymentPreparationRow label={t.paymentTransferLabels.reference} value={paymentReference} />
        <PaymentPreparationRow label={t.paymentTransferLabels.dueDate} value={document.dueDate} />
      </View>

      <View style={styles.copyButtonGroup}>
        <AppButton
          label={t.copyRecipient}
          disabled={!recipient}
          onPress={() => copyValue(recipient, t.paymentTransferLabels.recipient)}
        />
        <AppButton
          label={t.copyIban}
          disabled={!document.iban}
          onPress={() => copyValue(normalizedIban, t.paymentTransferLabels.iban)}
        />
        <AppButton
          label={t.copyAmount}
          disabled={!document.amountTotal}
          onPress={() => copyValue(document.amountTotal, t.paymentTransferLabels.amount)}
        />
        <AppButton
          label={t.copyPaymentReference}
          disabled={!paymentReference}
          onPress={() => copyValue(paymentReference, t.paymentTransferLabels.reference)}
        />
      </View>

      <View style={styles.sepaQrSection}>
        <Text style={styles.sectionTitle}>{t.sepaQrTitle}</Text>
        <Text style={styles.paymentSafetyNote}>{t.sepaQrHelperText}</Text>
        {sepaQrPayload ? (
          <View style={styles.sepaQrCodeBox}>
            <QRCode value={sepaQrPayload} size={220} backgroundColor="#ffffff" color="#153433" />
          </View>
        ) : (
          <View style={styles.warningList}>
            {sepaQrWarnings.map((warning) => (
              <Text key={warning} style={styles.warningText}>
                {warning}
              </Text>
            ))}
          </View>
        )}
      </View>

      <Pressable
        disabled={isSavingStatus}
        style={[styles.primaryButton, isSavingStatus && styles.disabledButton]}
        onPress={onMarkAsPaid}
      >
        <Text style={styles.primaryButtonText}>{t.markAsPaid}</Text>
      </Pressable>
    </ScrollView>
  );
}

function DebtRiskCard({ document, t }: { document: ScannedDocument; t: Translation }) {
  const fees = [document.reminderFee, document.collectionFee].filter(Boolean).join(' / ');
  const hasCriticalDeadline = document.urgencyLevel === 'critical';
  const mahnbescheidMentioned = mentionsMahnbescheid(document);

  return (
    <View style={styles.debtRiskCard}>
      <Text style={styles.debtRiskTitle}>{t.debtRiskTitle}</Text>
      <DebtRiskRow label={t.debtRiskLabels.criticalDeadline} value={hasCriticalDeadline ? t.yes : t.no} />
      <DebtRiskRow label={t.debtRiskLabels.mahnbescheidMentioned} value={mahnbescheidMentioned ? t.yes : t.no} />
      <DebtRiskRow label={t.debtRiskLabels.originalAmount} value={document.originalAmount} />
      <DebtRiskRow label={t.debtRiskLabels.fees} value={fees} />
      <DebtRiskRow label={t.debtRiskLabels.caseNumber} value={document.caseNumber} />
      <DebtRiskRow label={t.debtRiskLabels.originalCreditor} value={document.originalCreditorName} />
      <DebtRiskRow label={t.debtRiskLabels.nextSteps} value={document.actionRecommendation || document.riskNote} multiline />
      <Text style={styles.debtRiskDisclaimer}>{t.debtRiskDisclaimer}</Text>
    </View>
  );
}

function DebtRiskRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <View style={styles.debtRiskRow}>
      <Text style={styles.debtRiskLabel}>{label}</Text>
      <Text style={[styles.debtRiskValue, multiline && styles.debtRiskValueMultiline]}>{value || '-'}</Text>
    </View>
  );
}

function PaymentPreparationRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.paymentPreparationRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>
        {value || '-'}
      </Text>
    </View>
  );
}

function AppButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      android_ripple={{ color: '#d9e8e5' }}
      disabled={disabled}
      hitSlop={12}
      style={({ pressed }) => [
        styles.appButton,
        pressed && !disabled && styles.appButtonPressed,
        disabled && styles.disabledButton,
      ]}
      onPress={onPress}
    >
      <Text style={styles.appButtonText}>{label}</Text>
    </Pressable>
  );
}

function DocumentForm({
  document,
  appMode,
  t,
  onChange,
}: {
  document: ScannedDocument;
  appMode: AppMode;
  t: Translation;
  onChange: (document: ScannedDocument) => void;
}) {
  const updateField = (field: EditableField, value: string) => {
    onChange({ ...document, [field]: value });
  };

  const renderField = (field: EditableField) => {
    const options =
      field === 'documentType'
        ? documentTypeValues
        : field === 'paymentStatus'
          ? appMode === 'business' ? businessPaymentStatusValues : paymentStatusValues
          : field === 'cashflowType'
            ? cashflowTypeValues
            : field === 'urgencyLevel'
              ? urgencyLevelValues
              : null;
    const label = getModeFieldLabel(t, appMode, field);

    return (
      <View key={field} style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{label}</Text>
        {options ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pillScroller}
            contentContainerStyle={styles.pillRow}
          >
            {options.map((option) => (
              <Pressable
                key={option}
                style={[styles.pill, document[field] === option && styles.pillSelected]}
                onPress={() => updateField(field, option)}
              >
                <Text style={[styles.pillText, document[field] === option && styles.pillTextSelected]}>
                  {field === 'documentType'
                    ? getDocumentTypeLabel(t, option as DocumentType)
                    : field === 'paymentStatus'
                      ? getPaymentStatusLabel(t, option as ScannedDocument['paymentStatus'])
                      : field === 'cashflowType'
                        ? getCashflowTypeLabel(t, option as ScannedDocument['cashflowType'])
                        : getUrgencyLevelLabel(t, option as ScannedDocument['urgencyLevel'])}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <TextInput
            value={field === 'iban' ? formatIbanForDisplay(document.iban) : String(document[field] ?? '')}
            onChangeText={(value) => updateField(field, field === 'iban' ? normalizeIbanForQr(value) : value)}
            placeholder={label}
            autoCapitalize={field === 'iban' ? 'characters' : undefined}
            style={styles.input}
          />
        )}
      </View>
    );
  };

  const primaryFields = getVisibleReviewFields(document, primaryReviewFields, appMode);
  const advancedFields = getVisibleReviewFields(document, advancedReviewFields, appMode);

  return (
    <View>
      {primaryFields.map(renderField)}
      {advancedFields.length > 0 ? (
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>{t.moreDetails}</Text>
          {advancedFields.map(renderField)}
        </View>
      ) : null}
      <ExpenseReviewFields document={document} appMode={appMode} t={t} onChange={onChange} />
    </View>
  );
}

function ExpenseSummarySection({ summary, appMode, t }: { summary: ExpenseSummary; appMode: AppMode; t: Translation }) {
  const activeCategories = summary.categoryBreakdown.filter(
    (item) => item.openAmount > 0 || item.paidOrReceivedThisMonth > 0,
  );

  return (
    <View style={styles.summarySection}>
      <Text style={styles.sectionTitle}>{appMode === 'business' ? t.businessExpenseSummary : t.expenseSummary}</Text>
      <View style={styles.summaryGrid}>
        <SummaryTile label={t.openPayableAmount} value={formatEuro(summary.openAmount)} />
        {appMode === 'private' ? (
          <SummaryTile label={t.expectedReceivableAmount} value={formatEuro(summary.expectedReceivableAmount)} />
        ) : null}
        <SummaryTile label={t.paidOrReceivedThisMonth} value={formatEuro(summary.paidOrReceivedThisMonth)} />
        <SummaryTile
          label={appMode === 'business' ? t.openSupplierInvoiceCount : t.openInvoiceCount}
          value={String(summary.openInvoiceCount)}
        />
      </View>
      {activeCategories.length > 0 ? (
        <>
          <Text style={styles.categoryBreakdownTitle}>{t.categoryBreakdown}</Text>
          <View style={styles.categoryBreakdownList}>
            {activeCategories.map((item) => (
              <View key={item.category} style={styles.categoryBreakdownRow}>
                <Text style={styles.categoryBreakdownName}>{getExpenseCategoryLabel(t, item.category)}</Text>
                <View style={styles.categoryBreakdownAmounts}>
                  {item.openAmount > 0 ? (
                    <Text style={styles.categoryMetricValue}>{formatEuro(item.openAmount)}</Text>
                  ) : null}
                  {item.paidOrReceivedThisMonth > 0 ? (
                    <Text style={styles.categoryMetricMuted}>{formatEuro(item.paidOrReceivedThisMonth)}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryTile}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.summaryValue}>
        {value}
      </Text>
    </View>
  );
}

function ExpenseReviewFields({
  document,
  appMode,
  t,
  onChange,
}: {
  document: ScannedDocument;
  appMode: AppMode;
  t: Translation;
  onChange: (document: ScannedDocument) => void;
}) {
  const toggleField = (field: 'taxRelevant' | 'reimbursable') => {
    onChange({ ...document, [field]: !document[field], isExpense: document.cashflowType === 'payable' });
  };
  const categoryValues = getExpenseCategoryValuesForMode(appMode);

  return (
    <View style={styles.formSection}>
      <Text style={styles.sectionTitle}>{t.categorization}</Text>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{getModeFieldLabel(t, appMode, 'expenseCategory')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroller}
          contentContainerStyle={styles.pillRow}
        >
          {categoryValues.map((option) => (
            <Pressable
              key={option}
              style={[styles.pill, document.expenseCategory === option && styles.pillSelected]}
              onPress={() => onChange({ ...document, expenseCategory: option, isExpense: document.cashflowType === 'payable' })}
            >
              <Text style={[styles.pillText, document.expenseCategory === option && styles.pillTextSelected]}>
                {getExpenseCategoryLabel(t, option)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleButton, document.taxRelevant && styles.pillSelected]}
          onPress={() => toggleField('taxRelevant')}
        >
          <Text style={[styles.pillText, document.taxRelevant && styles.pillTextSelected]}>
            {getFieldLabel(t, 'taxRelevant')}: {getBooleanLabel(t, document.taxRelevant)}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, document.reimbursable && styles.pillSelected]}
          onPress={() => toggleField('reimbursable')}
        >
          <Text style={[styles.pillText, document.reimbursable && styles.pillTextSelected]}>
            {getFieldLabel(t, 'reimbursable')}: {getBooleanLabel(t, document.reimbursable)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function DocumentRow({
  document,
  appMode = 'private',
  t,
  onPress,
  urgent = false,
}: {
  document: ScannedDocument;
  appMode?: AppMode;
  t: Translation;
  onPress: () => void;
  urgent?: boolean;
}) {
  const displayedAmount = formatCardAmount(
    document.cashflowType === 'receivable'
      ? document.amountReceivable || document.amountTotal || '-'
      : document.amountTotal || '-',
  );
  const dateLabel = document.cashflowType === 'receivable' ? t.expectedReimbursement : t.due;
  const dateValue = document.cashflowType === 'receivable'
    ? document.expectedPaymentDate || '-'
    : document.dueDate || '-';

  return (
    <Pressable style={[styles.documentRow, urgent && styles.urgentRow]} onPress={onPress}>
      <View style={styles.documentTextBlock}>
        <Text style={styles.documentTitle}>{getDocumentTitle(document, appMode, t)}</Text>
        <Text style={styles.documentMeta}>
          {getDocumentTypeLabel(t, document.documentType)} - {getPaymentStatusLabel(t, document.paymentStatus)}
        </Text>
      </View>
      <View style={styles.amountBlock}>
        <Text style={styles.amountText}>{displayedAmount}</Text>
        <Text style={styles.dueText}>{dateLabel} {dateValue}</Text>
      </View>
    </Pressable>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function ImagePreview({ imageUri, t }: { imageUri?: string; t: Translation }) {
  if (!imageUri) {
    return (
      <View style={styles.previewFrame}>
        <Text style={styles.previewPlaceholder}>{t.noImagePreview}</Text>
      </View>
    );
  }

  return (
    <View style={styles.previewFrame}>
      <Image source={{ uri: imageUri }} resizeMode="cover" style={styles.previewImage} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f4ee',
  },
  appShell: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  scrollContent: {
    paddingBottom: 36,
  },
  header: {
    paddingTop: 28,
    paddingBottom: 18,
  },
  brand: {
    color: '#153433',
    flexShrink: 1,
    fontSize: 30,
    fontWeight: '800',
    includeFontPadding: false,
    letterSpacing: 0,
    maxWidth: '100%',
    width: '100%',
  },
  promise: {
    color: '#536260',
    fontSize: 16,
    lineHeight: 22,
    marginTop: 6,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0d5c63',
    borderRadius: 8,
    justifyContent: 'center',
    marginVertical: 14,
    minHeight: 52,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryFullButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#0d5c63',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  secondaryFullButtonText: {
    color: '#0d5c63',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.65,
  },
  languageSetting: {
    marginBottom: 2,
  },
  languageButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  languageButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#bdc9c4',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  languageButtonSelected: {
    backgroundColor: '#0d5c63',
    borderColor: '#0d5c63',
  },
  languageButtonText: {
    color: '#153433',
    fontWeight: '800',
  },
  languageButtonTextSelected: {
    color: '#ffffff',
  },
  privacySettings: {
    marginBottom: 12,
  },
  settingRow: {
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 12,
  },
  settingTextBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },
  settingHint: {
    color: '#65716d',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  settingToggleButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderColor: '#bdc9c4',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 58,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  settingToggleButtonEnabled: {
    backgroundColor: '#0d5c63',
    borderColor: '#0d5c63',
  },
  settingToggleButtonText: {
    color: '#153433',
    fontWeight: '800',
    textAlign: 'center',
  },
  settingToggleButtonTextEnabled: {
    color: '#ffffff',
  },
  backButton: {
    alignSelf: 'flex-start',
    borderColor: '#bdc9c4',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#153433',
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#153433',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 10,
    marginTop: 22,
  },
  screenTitle: {
    color: '#153433',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 10,
    marginTop: 22,
  },
  subtleText: {
    color: '#536260',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 12,
    textAlign: 'center',
  },
  paymentSafetyNote: {
    color: '#536260',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 14,
  },
  modeBadge: {
    backgroundColor: '#ffffff',
    borderColor: '#bdc9c4',
    borderRadius: 8,
    borderWidth: 1,
    color: '#153433',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reviewSourceBadge: {
    alignSelf: 'flex-start',
  },
  fallbackWarning: {
    backgroundColor: '#fff5d6',
    borderColor: '#d7a018',
    borderRadius: 8,
    borderWidth: 1,
    color: '#614600',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statusBadgeGroup: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  scanContent: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 36,
  },
  centerScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loader: {
    marginTop: 10,
  },
  processingState: {
    alignItems: 'center',
    marginTop: 2,
  },
  processingText: {
    color: '#536260',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  documentRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    padding: 14,
  },
  urgentRow: {
    borderColor: '#b34832',
    borderLeftWidth: 5,
  },
  documentTextBlock: {
    flex: 1,
    paddingRight: 10,
  },
  documentTitle: {
    color: '#153433',
    fontSize: 16,
    fontWeight: '800',
  },
  documentMeta: {
    color: '#65716d',
    fontSize: 13,
    marginTop: 4,
  },
  amountBlock: {
    alignItems: 'flex-end',
    minWidth: 112,
  },
  amountText: {
    color: '#153433',
    fontSize: 15,
    fontWeight: '800',
  },
  dueText: {
    color: '#7b5c2f',
    fontSize: 12,
    marginTop: 4,
  },
  emptyState: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  emptyText: {
    color: '#65716d',
  },
  summarySection: {
    marginTop: 4,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryTile: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 82,
    minWidth: 146,
    padding: 12,
  },
  summaryLabel: {
    color: '#65716d',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  summaryValue: {
    color: '#153433',
    fontSize: 22,
    fontWeight: '800',
  },
  categoryBreakdownTitle: {
    color: '#153433',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 14,
  },
  categoryBreakdownList: {
    gap: 6,
  },
  categoryBreakdownRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  categoryBreakdownName: {
    color: '#153433',
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    paddingRight: 10,
  },
  categoryBreakdownAmounts: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  categoryMetricValue: {
    color: '#153433',
    fontSize: 14,
    fontWeight: '800',
  },
  categoryMetricMuted: {
    color: '#65716d',
    fontSize: 13,
    fontWeight: '700',
  },
  supplierSummaryGrid: {
    gap: 8,
  },
  supplierSummaryCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  supplierSummaryName: {
    color: '#153433',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  supplierSummaryMetrics: {
    gap: 4,
  },
  supplierSummaryMetric: {
    color: '#153433',
    fontSize: 14,
    fontWeight: '700',
  },
  supplierSummaryMuted: {
    color: '#65716d',
    fontSize: 13,
    fontWeight: '700',
  },
  businessDueDateSummaryCard: {
    backgroundColor: '#fff7e8',
    borderColor: '#d58a36',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 18,
    padding: 12,
  },
  businessDueDateSummaryTitle: {
    color: '#6b4608',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
  businessDueDateSummaryGrid: {
    gap: 6,
  },
  businessDueDateSummaryItem: {
    color: '#153433',
    fontSize: 14,
    fontWeight: '800',
  },
  previewFrame: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#e5ddd1',
    borderRadius: 8,
    height: 156,
    justifyContent: 'center',
    marginBottom: 18,
    overflow: 'hidden',
    width: '100%',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewPlaceholder: {
    color: '#65716d',
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 14,
  },
  formSection: {
    marginTop: 4,
  },
  inputLabel: {
    color: '#153433',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 7,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#bdc9c4',
    borderRadius: 8,
    borderWidth: 1,
    color: '#153433',
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteInput: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  pillScroller: {
    flexGrow: 0,
    overflow: 'visible',
  },
  pillRow: {
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingBottom: 3,
    paddingRight: 18,
    paddingTop: 3,
  },
  pill: {
    backgroundColor: '#ffffff',
    borderColor: '#bdc9c4',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pillSelected: {
    backgroundColor: '#0d5c63',
    borderColor: '#0d5c63',
  },
  pillText: {
    color: '#153433',
    fontWeight: '700',
  },
  pillTextSelected: {
    color: '#ffffff',
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  toggleButton: {
    backgroundColor: '#ffffff',
    borderColor: '#bdc9c4',
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 46,
    minWidth: 142,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionRow: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  appButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#0d5c63',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 104,
    paddingHorizontal: 12,
  },
  appButtonPressed: {
    backgroundColor: '#eef6f4',
  },
  appButtonText: {
    color: '#0d5c63',
    fontWeight: '800',
    textAlign: 'center',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#0d5c63',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minWidth: 104,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: '#0d5c63',
    fontWeight: '800',
    textAlign: 'center',
  },
  detailRow: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    padding: 12,
  },
  detailLabel: {
    color: '#65716d',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  detailValue: {
    color: '#153433',
    fontSize: 15,
    fontWeight: '700',
  },
  receivableHighlight: {
    backgroundColor: '#eef6f4',
    borderColor: '#0d5c63',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  receivableAmount: {
    color: '#0d5c63',
    fontSize: 22,
    fontWeight: '800',
  },
  debtRiskCard: {
    backgroundColor: '#fff7e8',
    borderColor: '#b34832',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  debtRiskTitle: {
    color: '#7a2619',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  debtRiskRow: {
    borderTopColor: '#eed5b5',
    borderTopWidth: 1,
    paddingVertical: 9,
  },
  debtRiskLabel: {
    color: '#7a2619',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 3,
  },
  debtRiskValue: {
    color: '#153433',
    fontSize: 15,
    fontWeight: '700',
  },
  debtRiskValueMultiline: {
    lineHeight: 21,
  },
  debtRiskDisclaimer: {
    color: '#6b4608',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 8,
  },
  duplicateWarningCard: {
    backgroundColor: '#fff7e8',
    borderColor: '#d7a018',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  duplicateWarningTitle: {
    color: '#6b4608',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  duplicateWarningText: {
    color: '#6b4608',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 10,
  },
  duplicateComparisonRow: {
    borderTopColor: '#eed5b5',
    borderTopWidth: 1,
    paddingVertical: 8,
  },
  duplicateComparisonLabel: {
    color: '#7a5a12',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 3,
  },
  duplicateComparisonValue: {
    color: '#153433',
    fontSize: 15,
    fontWeight: '700',
  },
  categorySuggestionCard: {
    backgroundColor: '#f4f8f7',
    borderColor: '#9ab6b1',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12,
  },
  categorySuggestionTitle: {
    color: '#153433',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  categorySuggestionText: {
    color: '#536260',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  paymentDataWarningCard: {
    backgroundColor: '#fff7e8',
    borderColor: '#d7a018',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  paymentDataWarningTitle: {
    color: '#6b4608',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  paymentDataWarningText: {
    color: '#6b4608',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 10,
  },
  paymentDataWarningList: {
    gap: 6,
  },
  paymentDataWarningItem: {
    color: '#153433',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  dueDateWarningCard: {
    backgroundColor: '#fff7e8',
    borderColor: '#d58a36',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12,
  },
  dueDateHintCard: {
    backgroundColor: '#f4f8f7',
    borderColor: '#9ab6b1',
  },
  dueDateWarningText: {
    color: '#6b4608',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  paymentPreparationPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  paymentPreparationRow: {
    borderBottomColor: '#e5ddd1',
    borderBottomWidth: 1,
    padding: 12,
  },
  copyButtonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  warningList: {
    gap: 8,
    marginBottom: 14,
  },
  warningText: {
    backgroundColor: '#fff7e8',
    borderColor: '#e3b35c',
    borderRadius: 8,
    borderWidth: 1,
    color: '#6b4608',
    fontSize: 14,
    fontWeight: '800',
    padding: 12,
  },
  businessReminderWarning: {
    backgroundColor: '#fff7e8',
    borderColor: '#d58a36',
    borderRadius: 8,
    borderWidth: 1,
    color: '#6b4608',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 14,
    padding: 12,
  },
  sepaQrSection: {
    marginBottom: 8,
  },
  sepaQrCodeBox: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: 14,
    padding: 18,
  },
  checklist: {
    marginTop: 4,
  },
  checklistRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 8,
    padding: 12,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: '#0d5c63',
    borderRadius: 4,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    marginRight: 10,
    width: 24,
  },
  checkboxChecked: {
    backgroundColor: '#0d5c63',
  },
  checkboxText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  checklistText: {
    color: '#153433',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  disclaimer: {
    color: '#7b5c2f',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
});
