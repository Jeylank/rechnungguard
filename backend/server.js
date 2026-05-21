const dotenv = require('dotenv');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');

dotenv.config();

const app = express();
const uploadDirectory = path.join(os.tmpdir(), 'rechnungguard-ocr-uploads');
const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => {
      fs.mkdir(uploadDirectory, { recursive: true }, (error) => callback(error, uploadDirectory));
    },
    filename: (_request, _file, callback) => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      callback(null, `ocr-upload-${suffix}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const port = Number(process.env.PORT || 3001);
const ocrProvider = process.env.OCR_PROVIDER || 'mock';
const openaiModel = process.env.OPENAI_OCR_MODEL || 'gpt-4.1-mini';

const documentTypeValues = [
  'receipt',
  'invoice',
  'medical_invoice',
  'dental_invoice',
  'utility_bill',
  'telecom_bill',
  'rent_letter',
  'insurance_document',
  'government_letter',
  'tax_letter',
  'payment_reminder',
  'inkasso_letter',
  'subscription_bill',
  'unknown',
];

const branchCategoryValues = [
  'general_invoice',
  'reminder',
  'inkasso',
  'dental',
  'medical',
  'energy',
  'water',
  'telecom',
  'insurance',
  'health_insurance',
  'rent',
  'government_tax',
  'online_order',
  'health',
  'other',
  'unknown',
];

const paymentStatusValues = [
  'unknown',
  'needs_review',
  'unpaid',
  'expected',
  'paid',
  'received',
  'sent_to_insurance',
  'waiting_reimbursement',
  'disputed',
  'closed',
];

const urgencyLevelValues = ['unknown', 'low', 'medium', 'high', 'critical'];
const cashflowTypeValues = ['payable', 'receivable', 'neutral', 'unknown'];

const expenseCategoryValues = [
  'unknown',
  'housing',
  'energy',
  'telecom',
  'insurance',
  'health',
  'transport',
  'shopping',
  'subscriptions',
  'tax_government',
  'education',
  'travel',
  'legal',
  'other',
];

const nullableStringSchema = {
  type: ['string', 'null'],
};

const mockOcrDocument = {
  ocrProvider: 'mock',
  documentType: 'telecom_bill',
  branchCategory: 'telecom',
  paymentStatus: 'needs_review',
  senderName: 'ConnectTel GmbH',
  creditorName: 'ConnectTel GmbH',
  payerName: null,
  amountTotal: '49,95 EUR',
  amountReceivable: null,
  originalAmount: '49,95 EUR',
  reminderFee: null,
  collectionFee: null,
  dueDate: '2026-05-25',
  expectedPaymentDate: null,
  invoiceDate: '2026-05-01',
  invoiceNumber: 'RG-2026-1001',
  customerNumber: 'K-123456',
  reminderLevel: null,
  originalCreditorName: null,
  caseNumber: null,
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  paymentReference: 'RG-2026-1001 K-123456',
  documentLanguage: 'de',
  urgencyLevel: 'medium',
  expenseCategory: 'telecom',
  isExpense: true,
  cashflowType: 'payable',
  receivedDate: null,
  riskNote: null,
  actionRecommendation: null,
};

const scannedDocumentSchema = {
  type: 'object',
  description: 'Structured extraction result for one German bill, reminder, government letter, tax letter, rent letter, insurance invoice, telecom bill, utility bill, or Inkasso letter.',
  additionalProperties: false,
  required: [
    'documentType',
    'branchCategory',
    'paymentStatus',
    'senderName',
    'creditorName',
    'payerName',
    'amountTotal',
    'amountReceivable',
    'originalAmount',
    'reminderFee',
    'collectionFee',
    'dueDate',
    'expectedPaymentDate',
    'invoiceDate',
    'invoiceNumber',
    'customerNumber',
    'reminderLevel',
    'originalCreditorName',
    'caseNumber',
    'iban',
    'bic',
    'paymentReference',
    'documentLanguage',
    'urgencyLevel',
    'expenseCategory',
    'isExpense',
    'cashflowType',
    'receivedDate',
    'riskNote',
    'actionRecommendation',
  ],
  properties: {
    documentType: {
      type: 'string',
      enum: documentTypeValues,
      description: 'Best document type. Use unknown when the visible text does not support a confident choice.',
    },
    branchCategory: {
      type: 'string',
      enum: branchCategoryValues,
      description: 'Business domain such as dental, medical, energy, water, telecom, insurance, rent, government_tax, inkasso, reminder, health, or unknown.',
    },
    paymentStatus: {
      type: 'string',
      enum: paymentStatusValues,
      description: 'Visible payment state. Use paid only when a paid/settled confirmation is visible. Use unknown when not assessable.',
    },
    senderName: {
      ...nullableStringSchema,
      description: 'Visible sender, issuer, biller, landlord, authority, insurer, telecom provider, utility provider, Inkasso company, or law firm.',
    },
    creditorName: {
      ...nullableStringSchema,
      description: 'Payment recipient or original creditor. For Inkasso, extract the original creditor/client/Auftraggeber if visible; otherwise null.',
    },
    payerName: {
      ...nullableStringSchema,
      description: 'Expected payer for receivable documents, such as Finanzamt, insurer, shop, or other refund issuer. Use null for payable documents or when absent.',
    },
    amountTotal: {
      ...nullableStringSchema,
      description: 'Total amount currently payable as a decimal string using a dot, such as 33.56. Extract from the explicit total/amount due. Do not calculate from partial lines unless the total is explicitly clear.',
    },
    amountReceivable: {
      ...nullableStringSchema,
      description: 'Amount expected to be paid to the user for refunds, reimbursements, credit notes, or positive balances as a decimal string using a dot, such as 33.56.',
    },
    originalAmount: {
      ...nullableStringSchema,
      description: 'Original principal amount before reminder or collection fees. Extract from Ursprungsbetrag, ursprünglicher Betrag, Hauptforderung, or original invoice amount only when visible.',
    },
    reminderFee: {
      ...nullableStringSchema,
      description: 'Reminder fee from Mahnkosten, Mahngebühr, zusätzliche Gebühr, or reminder cost lines only when visible.',
    },
    collectionFee: {
      ...nullableStringSchema,
      description: 'Collection/debt recovery fee from Inkassokosten, Inkassogebühr, Geschäftsgebühr, Auslagenpauschale, or collection cost lines only when visible.',
    },
    dueDate: {
      ...nullableStringSchema,
      description: 'Payment due date in YYYY-MM-DD. Use null when not visible or not derivable from an explicit visible date plus clear payment term.',
    },
    expectedPaymentDate: {
      ...nullableStringSchema,
      description: 'Expected incoming payment date in YYYY-MM-DD for receivable documents. Use null when not visible or not derivable.',
    },
    invoiceDate: {
      ...nullableStringSchema,
      description: 'Invoice, letter, notice, assessment, reminder, or Inkasso letter date in YYYY-MM-DD. Use null when not visible.',
    },
    invoiceNumber: {
      ...nullableStringSchema,
      description: 'Visible invoice, bill, Bescheid, Vertragskonto, Forderungsnummer, Aktenzeichen, Vorgangsnummer, or reference number. Use null if absent.',
    },
    customerNumber: {
      ...nullableStringSchema,
      description: 'Visible Kundenkonto, Kundennummer, Vertragsnummer, Vertragskonto, Mieternummer, Steuernummer, or account number. Use null if absent.',
    },
    reminderLevel: {
      ...nullableStringSchema,
      description: 'Visible reminder stage such as Mahnung, 1. Mahnung, 2. Mahnung, letzte außergerichtliche Mahnung, Inkasso, Mahnbescheid, or null if absent.',
    },
    originalCreditorName: {
      ...nullableStringSchema,
      description: 'Original creditor from ursprünglicher Gläubiger, Gläubiger, Auftraggeber, Mandant, or Forderung der/ des. Use null if absent.',
    },
    caseNumber: {
      ...nullableStringSchema,
      description: 'Visible Aktenzeichen, Forderungsnummer, Geschäftszeichen, Vorgangsnummer, or collection case number. Use null if absent.',
    },
    iban: {
      ...nullableStringSchema,
      description: 'Visible IBAN copied exactly from the document. Never invent or repair missing digits.',
    },
    bic: {
      ...nullableStringSchema,
      description: 'Visible BIC copied exactly from the document. Use null if absent.',
    },
    paymentReference: {
      ...nullableStringSchema,
      description: 'Visible Verwendungszweck, Zahlungsreferenz, Mandatsreferenz, Kassenzeichen, Aktenzeichen, Kunden-/Rechnungsnummer combination, or SEPA reference.',
    },
    documentLanguage: {
      type: 'string',
      description: 'Detected language code, usually de for German documents.',
    },
    urgencyLevel: {
      type: 'string',
      enum: urgencyLevelValues,
      description: 'Risk level from visible content: critical for Inkasso, final reminder, legal action, disconnection, enforcement, or expired/very short deadline.',
    },
    expenseCategory: {
      type: 'string',
      enum: expenseCategoryValues,
      description: 'Expense category aligned to the document domain, or unknown if unclear.',
    },
    isExpense: {
      type: ['boolean', 'null'],
      description: 'true for payment requests/claims against the user, false for clear credit/refund/info-only letters, null if unclear.',
    },
    cashflowType: {
      type: 'string',
      enum: cashflowTypeValues,
      description: 'payable for money the user should pay, receivable for money the user should receive, neutral for information-only documents, unknown if unclear.',
    },
    receivedDate: {
      ...nullableStringSchema,
      description: 'Date the incoming payment was already received in YYYY-MM-DD when visible. Use null otherwise.',
    },
    riskNote: {
      ...nullableStringSchema,
      description: 'Short non-legal risk note based only on visible terms such as Mahnbescheid, letzte außergerichtliche Mahnung, Inkasso, critical deadline, or disputed costs. Use null if no special risk is visible.',
    },
    actionRecommendation: {
      ...nullableStringSchema,
      description: 'Short safe next step based only on visible data, such as check deadline, verify original creditor/case number/fees, save proof, contact Verbraucherzentrale/Schuldnerberatung/lawyer if unsure. No legal advice and no invented facts.',
    },
  },
};

const stringOrNull = (value) => (typeof value === 'string' && value.trim() ? value : null);
const enumOrFallback = (value, values, fallback) => (values.includes(value) ? value : fallback);
const moneyFieldNames = ['amountTotal', 'amountReceivable', 'originalAmount', 'reminderFee', 'collectionFee'];
const healthInsurancePattern = /\b(?:dak|aok|tk|techniker\s+krankenkasse|barmer|krankenkasse|gesundheit|pflegeversicherung)\b/i;
const receivablePattern = /\b(?:steuererstattung|erstattung|rueckerstattung|rückerstattung|guthaben|gutschrift|wird\s+ueberwiesen|wird\s+überwiesen|zu\s+ihren\s+gunsten)\b/i;

const inkassoPattern = /\b(?:inkasso|inkassokosten|forderungseinzug|beitreibung)\b/i;
const reminderPattern = /\b(?:mahnung|1\.\s*mahnung|2\.\s*mahnung|letzte\s+au[ßs]ergerichtliche\s+mahnung|mahnbescheid|mahnkosten)\b/i;
const criticalDebtPattern = /\b(?:mahnbescheid|letzte\s+au[ßs]ergerichtliche\s+mahnung)\b/i;
const medicalDebtPattern = /\b(?:zahn[^\s]{0,6}rztliche|zahnarzt|dental|[^\s]{0,2}rztliche|arzt|medizinische|behandlung|leistungen)\b/i;
const dentalDebtPattern = /\b(?:zahn[^\s]{0,6}rztliche|zahnarzt|dental)\b/i;
const paymentReferenceInstructionPattern = /\b(?:ihre\s+belegnr\.?\s+aus\s+der\s+obigen\s+liste|belegnr\.?\s+aus\s+der\s+obigen\s+liste)\b/i;
const invoiceLikeNumberPattern = /\b[A-Z]{1,6}\d{5,}\b/i;

const getDebtSearchableText = (document) => [
  document.documentType,
  document.branchCategory,
  document.paymentStatus,
  document.senderName,
  document.creditorName,
  document.originalCreditorName,
  document.reminderLevel,
  document.caseNumber,
  document.invoiceNumber,
  document.customerNumber,
  document.paymentReference,
  document.riskNote,
  document.actionRecommendation,
  document.reminderFee,
  document.collectionFee,
]
  .filter((value) => typeof value === 'string')
  .join(' ');

const isKnownHealthInsurerDocument = (document) => {
  const searchableText = [
    document.senderName,
    document.creditorName,
    document.paymentReference,
    document.invoiceNumber,
    document.customerNumber,
    document.branchCategory,
    document.expenseCategory,
  ]
    .filter((value) => typeof value === 'string')
    .join(' ');

  return healthInsurancePattern.test(searchableText);
};

const isReceivableDocument = (document) => {
  const searchableText = [
    document.senderName,
    document.creditorName,
    document.payerName,
    document.paymentReference,
    document.amountReceivable,
    document.branchCategory,
    document.documentType,
  ]
    .filter((value) => typeof value === 'string')
    .join(' ');

  return receivablePattern.test(searchableText);
};

const getAllSearchableText = (document) => Object.values(document)
  .filter((value) => typeof value === 'string')
  .join(' ');

const normalizeMoneyValue = (value) => {
  if (!value) {
    return value;
  }

  const moneyMatch = value.match(/-?\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{2})|-?\d+(?:[,.]\d{2})/);
  if (!moneyMatch) {
    return value;
  }

  const normalizedValue = moneyMatch[0]
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const amount = Number.parseFloat(normalizedValue);
  return Number.isFinite(amount) ? amount.toFixed(2) : value;
};

const normalizeReminderLevel = (value) => {
  if (!value) {
    return value;
  }

  const numberedReminderMatch = value.match(/\b([1-9]\d*)\.\s*mahnung\b/i);
  return numberedReminderMatch ? numberedReminderMatch[1] : value;
};

const getInvoiceLikeNumber = (document) => {
  const candidates = [
    document.invoiceNumber,
    document.caseNumber,
    document.customerNumber,
  ].filter((value) => typeof value === 'string');

  for (const candidate of candidates) {
    const match = candidate.match(invoiceLikeNumberPattern);
    if (match) {
      return match[0];
    }
  }

  return null;
};

const normalizeOcrDocument = (document) => {
  const normalizedDocument = {
    documentType: enumOrFallback(document.documentType, documentTypeValues, 'unknown'),
    branchCategory: enumOrFallback(document.branchCategory, branchCategoryValues, 'unknown'),
    paymentStatus: enumOrFallback(document.paymentStatus, paymentStatusValues, 'unknown'),
    senderName: stringOrNull(document.senderName),
    creditorName: stringOrNull(document.creditorName),
    payerName: stringOrNull(document.payerName),
    amountTotal: stringOrNull(document.amountTotal),
    amountReceivable: stringOrNull(document.amountReceivable),
    originalAmount: stringOrNull(document.originalAmount),
    reminderFee: stringOrNull(document.reminderFee),
    collectionFee: stringOrNull(document.collectionFee),
    dueDate: stringOrNull(document.dueDate),
    expectedPaymentDate: stringOrNull(document.expectedPaymentDate),
    invoiceDate: stringOrNull(document.invoiceDate),
    invoiceNumber: stringOrNull(document.invoiceNumber),
    customerNumber: stringOrNull(document.customerNumber),
    reminderLevel: stringOrNull(document.reminderLevel),
    originalCreditorName: stringOrNull(document.originalCreditorName),
    caseNumber: stringOrNull(document.caseNumber),
    iban: stringOrNull(document.iban),
    bic: stringOrNull(document.bic),
    paymentReference: stringOrNull(document.paymentReference),
    documentLanguage: typeof document.documentLanguage === 'string' && document.documentLanguage.trim() ? document.documentLanguage : 'de',
    urgencyLevel: enumOrFallback(document.urgencyLevel, urgencyLevelValues, 'unknown'),
    expenseCategory: enumOrFallback(document.expenseCategory, expenseCategoryValues, 'unknown'),
    isExpense: typeof document.isExpense === 'boolean' ? document.isExpense : null,
    cashflowType: enumOrFallback(document.cashflowType, cashflowTypeValues, 'unknown'),
    receivedDate: stringOrNull(document.receivedDate),
    riskNote: stringOrNull(document.riskNote),
    actionRecommendation: stringOrNull(document.actionRecommendation),
  };

  const debtSearchableText = getDebtSearchableText({ ...document, ...normalizedDocument });
  const allSearchableText = getAllSearchableText({ ...document, ...normalizedDocument });
  moneyFieldNames.forEach((fieldName) => {
    normalizedDocument[fieldName] = normalizeMoneyValue(normalizedDocument[fieldName]);
  });

  if (inkassoPattern.test(debtSearchableText)) {
    normalizedDocument.documentType = 'inkasso_letter';
    normalizedDocument.branchCategory = 'inkasso';
    normalizedDocument.expenseCategory = 'legal';
    normalizedDocument.cashflowType = 'payable';
  } else if (reminderPattern.test(debtSearchableText)) {
    normalizedDocument.documentType = 'payment_reminder';
    normalizedDocument.cashflowType = 'payable';
  }

  if (criticalDebtPattern.test(debtSearchableText)) {
    normalizedDocument.urgencyLevel = 'critical';
    if (/mahnbescheid/i.test(debtSearchableText)) {
      normalizedDocument.riskNote =
        normalizedDocument.riskNote || 'Mahnbescheid wird im Schreiben erwaehnt.';
      normalizedDocument.actionRecommendation =
        normalizedDocument.actionRecommendation ||
        'Zahlungsfrist, Forderung, Belegnummer und Gebuehren sofort pruefen; bei Unsicherheit Verbraucherzentrale, Schuldnerberatung oder anwaltliche Beratung kontaktieren.';
    }
  }

  normalizedDocument.reminderLevel = normalizeReminderLevel(normalizedDocument.reminderLevel);

  if (paymentReferenceInstructionPattern.test(normalizedDocument.paymentReference || '')) {
    normalizedDocument.paymentReference = getInvoiceLikeNumber(normalizedDocument);
  }

  if (normalizedDocument.documentType === 'payment_reminder' && medicalDebtPattern.test(allSearchableText)) {
    normalizedDocument.branchCategory = dentalDebtPattern.test(allSearchableText) ? 'dental' : 'medical';
    normalizedDocument.expenseCategory = 'health';
  }

  if (isReceivableDocument({ ...document, ...normalizedDocument })) {
    normalizedDocument.cashflowType = 'receivable';
    normalizedDocument.paymentStatus =
      normalizedDocument.paymentStatus === 'received' ? 'received' : 'expected';
    normalizedDocument.isExpense = false;
    normalizedDocument.payerName =
      normalizedDocument.payerName || normalizedDocument.senderName || normalizedDocument.creditorName;
    normalizedDocument.amountReceivable = normalizedDocument.amountReceivable || normalizedDocument.amountTotal;
    normalizedDocument.amountTotal = null;
  }

  if (isKnownHealthInsurerDocument({ ...document, ...normalizedDocument })) {
    normalizedDocument.documentType =
      normalizedDocument.documentType === 'invoice' ? 'invoice' : 'insurance_document';
    normalizedDocument.branchCategory = 'health_insurance';
    normalizedDocument.expenseCategory = 'insurance';
  }

  return normalizedDocument;
};

const getDataUrl = async (file) => {
  const buffer = await fs.promises.readFile(file.path);
  return `data:${file.mimetype};base64,${buffer.toString('base64')}`;
};

const deleteUploadedFile = async (file) => {
  if (!file?.path) {
    return;
  }

  try {
    await fs.promises.unlink(file.path);
  } catch {
    console.warn('OCR upload cleanup skipped');
  }
};

const ocrSystemPrompt = [
  'Du extrahierst strukturierte Daten aus deutschen Zahlungsdokumenten fuer RechnungGuard.',
  'Unterstuetzte Dokumente: Rechnung, Mahnung, Inkasso-Schreiben, Strom/Gas/Wasser, Telekommunikation, Versicherung/Krankenversicherung, Miete, Behoerde/Steuer und Online-Bestellung.',
  'Antworte ausschliesslich mit einem JSON-Objekt, ohne Markdown, ohne Erklaertext und ohne zusaetzliche Felder.',
  'Halte dich exakt an das JSON-Schema. Verwende fuer nicht erkennbare Text- und Datumsfelder null. Verwende unknown fuer unklare Kategorien oder Statuswerte, wenn das Schema unknown erlaubt.',
  'Erfinde keine Absender, Glaeubiger, urspruenglichen Glaeubiger, Kundennummern, IBANs, BICs, Rechnungsnummern, Aktenzeichen, Betrage, Faelligkeitsdaten oder Rechnungsdaten.',
  'Wenn ein Wert nicht sichtbar oder nur geraten waere, gib null fuer Text-/Datumsfelder oder unknown fuer Enum-Felder zurueck.',
  'Datumswerte muessen im Format YYYY-MM-DD stehen. Wenn ein Datum nicht eindeutig lesbar ist, verwende null.',
  'Geldwerte muessen als Dezimalzahl mit Punkt und zwei Nachkommastellen ohne Waehrung zurueckgegeben werden, z.B. 28.56, 5.00 oder 33.56.',
  'Inferiere dueDate nur, wenn klare Zahlungsbedingungen sichtbar sind, zum Beispiel "zahlbar innerhalb von 14 Tagen" plus eindeutiges Rechnungsdatum. Wenn die Basis oder Frist unklar ist, dueDate null.',
  'Unterscheide die Geldrichtung: Rechnung, Bill, Mahnung und Inkasso sind cashflowType payable. Steuererstattung, Erstattung, Rueckerstattung, Guthaben, Gutschrift, "wird ueberwiesen" und "zu Ihren Gunsten" sind cashflowType receivable. Reine Informationsschreiben oder Vertraege ohne Zahlung sind neutral. Wenn unklar, unknown.',
  'Bei receivable: amountReceivable ist der erwartete Zahlungseingang, payerName ist die Stelle, die an den Nutzer zahlt, expectedPaymentDate ist der erwartete Zahlungstermin falls sichtbar. amountTotal soll null sein, wenn kein Betrag zu zahlen ist. paymentStatus ist expected, oder received wenn ein erfolgter Zahlungseingang sichtbar ist.',
  'Priorisiere explizite Zahlungsbereiche: "Bitte ueberweisen Sie", "Zahlbar bis", "Faellig am", "Verwendungszweck", "SEPA-Lastschrift", "Zahlteil", "Empfaenger", "IBAN", "BIC", "Kassenzeichen", "Vertragskonto", "Aktenzeichen".',
  'Erkenne deutsche Mahn- und Forderungsbegriffe besonders genau: Mahnung, 1. Mahnung, 2. Mahnung, letzte aussergerichtliche Mahnung, Inkasso, Mahnbescheid, Forderung, Aktenzeichen, Glaeubiger, urspruenglicher Glaeubiger, Mahnkosten, Inkassokosten, Restbetrag und Ursprungsbetrag.',
  'Wenn "Mahnbescheid" sichtbar ist, setze urgencyLevel critical und schreibe in riskNote, dass ein Mahnbescheid erwaehnt wird. Wenn "letzte aussergerichtliche Mahnung" sichtbar ist, setze urgencyLevel critical.',
  'Wenn Inkasso sichtbar ist, setze documentType inkasso_letter. Wenn Mahnung sichtbar ist und kein Inkasso vorliegt, setze documentType payment_reminder. Erfinde keine Mahnstufe, wenn keine sichtbar ist.',
  'Extrahiere reminderLevel als Mahnstufe. Bei "1. Mahnung" nutze "1", bei "2. Mahnung" nutze "2"; bei "letzte aussergerichtliche Mahnung", "Inkasso" oder "Mahnbescheid" nutze den sichtbaren Begriff; sonst null.',
  'Extrahiere originalCreditorName aus "urspruenglicher Glaeubiger", "Glaeubiger", "Auftraggeber", "Mandant" oder "Forderung der/des", nur wenn sichtbar. Extrahiere caseNumber aus Aktenzeichen, Forderungsnummer, Geschaeftszeichen oder Vorgangsnummer.',
  'Extrahiere originalAmount aus Ursprungsbetrag, urspruenglicher Betrag oder Hauptforderung, z.B. 28.56. Extrahiere reminderFee aus Mahnkosten, Mahngebuehr oder zusaetzliche Gebuehr, z.B. 5.00. Extrahiere collectionFee aus Inkassokosten, Inkassogebuehr, Geschaeftsgebuehr oder Auslagenpauschale.',
  'Extrahiere amountTotal bevorzugt aus Restbetrag, Gesamtforderung, offener Betrag, "Zu zahlen bis", zahlbar bis oder aktuell geforderte Gesamtsumme, z.B. 33.56. Do not invent missing values.',
  'Erkenne Inkasso-Schreiben separat als documentType inkasso_letter und branchCategory inkasso. Inkasso liegt vor, wenn ein Inkassounternehmen, Forderungsbeitreibung, Aktenzeichen, Vollmacht, Inkassokosten oder aehnliche Formulierungen sichtbar sind.',
  'Bei Inkasso: senderName ist das Inkassounternehmen oder die Kanzlei. creditorName ist der urspruengliche Glaeubiger/Auftraggeber/Mandant, falls sichtbar, zum Beispiel "Forderung der Stadtwerke Beispiel GmbH" oder "Auftraggeber: ConnectTel GmbH"; sonst null. amountTotal ist die aktuell geforderte Gesamtsumme inklusive Inkassokosten, falls sichtbar.',
  'Bei normalen Rechnungen, Mahnungen und Online-Bestellungen ist creditorName normalerweise der Zahlungsempfaenger/Glaeubiger. senderName ist der sichtbare Absender oder Rechnungssteller.',
  'Bei Mahnungen: documentType payment_reminder, sofern kein Inkasso vorliegt. branchCategory bleibt die erkennbare Branche, z.B. energy, telecom, rent, insurance oder government_tax; nutze reminder nur bei reiner Mahnung ohne erkennbare Branche.',
  'Bei Mahnungen zu zahnaerztlichen oder aerztlichen Leistungen: documentType payment_reminder, branchCategory dental bei zahnaerztlichen Leistungen, sonst medical, expenseCategory health.',
  'Bei Strom/Gas/Energie: documentType utility_bill, branchCategory energy, expenseCategory energy. Achte auf Abschlag, Jahresabrechnung, Vertragskonto, Zaehlernummer, Verbrauchsstelle und Nachzahlung/Guthaben.',
  'Bei Wasser/Abwasser: documentType utility_bill, branchCategory water, expenseCategory housing oder other, je nach sichtbarem Kontext. Achte auf Kundennummer, Verbrauchsstelle, Gebührenbescheid und Faelligkeit.',
  'Bei Telekom/Internet/Mobilfunk: documentType telecom_bill, branchCategory telecom, expenseCategory telecom. Achte auf Rechnungsnummer, Kundennummer, Vertragskonto, Leistungszeitraum und SEPA-Lastschrift.',
  'Bei Miete/Nebenkosten: documentType rent_letter, branchCategory rent, expenseCategory housing. Achte auf Vermieter/Hausverwaltung, Mieterkonto, Objekt/Adresse, Nebenkostenabrechnung, Nachzahlung und Zahlungsfrist.',
  'Bei Versicherung: documentType insurance_document, branchCategory insurance, expenseCategory insurance. Achte auf Versicherungsschein-/Vertragsnummer, Beitragsrechnung, Schaden-/Leistungsnummer, Beitrag und Faelligkeit.',
  'Bei gesetzlicher Krankenversicherung oder Pflegeversicherung: DAK, DAK-Gesundheit, AOK, TK, Techniker Krankenkasse, Barmer, Krankenkasse, Gesundheit und Pflegeversicherung sind Versicherungsdokumente. Nutze documentType insurance_document oder invoice, branchCategory health_insurance, expenseCategory insurance.',
  'Bei Behoerde/Steuer: documentType government_letter oder tax_letter, branchCategory government_tax, expenseCategory tax_government. Achte auf Finanzamt, Stadt/Gemeinde, Bescheid, Kassenzeichen, Steuernummer, Aktenzeichen, Zahlungsfrist und Bankverbindung.',
  'amountTotal ist der zu zahlende Gesamtbetrag als Dezimalzahl ohne Waehrung, zum Beispiel 49.95. IBAN und BIC muessen exakt aus dem Dokument uebernommen werden.',
  'paymentReference ist der angegebene Verwendungszweck, Mandatsreferenz, Kundennummer/Rechnungsnummer-Kombination oder Zahlungsreferenz. Uebernimm keine Anweisung als Verwendungszweck. Wenn "Verwendungszweck: Ihre Belegnr. aus der obigen Liste" sichtbar ist, verwende die Belegnr. aus der Tabelle, z.B. RG00028972. Wenn kein klarer Verwendungszweck genannt ist, null.',
  'documentType-Wahl: invoice fuer Rechnung, payment_reminder fuer Mahnung/Zahlungserinnerung, inkasso_letter fuer Inkasso, utility_bill fuer Strom/Gas/Wasser/Energie, telecom_bill fuer Telekom/Internet/Mobilfunk, insurance_document fuer Versicherung, rent_letter fuer Miete/Nebenkosten, government_letter oder tax_letter fuer Behoerde/Steuer, receipt fuer Quittung/Beleg, subscription_bill fuer Abo, unknown wenn unklar.',
  'branchCategory-Wahl: dental fuer zahnaerztliche Leistungen, medical fuer aerztliche/medizinische Leistungen, energy fuer Strom/Gas, water fuer Wasser, telecom fuer Telekommunikation, insurance fuer Versicherung, health_insurance fuer gesetzliche Krankenversicherung/Pflegeversicherung wie DAK, AOK, TK oder Barmer, rent fuer Miete/Nebenkosten, government_tax fuer Behoerde/Steuer, online_order fuer Online-Bestellung, inkasso fuer Inkasso, reminder fuer reine Mahnung ohne erkennbare Branche, general_invoice fuer allgemeine Rechnung, health fuer sonstige medizinische Dokumente, other fuer sonstige klare Branche, unknown wenn unklar.',
  'paymentStatus-Wahl: paid nur bei sichtbarem Bezahlt-Hinweis, unpaid bei offener Zahlungsaufforderung, needs_review bei unklarer Zahlungsaufforderung, disputed bei Widerspruch/Streitfall, sent_to_insurance oder waiting_reimbursement nur bei klarer Versicherungsabwicklung, closed bei eindeutig abgeschlossen, unknown wenn nicht beurteilbar.',
  'paymentStatus fuer receivable: expected fuer erwartete Erstattung/Gutschrift/Zahlung an den Nutzer, received fuer bereits erhaltene Zahlung. Nutze unpaid nicht fuer receivable.',
  'urgencyLevel-Wahl: critical bei Inkasso, letzter Mahnung, gerichtlicher Androhung, Sperrandrohung oder sehr kurzer/ueberschrittener Frist; high bei Mahnung oder bald faelliger Zahlung; medium bei normaler offener Rechnung; low bei Beleg/Info ohne akuten Handlungsdruck; unknown wenn nicht beurteilbar.',
  'expenseCategory-Wahl: housing, energy, telecom, insurance, health, transport, shopping, subscriptions, tax_government, education, travel, legal, other oder unknown passend zum Dokument.',
  'isExpense ist true, wenn das Dokument wahrscheinlich eine Ausgabe oder Forderung gegen den Nutzer ist; false nur bei eindeutigem Guthaben, Erstattung oder reinem Informationsschreiben; null wenn unklar.',
  'cashflowType-Wahl: payable fuer Geld, das der Nutzer zahlen soll; receivable fuer Geld, das der Nutzer erhalten soll; neutral fuer reine Information; unknown wenn unklar.',
  'Beispiele fuer Klassifikation: "Stadtwerke Abschlagsplan Strom/Gas, Vertragskonto, Betrag faellig" => utility_bill/energy/unpaid/energy. "Vodafone/Telekom Rechnung, Kundennummer, zahlbar per Lastschrift" => telecom_bill/telecom/unpaid/telecom. "Nebenkostenabrechnung mit Nachzahlung an Hausverwaltung" => rent_letter/rent/unpaid/housing. "Finanzamt Einkommensteuerbescheid mit Kassenzeichen und Zahlung bis" => tax_letter/government_tax/unpaid/tax_government. "Mahnung zur offenen Stromrechnung" => payment_reminder/energy/unpaid/high. "Inkasso im Auftrag von ConnectTel GmbH, Aktenzeichen, Gesamtforderung" => inkasso_letter/inkasso/unpaid/critical/legal und creditorName ConnectTel GmbH, wenn sichtbar.',
].join(' ');

const ocrUserPrompt = [
  'Lies das Bild sorgfaeltig und extrahiere die Felder fuer RechnungGuard.',
  'Beruecksichtige Kopfbereich, Fussbereich, Zahlungsabschnitt, QR-/SEPA-Abschnitt, Tabellen, Mahntext und Inkasso-Aktenzeichen.',
  'Pruefe besonders senderName, creditorName, payerName, amountTotal, amountReceivable, dueDate, expectedPaymentDate, invoiceDate, invoiceNumber, customerNumber, iban, bic, paymentReference, documentType, branchCategory, paymentStatus, urgencyLevel, expenseCategory, cashflowType und isExpense.',
  'Suche bei Inkasso explizit nach urspruenglichem Glaeubiger, Mandant, Auftraggeber, Forderung aus, Vertragskonto oder Waren-/Dienstleistername.',
  'Suche bei Strom/Gas/Wasser, Telekom, Miete, Versicherung und Behoerde/Steuer nach branchenspezifischen Referenzen wie Vertragskonto, Kundennummer, Mieterkonto, Versicherungsschein, Kassenzeichen, Steuernummer, Aktenzeichen und Verwendungszweck.',
  'Suche bei Mahnung und Inkasso nach reminderLevel, originalCreditorName, caseNumber, originalAmount, reminderFee, collectionFee, riskNote und actionRecommendation.',
  'Achte auf Mahnbescheid und letzte aussergerichtliche Mahnung als kritische Frist. Achte auf Restbetrag als aktuell zu zahlenden Betrag und Ursprungsbetrag als originalAmount.',
  'Gib null zurueck, wenn IBAN, Rechnungsnummer, Faelligkeit oder urspruenglicher Glaeubiger nicht sichtbar sind.',
  'Gib nur das JSON-Objekt zurueck.',
].join(' ');

const extractOutputText = (payload) => {
  if (typeof payload.output_text === 'string') {
    return payload.output_text;
  }

  const message = payload.output?.find((item) => item.type === 'message');
  const textContent = message?.content?.find((item) => item.type === 'output_text');
  return typeof textContent?.text === 'string' ? textContent.text : '';
};

const parseOpenAiOcrResponse = (payload) => {
  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new Error('OpenAI OCR response did not include output text.');
  }

  return normalizeOcrDocument(JSON.parse(outputText));
};

const readOpenAiError = async (response) => {
  try {
    await response.text();
  } catch {
    // Intentionally discard provider error bodies; they can contain request context.
  }

  return `OpenAI request failed with status ${response.status}`;
};

const extractWithOpenAi = async (file) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: openaiModel,
      input: [
        {
          role: 'system',
          content: ocrSystemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: ocrUserPrompt,
            },
            {
              type: 'input_image',
              image_url: await getDataUrl(file),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'rechnungguard_scanned_document',
          strict: true,
          schema: scannedDocumentSchema,
        },
      },
    }),
  });

  if (!openAiResponse.ok) {
    throw new Error(await readOpenAiError(openAiResponse));
  }

  return parseOpenAiOcrResponse(await openAiResponse.json());
};

app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    ocrProvider,
  });
});

app.post('/ocr', upload.single('image'), async (request, response) => {
  if (!request.file) {
    response.status(400).json({
      error: 'image file is required',
    });
    return;
  }

  if (ocrProvider === 'mock') {
    try {
      response.json(mockOcrDocument);
    } finally {
      await deleteUploadedFile(request.file);
    }
    return;
  }

  if (ocrProvider === 'openai') {
    try {
      response.json({
        ...(await extractWithOpenAi(request.file)),
        ocrProvider: 'openai',
      });
    } catch (error) {
      console.error('OpenAI OCR failed');
      response.status(500).json({
        error: 'OCR processing failed',
        ocrProvider: 'openai',
      });
    } finally {
      await deleteUploadedFile(request.file);
    }
    return;
  }

  try {
    console.error('Unsupported OCR provider configured');
    response.status(500).json({
      error: 'OCR provider is not configured correctly',
    });
  } finally {
    await deleteUploadedFile(request.file);
  }
});

app.use((_request, response) => {
  response.status(404).json({
    error: 'Not found',
  });
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    response.status(400).json({
      error: 'Invalid upload',
    });
    return;
  }

  if (error) {
    console.error('Unexpected server error');
    response.status(400).json({
      error: 'Invalid request',
    });
    return;
  }

  response.status(500).json({
    error: 'Unexpected server error',
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`RechnungGuard OCR backend listening on port ${port}`);
});
