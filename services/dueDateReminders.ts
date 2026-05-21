import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import {
  DueDateReminderKey,
  DueDateReminderStatus,
  PaymentStatus,
  ScannedDocument,
} from '../types/ScannedDocument';

type NotificationsModule = typeof import('expo-notifications');

const REMINDER_CHANNEL_ID = 'due-date-reminders';
const REMINDER_HOUR = 9;
const REMINDER_MINUTE = 0;

const reminderOffsets: Array<{ key: DueDateReminderKey; daysBefore: number }> = [
  { key: 'sevenDaysBefore', daysBefore: 7 },
  { key: 'threeDaysBefore', daysBefore: 3 },
  { key: 'dueDate', daysBefore: 0 },
];

const reminderEligibleStatuses = new Set<PaymentStatus>(['needs_review', 'unpaid']);

let notificationsModule: NotificationsModule | null = null;
let notificationHandlerConfigured = false;

const getNowIso = () => new Date().toISOString();

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  Constants.appOwnership === 'expo' ||
  Boolean(Constants.expoGoConfig);

const createStatus = (
  state: DueDateReminderStatus['state'],
  notificationIds: DueDateReminderStatus['notificationIds'] = {},
  scheduledFor: DueDateReminderStatus['scheduledFor'] = {},
): DueDateReminderStatus => ({
  state,
  notificationIds,
  scheduledFor,
  updatedAt: getNowIso(),
});

const getExpoGoLimitedStatus = (): DueDateReminderStatus => createStatus('expo_go_limited');

const getNotifications = (): NotificationsModule | null => {
  if (isExpoGo) {
    return null;
  }

  if (notificationsModule) {
    return notificationsModule;
  }

  try {
    // Keep expo-notifications out of Expo Go startup. SDK 53+ can throw while loading it there.
    notificationsModule = require('expo-notifications') as NotificationsModule;

    if (!notificationHandlerConfigured) {
      notificationsModule.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      notificationHandlerConfigured = true;
    }

    return notificationsModule;
  } catch {
    return null;
  }
};

export const shouldHaveDueDateReminders = (document: Pick<ScannedDocument, 'dueDate' | 'paymentStatus' | 'cashflowType'>) =>
  document.cashflowType === 'payable' && Boolean(document.dueDate) && reminderEligibleStatuses.has(document.paymentStatus);

const parseDueDate = (dueDate: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate.trim());
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const parsedDate = new Date(Number(year), Number(month) - 1, Number(day), REMINDER_HOUR, REMINDER_MINUTE, 0, 0);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const getReminderDate = (dueDate: Date, daysBefore: number) => {
  const reminderDate = new Date(dueDate);
  reminderDate.setDate(reminderDate.getDate() - daysBefore);
  return reminderDate;
};

const getReminderBody = (document: ScannedDocument, daysBefore: number) => {
  const sender = document.senderName || document.creditorName || 'Dokument';
  if (daysBefore === 0) {
    return `${sender} ist heute fallig.`;
  }
  return `${sender} ist in ${daysBefore} Tagen fallig.`;
};

const ensureNotificationPermissions = async (Notifications: NotificationsModule) => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'Faelligkeitserinnerungen',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }

  const currentPermissions = await Notifications.getPermissionsAsync();
  if (currentPermissions.granted) {
    return true;
  }

  const requestedPermissions = await Notifications.requestPermissionsAsync();
  return requestedPermissions.granted;
};

const cancelNotificationIds = async (
  Notifications: NotificationsModule,
  status?: DueDateReminderStatus,
) => {
  const ids = Object.values(status?.notificationIds ?? {}).filter(Boolean);
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
};

export const cancelDueDateReminders = async (documentId: string): Promise<void> => {
  const Notifications = getNotifications();
  if (!Notifications) {
    return;
  }

  try {
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const matchingNotifications = scheduledNotifications.filter(
      (notification) => notification.content.data?.documentId === documentId,
    );

    await Promise.all(
      matchingNotifications.map((notification) =>
        Notifications.cancelScheduledNotificationAsync(notification.identifier),
      ),
    );
  } catch {
    // Reminder cleanup must never block saving the document.
  }
};

export const getReminderStatus = async (documentId: string): Promise<DueDateReminderStatus> => {
  const Notifications = getNotifications();
  if (!Notifications) {
    return getExpoGoLimitedStatus();
  }

  try {
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const notificationIds: DueDateReminderStatus['notificationIds'] = {};
    const scheduledFor: DueDateReminderStatus['scheduledFor'] = {};

    scheduledNotifications.forEach((notification) => {
      const data = notification.content.data ?? {};
      if (data.documentId !== documentId) {
        return;
      }

      const reminderKey = data.reminderKey as DueDateReminderKey | undefined;
      if (!reminderKey) {
        return;
      }

      notificationIds[reminderKey] = notification.identifier;
      const triggerValue = notification.trigger && 'value' in notification.trigger ? notification.trigger.value : undefined;
      if (typeof triggerValue === 'number') {
        scheduledFor[reminderKey] = new Date(triggerValue).toISOString();
      }
    });

    return createStatus(Object.keys(notificationIds).length > 0 ? 'scheduled' : 'no_future_dates', notificationIds, scheduledFor);
  } catch {
    return createStatus('failed');
  }
};

export const scheduleDueDateReminders = async (document: ScannedDocument): Promise<DueDateReminderStatus> => {
  if (!shouldHaveDueDateReminders(document)) {
    return createStatus('not_required');
  }

  const dueDate = parseDueDate(document.dueDate);
  if (!dueDate) {
    return createStatus('failed');
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    return getExpoGoLimitedStatus();
  }

  try {
    const hasPermission = await ensureNotificationPermissions(Notifications);
    if (!hasPermission) {
      return createStatus('permission_denied');
    }

    const notificationIds: DueDateReminderStatus['notificationIds'] = {};
    const scheduledFor: DueDateReminderStatus['scheduledFor'] = {};
    const now = Date.now();

    for (const reminder of reminderOffsets) {
      const reminderDate = getReminderDate(dueDate, reminder.daysBefore);
      if (reminderDate.getTime() <= now) {
        continue;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'RechnungGuard Erinnerung',
          body: getReminderBody(document, reminder.daysBefore),
          sound: 'default',
          data: {
            documentId: document.id,
            reminderKey: reminder.key,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderDate,
          channelId: REMINDER_CHANNEL_ID,
        },
      });

      notificationIds[reminder.key] = notificationId;
      scheduledFor[reminder.key] = reminderDate.toISOString();
    }

    return createStatus(Object.keys(notificationIds).length > 0 ? 'scheduled' : 'no_future_dates', notificationIds, scheduledFor);
  } catch {
    return createStatus('failed');
  }
};

export const reconcileDueDateReminders = async (document: ScannedDocument): Promise<ScannedDocument> => {
  const Notifications = getNotifications();

  try {
    if (Notifications) {
      await cancelNotificationIds(Notifications, document.dueDateReminderStatus);
    }
    await cancelDueDateReminders(document.id);

    const dueDateReminderStatus = await scheduleDueDateReminders(document);
    return {
      ...document,
      dueDateReminderStatus,
    };
  } catch {
    return {
      ...document,
      dueDateReminderStatus: createStatus('failed'),
    };
  }
};
