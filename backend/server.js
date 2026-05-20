const dotenv = require('dotenv');
const express = require('express');
const multer = require('multer');

dotenv.config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
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
  'energy',
  'water',
  'telecom',
  'insurance',
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
  'paid',
  'sent_to_insurance',
  'waiting_reimbursement',
  'disputed',
  'closed',
];

const urgencyLevelValues = ['unknown', 'low', 'medium', 'high', 'critical'];

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
  amountTotal: '49,95 EUR',
  dueDate: '2026-05-25',
  invoiceDate: '2026-05-01',
  invoiceNumber: 'RG-2026-1001',
  customerNumber: 'K-123456',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  paymentReference: 'RG-2026-1001 K-123456',
  documentLanguage: 'de',
  urgencyLevel: 'medium',
  expenseCategory: 'telecom',
  isExpense: true,
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
    'amountTotal',
    'dueDate',
    'invoiceDate',
    'invoiceNumber',
    'customerNumber',
    'iban',
    'bic',
    'paymentReference',
    'documentLanguage',
    'urgencyLevel',
    'expenseCategory',
    'isExpense',
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
      description: 'Business domain such as energy, water, telecom, insurance, rent, government_tax, inkasso, reminder, health, or unknown.',
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
    amountTotal: {
      ...nullableStringSchema,
      description: 'Total amount currently payable, including currency and fees when visible. Do not calculate from partial lines unless the total is explicitly clear.',
    },
    dueDate: {
      ...nullableStringSchema,
      description: 'Payment due date in YYYY-MM-DD. Use null when not visible or not derivable from an explicit visible date plus clear payment term.',
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
  },
};

const stringOrNull = (value) => (typeof value === 'string' && value.trim() ? value : null);
const enumOrFallback = (value, values, fallback) => (values.includes(value) ? value : fallback);

const normalizeOcrDocument = (document) => ({
  documentType: enumOrFallback(document.documentType, documentTypeValues, 'unknown'),
  branchCategory: enumOrFallback(document.branchCategory, branchCategoryValues, 'unknown'),
  paymentStatus: enumOrFallback(document.paymentStatus, paymentStatusValues, 'unknown'),
  senderName: stringOrNull(document.senderName),
  creditorName: stringOrNull(document.creditorName),
  amountTotal: stringOrNull(document.amountTotal),
  dueDate: stringOrNull(document.dueDate),
  invoiceDate: stringOrNull(document.invoiceDate),
  invoiceNumber: stringOrNull(document.invoiceNumber),
  customerNumber: stringOrNull(document.customerNumber),
  iban: stringOrNull(document.iban),
  bic: stringOrNull(document.bic),
  paymentReference: stringOrNull(document.paymentReference),
  documentLanguage: typeof document.documentLanguage === 'string' && document.documentLanguage.trim() ? document.documentLanguage : 'de',
  urgencyLevel: enumOrFallback(document.urgencyLevel, urgencyLevelValues, 'unknown'),
  expenseCategory: enumOrFallback(document.expenseCategory, expenseCategoryValues, 'unknown'),
  isExpense: typeof document.isExpense === 'boolean' ? document.isExpense : null,
});

const getDataUrl = (file) => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

