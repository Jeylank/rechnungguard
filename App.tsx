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
import * as ImagePicker from 'expo-image-picker';
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
  documentTypeValues,
  DocumentType,
  ExpenseCategory,
  expenseCategoryValues,
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

const unpaidStatuses = new Set(['needs_review', 'unpaid', 'sent_to_insurance', 'waiting_reimbursement']);
const openExpenseStatuses = new Set<ScannedDocument['paymentStatus']>(['needs_review', 'unpaid']);
const receivableOpenStatuses = new Set<ScannedDocument['paymentStatus']>(['needs_review', 'expected', 'waiting_reimbursement']);
const blockedPaymentPreparationStatuses = new Set<ScannedDocument['paymentStatus']>(['paid', 'closed']);
const LANGUAGE_STORAGE_KEY = 'rechnungguard.language.v1';
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

const copyToClipboard = (value: string) => Clipboard.setStringAsync(value);

const isReminderOrInkassoDocument = (document: ScannedDocument) =>
  document.documentType === 'payment_reminder' || document.documentType === 'inkasso_letter';

const isOpenDebtWarningDocument = (document: ScannedDocument) =>
  isReminderOrInkassoDocument(document) && document.paymentStatus !== 'closed' && document.paymentStatus !== 'paid';

const isExpectedReimbursementDocument = (document: ScannedDocument) =>
  document.cashflowType === 'receivable' && receivableOpenStatuses.has(document.paymentStatus);

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

const mentionsMahnbescheid = (document: ScannedDocument) =>
  [
    document.riskNote,
    document.actionRecommendation,
    document.reminderLevel,
    document.branchCategory,
    document.documentType,
  ].some((value) => typeof value === 'string' && /mahnbescheid/i.test(value));

const getPaymentRecipient = (document: ScannedDocument) =>
  document.paymentRecipient || document.creditorName || document.senderName || '';

const getPaymentReference = (document: ScannedDocument) =>
  document.paymentReference || document.invoiceNumber || document.customerNumber || '';

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

  return Boolean(document.amountTotal);
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

const createEmptyCategoryBreakdown = (): ExpenseCategorySummary[] =>
  expenseCategoryValues.map((category) => ({
    category,
    openAmount: 0,
    paidOrReceivedThisMonth: 0,
  }));

