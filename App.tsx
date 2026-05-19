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
import * as ImagePicker from 'expo-image-picker';
import {
  defaultLanguage,
  isLanguage,
  Language,
  Translation,
  translations,
} from './i18n';
import { getDocuments, upsertDocument } from './services/documentStorage';
import { mockOcrDocument } from './services/ocrService';
import {
  documentTypeValues,
  DocumentType,
  inkassoChecklistItems,
  paymentStatusValues,
  ScannedDocument,
  urgencyLevelValues,
} from './types/ScannedDocument';

type Screen = 'home' | 'scan' | 'review' | 'detail';
type EditableField =
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
  | 'urgencyLevel';

const unpaidStatuses = new Set(['needs_review', 'unpaid', 'sent_to_insurance', 'waiting_reimbursement']);
const LANGUAGE_STORAGE_KEY = 'rechnungguard.language.v1';

const fieldOrder: EditableField[] = [
  'documentType',
  'paymentStatus',
  'senderName',
  'creditorName',
  'branchCategory',
  'amountTotal',
  'originalAmount',
  'dueDate',
  'invoiceDate',
  'invoiceNumber',
  'customerNumber',
  'iban',
  'bic',
  'paymentReference',
  'documentLanguage',
  'urgencyLevel',
];

const sortByDateDesc = (a: ScannedDocument, b: ScannedDocument) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