const ocrSystemPrompt = [
  'Du extrahierst strukturierte Daten aus deutschen Zahlungsdokumenten fuer RechnungGuard.',
  'Unterstuetzte Dokumente: Rechnung, Mahnung, Inkasso-Schreiben, Strom/Gas/Wasser, Telekommunikation, Versicherung, Miete, Behoerde/Steuer und Online-Bestellung.',
  'Antworte ausschliesslich mit einem JSON-Objekt, ohne Markdown, ohne Erklaertext und ohne zusaetzliche Felder.',
  'Halte dich exakt an das JSON-Schema. Verwende fuer nicht erkennbare Text- und Datumsfelder null. Verwende unknown fuer unklare Kategorien oder Statuswerte, wenn das Schema unknown erlaubt.',
  'Erfinde keine Absender, Glaeubiger, urspruenglichen Glaeubiger, Kundennummern, IBANs, BICs, Rechnungsnummern, Aktenzeichen, Betrage, Faelligkeitsdaten oder Rechnungsdaten.',
  'Wenn ein Wert nicht sichtbar oder nur geraten waere, gib null fuer Text-/Datumsfelder oder unknown fuer Enum-Felder zurueck.',
  'Datumswerte muessen im Format YYYY-MM-DD stehen. Wenn ein Datum nicht eindeutig lesbar ist, verwende null.',
  'Inferiere dueDate nur, wenn klare Zahlungsbedingungen sichtbar sind, zum Beispiel "zahlbar innerhalb von 14 Tagen" plus eindeutiges Rechnungsdatum. Wenn die Basis oder Frist unklar ist, dueDate null.',
  'Priorisiere explizite Zahlungsbereiche: "Bitte ueberweisen Sie", "Zahlbar bis", "Faellig am", "Verwendungszweck", "SEPA-Lastschrift", "Zahlteil", "Empfaenger", "IBAN", "BIC", "Kassenzeichen", "Vertragskonto", "Aktenzeichen".',
  'Erkenne Inkasso-Schreiben separat als documentType inkasso_letter und branchCategory inkasso. Inkasso liegt vor, wenn ein Inkassounternehmen, Forderungsbeitreibung, Aktenzeichen, Vollmacht, Inkassokosten oder aehnliche Formulierungen sichtbar sind.',
  'Bei Inkasso: senderName ist das Inkassounternehmen oder die Kanzlei. creditorName ist der urspruengliche Glaeubiger/Auftraggeber/Mandant, falls sichtbar, zum Beispiel "Forderung der Stadtwerke Beispiel GmbH" oder "Auftraggeber: ConnectTel GmbH"; sonst null. amountTotal ist die aktuell geforderte Gesamtsumme inklusive Inkassokosten, falls sichtbar.',
  'Bei normalen Rechnungen, Mahnungen und Online-Bestellungen ist creditorName normalerweise der Zahlungsempfaenger/Glaeubiger. senderName ist der sichtbare Absender oder Rechnungssteller.',
  'Bei Mahnungen: documentType payment_reminder, sofern kein Inkasso vorliegt. branchCategory bleibt die erkennbare Branche, z.B. energy, telecom, rent, insurance oder government_tax; nutze reminder nur bei reiner Mahnung ohne erkennbare Branche.',
  'Bei Strom/Gas/Energie: documentType utility_bill, branchCategory energy, expenseCategory energy. Achte auf Abschlag, Jahresabrechnung, Vertragskonto, Zaehlernummer, Verbrauchsstelle und Nachzahlung/Guthaben.',
  'Bei Wasser/Abwasser: documentType utility_bill, branchCategory water, expenseCategory housing oder other, je nach sichtbarem Kontext. Achte auf Kundennummer, Verbrauchsstelle, Gebührenbescheid und Faelligkeit.',
  'Bei Telekom/Internet/Mobilfunk: documentType telecom_bill, branchCategory telecom, expenseCategory telecom. Achte auf Rechnungsnummer, Kundennummer, Vertragskonto, Leistungszeitraum und SEPA-Lastschrift.',
  'Bei Miete/Nebenkosten: documentType rent_letter, branchCategory rent, expenseCategory housing. Achte auf Vermieter/Hausverwaltung, Mieterkonto, Objekt/Adresse, Nebenkostenabrechnung, Nachzahlung und Zahlungsfrist.',
  'Bei Versicherung: documentType insurance_document, branchCategory insurance, expenseCategory insurance. Achte auf Versicherungsschein-/Vertragsnummer, Beitragsrechnung, Schaden-/Leistungsnummer, Beitrag und Faelligkeit.',
  'Bei Behoerde/Steuer: documentType government_letter oder tax_letter, branchCategory government_tax, expenseCategory tax_government. Achte auf Finanzamt, Stadt/Gemeinde, Bescheid, Kassenzeichen, Steuernummer, Aktenzeichen, Zahlungsfrist und Bankverbindung.',
  'amountTotal ist der zu zahlende Gesamtbetrag inklusive Waehrung, zum Beispiel "49,95 EUR". IBAN und BIC muessen exakt aus dem Dokument uebernommen werden.',
  'paymentReference ist der angegebene Verwendungszweck, Mandatsreferenz, Kundennummer/Rechnungsnummer-Kombination oder Zahlungsreferenz. Wenn kein klarer Verwendungszweck genannt ist, null.',
  'documentType-Wahl: invoice fuer Rechnung, payment_reminder fuer Mahnung/Zahlungserinnerung, inkasso_letter fuer Inkasso, utility_bill fuer Strom/Gas/Wasser/Energie, telecom_bill fuer Telekom/Internet/Mobilfunk, insurance_document fuer Versicherung, rent_letter fuer Miete/Nebenkosten, government_letter oder tax_letter fuer Behoerde/Steuer, receipt fuer Quittung/Beleg, subscription_bill fuer Abo, unknown wenn unklar.',
  'branchCategory-Wahl: energy fuer Strom/Gas, water fuer Wasser, telecom fuer Telekommunikation, insurance fuer Versicherung, rent fuer Miete/Nebenkosten, government_tax fuer Behoerde/Steuer, online_order fuer Online-Bestellung, inkasso fuer Inkasso, reminder fuer reine Mahnung ohne erkennbare Branche, general_invoice fuer allgemeine Rechnung, health fuer medizinische Dokumente, other fuer sonstige klare Branche, unknown wenn unklar.',
  'paymentStatus-Wahl: paid nur bei sichtbarem Bezahlt-Hinweis, unpaid bei offener Zahlungsaufforderung, needs_review bei unklarer Zahlungsaufforderung, disputed bei Widerspruch/Streitfall, sent_to_insurance oder waiting_reimbursement nur bei klarer Versicherungsabwicklung, closed bei eindeutig abgeschlossen, unknown wenn nicht beurteilbar.',
  'urgencyLevel-Wahl: critical bei Inkasso, letzter Mahnung, gerichtlicher Androhung, Sperrandrohung oder sehr kurzer/ueberschrittener Frist; high bei Mahnung oder bald faelliger Zahlung; medium bei normaler offener Rechnung; low bei Beleg/Info ohne akuten Handlungsdruck; unknown wenn nicht beurteilbar.',
  'expenseCategory-Wahl: housing, energy, telecom, insurance, health, transport, shopping, subscriptions, tax_government, education, travel, legal, other oder unknown passend zum Dokument.',
  'isExpense ist true, wenn das Dokument wahrscheinlich eine Ausgabe oder Forderung gegen den Nutzer ist; false nur bei eindeutigem Guthaben, Erstattung oder reinem Informationsschreiben; null wenn unklar.',
  'Beispiele fuer Klassifikation: "Stadtwerke Abschlagsplan Strom/Gas, Vertragskonto, Betrag faellig" => utility_bill/energy/unpaid/energy. "Vodafone/Telekom Rechnung, Kundennummer, zahlbar per Lastschrift" => telecom_bill/telecom/unpaid/telecom. "Nebenkostenabrechnung mit Nachzahlung an Hausverwaltung" => rent_letter/rent/unpaid/housing. "Finanzamt Einkommensteuerbescheid mit Kassenzeichen und Zahlung bis" => tax_letter/government_tax/unpaid/tax_government. "Mahnung zur offenen Stromrechnung" => payment_reminder/energy/unpaid/high. "Inkasso im Auftrag von ConnectTel GmbH, Aktenzeichen, Gesamtforderung" => inkasso_letter/inkasso/unpaid/critical/legal und creditorName ConnectTel GmbH, wenn sichtbar.',
].join(' ');