const getExpenseSummary = (documents: ScannedDocument[]): ExpenseSummary => {
  const categoryBreakdown = createEmptyCategoryBreakdown();
  const categoryByName = new Map(categoryBreakdown.map((item) => [item.category, item]));

  return documents.reduce<ExpenseSummary>(
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

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

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
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<ScannedDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [language, setLanguage] = useState<Language>(defaultLanguage);
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
    const loadLanguage = async () => {
      const storedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isLanguage(storedLanguage)) {
        setLanguage(storedLanguage);
      }
    };

    loadLanguage();
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

  const changeStoreDocumentImages = async (enabled: boolean) => {
    setStoreDocumentImages(enabled);
    await AsyncStorage.setItem(STORE_DOCUMENT_IMAGES_STORAGE_KEY, enabled ? 'true' : 'false');
  };

  const urgentDocuments = useMemo(() => documents.filter(isUrgent).sort((a, b) => {
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  }), [documents]);

  const recentDocuments = useMemo(() => documents.slice().sort(sortByDateDesc).slice(0, 8), [documents]);
  const debtWarningDocuments = useMemo(
    () => documents.filter(isOpenDebtWarningDocument).sort(sortByDateDesc).slice(0, 5),
    [documents],
  );
  const expectedReimbursementDocuments = useMemo(
    () => documents.filter(isExpectedReimbursementDocument).sort(sortByDateDesc).slice(0, 5),
    [documents],
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

  const saveDocument = async (document: ScannedDocument) => {
    const savedDocument = await upsertDocument({
      ...document,
      imageUri: storeDocumentImages ? document.imageUri : '',
    });
    setDraft(null);
    setSelectedDocument(savedDocument);
    await loadDocuments();
    setScreen('detail');
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
      PRIVACY_NOTICE_ACCEPTED_STORAGE_KEY,
      STORE_DOCUMENT_IMAGES_STORAGE_KEY,
    ]);
    setDocuments([]);
    setDraft(null);
    setSelectedDocument(null);
    setSelectedImageUri(null);
    setLanguage(defaultLanguage);
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
    setIsLoading(true);
    try {
      try {
        const document = await scanDocumentWithOcr(selectedImageUri);
        if (OCR_MODE === 'backend' && document.ocrSource !== 'backend') {
          throw new Error('Backend OCR mode did not return backend data.');
        }
        setDraft({
          ...document,
          imageUri: storeDocumentImages ? document.imageUri : '',
        });
        setScreen('review');
      } catch (error) {
        setDraft(null);
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
            language={language}
            t={t}
            onChangeLanguage={changeLanguage}
            onScan={() => {
              setSelectedImageUri(null);
              setDraft(null);
              setScreen('scan');
            }}
            onOpenDocument={openDocument}
          />
        ) : null}

        {screen === 'scan' ? (
          <ScanScreen
            backendStatus={backendStatus}
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
            t={t}
            onChange={setDraft}
            onSave={() => saveDocument(draft)}
          />
        ) : null}

        {screen === 'detail' && selectedDocument ? (
          <DetailScreen
            document={selectedDocument}
            isSavingStatus={isSavingStatus}
            t={t}
            onChange={setSelectedDocument}
            onPreparePayment={() => setScreen('paymentPreparation')}
            onDeleteDocument={deleteSelectedDocument}
            onUpdateStatus={updateDocumentStatus}
            onSave={async (document) => {
              const savedDocument = await upsertDocument({
                ...document,
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
  language,
  t,
  onChangeLanguage,
  onScan,
  onOpenDocument,
}: {
  urgentDocuments: ScannedDocument[];
  debtWarningDocuments: ScannedDocument[];
  expectedReimbursementDocuments: ScannedDocument[];
  recentDocuments: ScannedDocument[];
  language: Language;
  t: Translation;
  onChangeLanguage: (language: Language) => void;
  onScan: () => void;
  onOpenDocument: (document: ScannedDocument) => void;
}) {
  const hasDocuments = recentDocuments.length > 0;

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
        <Text style={styles.primaryButtonText}>{t.scanBillOrLetter}</Text>
      </Pressable>

      {urgentDocuments.length > 0 ? (
        <>
          <SectionTitle title={t.urgentUnpaidBills} />
          {urgentDocuments.map((document) => (
            <DocumentRow key={document.id} document={document} t={t} onPress={() => onOpenDocument(document)} urgent />
          ))}
        </>
      )}

      {debtWarningDocuments.length > 0 ? (
        <>
          <SectionTitle title={t.debtWarnings} />
          {debtWarningDocuments.map((document) => (
            <DocumentRow key={document.id} document={document} t={t} onPress={() => onOpenDocument(document)} urgent />
          ))}
        </>
      )}

      {expectedReimbursementDocuments.length > 0 ? (
        <>
          <SectionTitle title={t.expectedReimbursements} />
          {expectedReimbursementDocuments.map((document) => (
            <DocumentRow key={document.id} document={document} t={t} onPress={() => onOpenDocument(document)} />
          ))}
        </>
      )}

      {hasDocuments ? <SectionTitle title={t.recentScannedDocuments} /> : null}
      {!hasDocuments ? (
        <EmptyState text={t.scannedDocumentsEmpty} />
      ) : (
        recentDocuments.map((document) => (
          <DocumentRow key={document.id} document={document} t={t} onPress={() => onOpenDocument(document)} />
        ))
      )}
    </ScrollView>
  );
}

function ScanScreen({
  backendStatus,
  imageUri,
  isLoading,
  t,
  onPickImage,
  onProcessImage,
}: {
  backendStatus: BackendStatus | null;
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
      <Text style={styles.screenTitle}>{t.scanBillOrLetter}</Text>
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
  t,
  onChange,
  onSave,
}: {
  draft: ScannedDocument;
  t: Translation;
  onChange: (document: ScannedDocument) => void;
  onSave: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.screenTitle}>{t.reviewScan}</Text>
      <ImagePreview imageUri={draft.imageUri} t={t} />
      <DocumentForm document={draft} t={t} onChange={onChange} />
      <Pressable style={styles.primaryButton} onPress={onSave}>
        <Text style={styles.primaryButtonText}>{t.save}</Text>
      </Pressable>
    </ScrollView>
  );
}

function DetailScreen({
  document,
  isSavingStatus,
  t,
  onChange,
  onPreparePayment,
  onDeleteDocument,
  onUpdateStatus,
  onSave,
}: {
  document: ScannedDocument;
  isSavingStatus: boolean;
  t: Translation;
  onChange: (document: ScannedDocument) => void;
  onPreparePayment: () => void;
  onDeleteDocument: () => void;
  onUpdateStatus: (status: Extract<PaymentStatus, 'expected' | 'paid' | 'received' | 'disputed' | 'closed'>) => Promise<void>;
  onSave: (document: ScannedDocument) => Promise<void>;
}) {
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

      {document.cashflowType === 'receivable' ? (
        <View style={styles.receivableHighlight}>
          <Text style={styles.detailLabel}>{t.expectedReimbursement}</Text>
          <Text style={styles.receivableAmount}>{document.amountReceivable || document.amountTotal || '-'}</Text>
        </View>
      ) : null}

      {isReminderOrInkassoDocument(document) ? <DebtRiskCard document={document} t={t} /> : null}

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
        <Text style={styles.detailLabel}>{getFieldLabel(t, 'expenseCategory')}</Text>
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

      {getVisibleFields(document, fieldOrder).map((field) => (
        <View key={field} style={styles.detailRow}>
          <Text style={styles.detailLabel}>{getFieldLabel(t, field)}</Text>
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
  const warnings = [
    !document.iban ? t.paymentPreparationWarnings.missingIban : null,
    !document.amountTotal ? t.paymentPreparationWarnings.missingAmount : null,
    !paymentReference ? t.paymentPreparationWarnings.checkPaymentReference : null,
    !recipient ? t.paymentPreparationWarnings.checkRecipient : null,
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
      <Text style={styles.paymentSafetyNote}>{t.paymentPreparationSafetyNote}</Text>
      <Text style={styles.paymentSafetyNote}>{t.sepaQrDisclaimer}</Text>

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

      <View style={styles.warningList}>
        {warnings.map((warning) => (
          <Text key={warning} style={styles.warningText}>
            {warning}
          </Text>
        ))}
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
  t,
  onChange,
}: {
  document: ScannedDocument;
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
          ? paymentStatusValues
          : field === 'cashflowType'
            ? cashflowTypeValues
            : field === 'urgencyLevel'
              ? urgencyLevelValues
              : null;
    const label = getFieldLabel(t, field);

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

  const primaryFields = getVisibleFields(document, primaryReviewFields);
  const advancedFields = getVisibleFields(document, advancedReviewFields);

  return (
    <View>
      {primaryFields.map(renderField)}
      {advancedFields.length > 0 ? (
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>{t.moreDetails}</Text>
          {advancedFields.map(renderField)}
        </View>
      ) : null}
      <ExpenseReviewFields document={document} t={t} onChange={onChange} />
    </View>
  );
}

function ExpenseSummarySection({ summary, t }: { summary: ExpenseSummary; t: Translation }) {
  const activeCategories = summary.categoryBreakdown.filter(
    (item) => item.openAmount > 0 || item.paidOrReceivedThisMonth > 0,
  );

  return (
    <View style={styles.summarySection}>
      <Text style={styles.sectionTitle}>{t.expenseSummary}</Text>
      <View style={styles.summaryGrid}>
        <SummaryTile label={t.openPayableAmount} value={formatEuro(summary.openAmount)} />
        <SummaryTile label={t.expectedReceivableAmount} value={formatEuro(summary.expectedReceivableAmount)} />
        <SummaryTile label={t.paidOrReceivedThisMonth} value={formatEuro(summary.paidOrReceivedThisMonth)} />
        <SummaryTile label={t.openInvoiceCount} value={String(summary.openInvoiceCount)} />
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
  t,
  onChange,
}: {
  document: ScannedDocument;
  t: Translation;
  onChange: (document: ScannedDocument) => void;
}) {
  const toggleField = (field: 'taxRelevant' | 'reimbursable') => {
    onChange({ ...document, [field]: !document[field], isExpense: document.cashflowType === 'payable' });
  };

  return (
    <View style={styles.formSection}>
      <Text style={styles.sectionTitle}>{t.categorization}</Text>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{getFieldLabel(t, 'expenseCategory')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroller}
          contentContainerStyle={styles.pillRow}
        >
          {expenseCategoryValues.map((option) => (
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
  t,
  onPress,
  urgent = false,
}: {
  document: ScannedDocument;
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
        <Text style={styles.documentTitle}>{document.senderName || document.creditorName || t.unknownSender}</Text>
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