const isUrgent = (document: ScannedDocument) => {
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
const getPaymentStatusLabel = (t: Translation, value: ScannedDocument['paymentStatus']) =>
  t.paymentStatuses[value] ?? value;
const getUrgencyLevelLabel = (t: Translation, value: ScannedDocument['urgencyLevel']) =>
  t.urgencyLevels[value] ?? value;

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
  return String(document[field] ?? '') || '-';
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [draft, setDraft] = useState<ScannedDocument | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<ScannedDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState<Language>(defaultLanguage);
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

  const changeLanguage = async (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  };

  const urgentDocuments = useMemo(() => documents.filter(isUrgent).sort((a, b) => {
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  }), [documents]);

  const recentDocuments = useMemo(() => documents.slice().sort(sortByDateDesc).slice(0, 8), [documents]);

  const openDocument = (document: ScannedDocument) => {
    setSelectedDocument(document);
    setScreen('detail');
  };

  const saveDocument = async (document: ScannedDocument) => {
    const savedDocument = await upsertDocument(document);
    setDraft(null);
    setSelectedDocument(savedDocument);
    await loadDocuments();
    setScreen('detail');
  };

  const chooseImage = async () => {
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

    setIsLoading(true);
    try {
      const document = await mockOcrDocument(result.assets[0].uri);
      setDraft(document);
      setScreen('review');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f7f4ee" />
      <View style={styles.appShell}>
        {screen !== 'home' ? (
          <Pressable hitSlop={10} style={styles.backButton} onPress={() => setScreen('home')}>
            <Text style={styles.backButtonText}>{t.back}</Text>
          </Pressable>
        ) : null}

        {screen === 'home' ? (
          <HomeScreen
            urgentDocuments={urgentDocuments}
            recentDocuments={recentDocuments}
            language={language}
            t={t}
            onChangeLanguage={changeLanguage}
            onScan={() => setScreen('scan')}
            onOpenDocument={openDocument}
          />
        ) : null}

        {screen === 'scan' ? <ScanScreen isLoading={isLoading} t={t} onPickImage={chooseImage} /> : null}

        {screen === 'review' && draft ? (
          <ReviewScreen draft={draft} t={t} onChange={setDraft} onSave={() => saveDocument(draft)} />
        ) : null}

        {screen === 'detail' && selectedDocument ? (
          <DetailScreen
            document={selectedDocument}
            t={t}
            onChange={setSelectedDocument}
            onSave={async (document) => {
              const savedDocument = await upsertDocument(document);
              setSelectedDocument(savedDocument);
              await loadDocuments();
            }}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function HomeScreen({
  urgentDocuments,
  recentDocuments,
  language,
  t,
  onChangeLanguage,
  onScan,
  onOpenDocument,
}: {
  urgentDocuments: ScannedDocument[];
  recentDocuments: ScannedDocument[];
  language: Language;
  t: Translation;
  onChangeLanguage: (language: Language) => void;
  onScan: () => void;
  onOpenDocument: (document: ScannedDocument) => void;
}) {
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

      <SectionTitle title={t.urgentUnpaidBills} />
      {urgentDocuments.length === 0 ? (
        <EmptyState text={t.noUrgentUnpaidBills} />
      ) : (
        urgentDocuments.map((document) => (
          <DocumentRow key={document.id} document={document} t={t} onPress={() => onOpenDocument(document)} urgent />
        ))
      )}

      <SectionTitle title={t.recentScannedDocuments} />
      {recentDocuments.length === 0 ? (
        <EmptyState text={t.scannedDocumentsEmpty} />
      ) : (
        recentDocuments.map((document) => (
          <DocumentRow key={document.id} document={document} t={t} onPress={() => onOpenDocument(document)} />
        ))
      )}
    </ScrollView>
  );
}

function ScanScreen({ isLoading, t, onPickImage }: { isLoading: boolean; t: Translation; onPickImage: () => void }) {
  return (
    <View style={styles.centerScreen}>
      <Text style={styles.screenTitle}>{t.scanBillOrLetter}</Text>
      <Text style={styles.subtleText}>{t.chooseImageHint}</Text>
      <Pressable disabled={isLoading} style={[styles.primaryButton, isLoading && styles.disabledButton]} onPress={onPickImage}>
        <Text style={styles.primaryButtonText}>{isLoading ? t.scanning : t.pickImage}</Text>
      </Pressable>
      {isLoading ? <ActivityIndicator color="#0d5c63" size="large" style={styles.loader} /> : null}
    </View>
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
  t,
  onChange,
  onSave,
}: {
  document: ScannedDocument;
  t: Translation;
  onChange: (document: ScannedDocument) => void;
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
        <Pressable style={styles.secondaryButton} onPress={() => updateAndSave({ paymentStatus: 'paid' })}>
          <Text style={styles.secondaryButtonText}>{t.markAsPaid}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => updateAndSave({ paymentStatus: 'disputed' })}>
          <Text style={styles.secondaryButtonText}>{t.markAsDisputed}</Text>
        </Pressable>
      </View>

      <Text style={styles.inputLabel}>{t.paymentNote}</Text>
      <TextInput
        multiline
        value={document.paymentNote}
        onBlur={() => onSave(document)}
        onChangeText={(value) => onChange({ ...document, paymentNote: value })}
        placeholder={t.paymentNotePlaceholder}
        style={[styles.input, styles.noteInput]}
      />

      {fieldOrder.map((field) => (
        <View key={field} style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t.fields[field]}</Text>
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

  return (
    <View>
      {fieldOrder.map((field) => {
        const options =
          field === 'documentType' ? documentTypeValues : field === 'paymentStatus' ? paymentStatusValues : field === 'urgencyLevel' ? urgencyLevelValues : null;
        const label = t.fields[field];

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
                          : getUrgencyLevelLabel(t, option as ScannedDocument['urgencyLevel'])}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <TextInput
                value={String(document[field] ?? '')}
                onChangeText={(value) => updateField(field, value)}
                placeholder={label}
                style={styles.input}
              />
            )}
          </View>
        );
      })}
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
  return (
    <Pressable style={[styles.documentRow, urgent && styles.urgentRow]} onPress={onPress}>
      <View style={styles.documentTextBlock}>
        <Text style={styles.documentTitle}>{document.senderName || document.creditorName || t.unknownSender}</Text>
        <Text style={styles.documentMeta}>
          {getDocumentTypeLabel(t, document.documentType)} - {getPaymentStatusLabel(t, document.paymentStatus)}
        </Text>
      </View>
      <View style={styles.amountBlock}>
        <Text style={styles.amountText}>{document.amountTotal || '-'}</Text>
        <Text style={styles.dueText}>{t.due} {document.dueDate || '-'}</Text>
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
  centerScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loader: {
    marginTop: 10,
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
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#0d5c63',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
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
