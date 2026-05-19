import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getDocuments, upsertDocument } from './services/documentStorage';
import { mockOcrDocument } from './services/ocrService';
import {
  documentTypeValues,
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

const fieldLabels: Array<[EditableField, string]> = [
  ['documentType', 'Document type'],
  ['paymentStatus', 'Payment status'],
  ['senderName', 'Sender name'],
  ['creditorName', 'Creditor name'],
  ['amountTotal', 'Amount total'],
  ['originalAmount', 'Original amount'],
  ['dueDate', 'Due date'],
  ['invoiceDate', 'Invoice date'],
  ['invoiceNumber', 'Invoice number'],
  ['customerNumber', 'Customer number'],
  ['iban', 'IBAN'],
  ['bic', 'BIC'],
  ['paymentReference', 'Payment reference'],
  ['documentLanguage', 'Document language'],
  ['urgencyLevel', 'Urgency level'],
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

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [draft, setDraft] = useState<ScannedDocument | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<ScannedDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadDocuments = useCallback(async () => {
    const storedDocuments = await getDocuments();
    setDocuments(storedDocuments.sort(sortByDateDesc));
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

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
      Alert.alert('Permission needed', 'Please allow gallery access to scan a bill or letter.');
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
          <Pressable style={styles.backButton} onPress={() => setScreen('home')}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : null}

        {screen === 'home' ? (
          <HomeScreen
            urgentDocuments={urgentDocuments}
            recentDocuments={recentDocuments}
            onScan={() => setScreen('scan')}
            onOpenDocument={openDocument}
          />
        ) : null}

        {screen === 'scan' ? <ScanScreen isLoading={isLoading} onPickImage={chooseImage} /> : null}

        {screen === 'review' && draft ? (
          <ReviewScreen draft={draft} onChange={setDraft} onSave={() => saveDocument(draft)} />
        ) : null}

        {screen === 'detail' && selectedDocument ? (
          <DetailScreen
            document={selectedDocument}
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
  onScan,
  onOpenDocument,
}: {
  urgentDocuments: ScannedDocument[];
  recentDocuments: ScannedDocument[];
  onScan: () => void;
  onOpenDocument: (document: ScannedDocument) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.brand}>RechnungGuard</Text>
        <Text style={styles.promise}>Scan bills, track deadlines, avoid Inkasso stress.</Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={onScan}>
        <Text style={styles.primaryButtonText}>Scan bill or letter</Text>
      </Pressable>

      <SectionTitle title="Urgent unpaid bills" />
      {urgentDocuments.length === 0 ? (
        <EmptyState text="No urgent unpaid bills yet." />
      ) : (
        urgentDocuments.map((document) => (
          <DocumentRow key={document.id} document={document} onPress={() => onOpenDocument(document)} urgent />
        ))
      )}

      <SectionTitle title="Recent scanned documents" />
      {recentDocuments.length === 0 ? (
        <EmptyState text="Scanned documents will appear here." />
      ) : (
        recentDocuments.map((document) => (
          <DocumentRow key={document.id} document={document} onPress={() => onOpenDocument(document)} />
        ))
      )}
    </ScrollView>
  );
}

function ScanScreen({ isLoading, onPickImage }: { isLoading: boolean; onPickImage: () => void }) {
  return (
    <View style={styles.centerScreen}>
      <Text style={styles.screenTitle}>Scan bill or letter</Text>
      <Text style={styles.subtleText}>Choose an image from your gallery. Camera scanning can be added later.</Text>
      <Pressable disabled={isLoading} style={[styles.primaryButton, isLoading && styles.disabledButton]} onPress={onPickImage}>
        <Text style={styles.primaryButtonText}>{isLoading ? 'Scanning...' : 'Pick image from gallery'}</Text>
      </Pressable>
      {isLoading ? <ActivityIndicator color="#0d5c63" size="large" style={styles.loader} /> : null}
    </View>
  );
}

function ReviewScreen({
  draft,
  onChange,
  onSave,
}: {
  draft: ScannedDocument;
  onChange: (document: ScannedDocument) => void;
  onSave: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.screenTitle}>Review scan</Text>
      <Image source={{ uri: draft.imageUri }} style={styles.previewImage} />
      <DocumentForm document={draft} onChange={onChange} />
      <Pressable style={styles.primaryButton} onPress={onSave}>
        <Text style={styles.primaryButtonText}>Save</Text>
      </Pressable>
    </ScrollView>
  );
}

function DetailScreen({
  document,
  onChange,
  onSave,
}: {
  document: ScannedDocument;
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
      <Text style={styles.screenTitle}>Document detail</Text>
      <Image source={{ uri: document.imageUri }} style={styles.previewImage} />

      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={() => updateAndSave({ paymentStatus: 'paid' })}>
          <Text style={styles.secondaryButtonText}>Mark as paid</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => updateAndSave({ paymentStatus: 'disputed' })}>
          <Text style={styles.secondaryButtonText}>Mark as disputed</Text>
        </Pressable>
      </View>

      <Text style={styles.inputLabel}>Payment note</Text>
      <TextInput
        multiline
        value={document.paymentNote}
        onBlur={() => onSave(document)}
        onChangeText={(value) => onChange({ ...document, paymentNote: value })}
        placeholder="Add a payment note"
        style={[styles.input, styles.noteInput]}
      />

      {fieldLabels.map(([field, label]) => (
        <View key={field} style={styles.detailRow}>
          <Text style={styles.detailLabel}>{label}</Text>
          <Text style={styles.detailValue}>{String(document[field] ?? '') || '-'}</Text>
        </View>
      ))}

      {document.documentType === 'inkasso_letter' ? (
        <View style={styles.checklist}>
          <Text style={styles.sectionTitle}>Inkasso checklist</Text>
          {inkassoChecklistItems.map((label) => (
            <Pressable key={label} style={styles.checklistRow} onPress={() => setChecklistItem(label)}>
              <View style={[styles.checkbox, document.inkassoChecklist[label] && styles.checkboxChecked]}>
                <Text style={styles.checkboxText}>{document.inkassoChecklist[label] ? '✓' : ''}</Text>
              </View>
              <Text style={styles.checklistText}>{label}</Text>
            </Pressable>
          ))}
          <Text style={styles.disclaimer}>
            This is not legal advice. For legal certainty, contact Verbraucherzentrale or a lawyer.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function DocumentForm({
  document,
  onChange,
}: {
  document: ScannedDocument;
  onChange: (document: ScannedDocument) => void;
}) {
  const updateField = (field: EditableField, value: string) => {
    onChange({ ...document, [field]: value });
  };

  return (
    <View>
      {fieldLabels.map(([field, label]) => {
        const options =
          field === 'documentType' ? documentTypeValues : field === 'paymentStatus' ? paymentStatusValues : field === 'urgencyLevel' ? urgencyLevelValues : null;

        return (
          <View key={field} style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{label}</Text>
            {options ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {options.map((option) => (
                  <Pressable
                    key={option}
                    style={[styles.pill, document[field] === option && styles.pillSelected]}
                    onPress={() => updateField(field, option)}
                  >
                    <Text style={[styles.pillText, document[field] === option && styles.pillTextSelected]}>{option}</Text>
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
  onPress,
  urgent = false,
}: {
  document: ScannedDocument;
  onPress: () => void;
  urgent?: boolean;
}) {
  return (
    <Pressable style={[styles.documentRow, urgent && styles.urgentRow]} onPress={onPress}>
      <View style={styles.documentTextBlock}>
        <Text style={styles.documentTitle}>{document.senderName || document.creditorName || 'Unknown sender'}</Text>
        <Text style={styles.documentMeta}>
          {document.documentType} · {document.paymentStatus}
        </Text>
      </View>
      <View style={styles.amountBlock}>
        <Text style={styles.amountText}>{document.amountTotal || '-'}</Text>
        <Text style={styles.dueText}>Due {document.dueDate || '-'}</Text>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f4ee',
  },
  appShell: {
    flex: 1,
    paddingHorizontal: 18,
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
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
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
  backButton: {
    alignSelf: 'flex-start',
    borderColor: '#bdc9c4',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
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
  previewImage: {
    alignSelf: 'stretch',
    backgroundColor: '#e5ddd1',
    borderRadius: 8,
    height: 230,
    marginBottom: 18,
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
  pillRow: {
    gap: 8,
    paddingRight: 18,
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
