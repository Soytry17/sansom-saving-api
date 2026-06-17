/**
 * The fixed FCM data-message contract shared with the Android client.
 * Every push is a DATA-only message (no top-level `notification` block) so
 * the app's handler always receives it in both foreground and background and
 * can display + sync the inbox consistently.
 *
 * All FCM data values must be strings.
 */
export type PushType =
  | 'transfer_received'
  | 'transfer_sent'
  | 'low_balance'
  | 'monthly_report';

export interface PushData {
  type: PushType;
  notificationId: string;
  title: string;
  message: string;
  /** ISO-8601 timestamp, e.g. 2026-05-10T14:00:00.000Z */
  createdAt: string;

  // Optional deep-linking extras — include when relevant.
  transactionId?: string;
  amount?: string;
  accountNumber?: string;
}

/**
 * Normalize a PushData into the string-only record FCM requires, dropping
 * any undefined optional keys.
 */
export function toFcmDataRecord(data: PushData): Record<string, string> {
  const record: Record<string, string> = {
    type: data.type,
    notificationId: data.notificationId,
    title: data.title,
    message: data.message,
    createdAt: data.createdAt,
  };
  if (data.transactionId !== undefined) record.transactionId = data.transactionId;
  if (data.amount !== undefined) record.amount = data.amount;
  if (data.accountNumber !== undefined) record.accountNumber = data.accountNumber;
  return record;
}