const ocrUserPrompt = [
  'Lies das Bild sorgfaeltig und extrahiere die Felder fuer RechnungGuard.',
  'Beruecksichtige Kopfbereich, Fussbereich, Zahlungsabschnitt, QR-/SEPA-Abschnitt, Tabellen, Mahntext und Inkasso-Aktenzeichen.',
  'Pruefe besonders senderName, creditorName, amountTotal, dueDate, invoiceDate, invoiceNumber, customerNumber, iban, bic, paymentReference, documentType, branchCategory, paymentStatus, urgencyLevel, expenseCategory und isExpense.',
  'Suche bei Inkasso explizit nach urspruenglichem Glaeubiger, Mandant, Auftraggeber, Forderung aus, Vertragskonto oder Waren-/Dienstleistername.',
  'Suche bei Strom/Gas/Wasser, Telekom, Miete, Versicherung und Behoerde/Steuer nach branchenspezifischen Referenzen wie Vertragskonto, Kundennummer, Mieterkonto, Versicherungsschein, Kassenzeichen, Steuernummer, Aktenzeichen und Verwendungszweck.',
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
    const payload = await response.json();
    return payload.error?.message || `OpenAI request failed with status ${response.status}`;
  } catch {
    return `OpenAI request failed with status ${response.status}`;
  }
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
              image_url: getDataUrl(file),
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
    response.json(mockOcrDocument);
    return;
  }

  if (ocrProvider === 'openai') {
    try {
      response.json({
        ...(await extractWithOpenAi(request.file)),
        ocrProvider: 'openai',
      });
    } catch (error) {
      console.error('OpenAI OCR failed:', error.message);
      response.status(500).json({
        error: 'OpenAI OCR failed',
        details: error.message,
        ocrProvider: 'openai',
      });
    }
    return;
  }

  console.error(`Unsupported OCR provider "${ocrProvider}".`);
  response.status(500).json({
    error: `Unsupported OCR provider "${ocrProvider}".`,
  });
});

app.use((_request, response) => {
  response.status(404).json({
    error: 'Not found',
  });
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    response.status(400).json({
      error: error.message,
    });
    return;
  }

  if (error) {
    console.error('Unexpected server error:', error.message);
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
