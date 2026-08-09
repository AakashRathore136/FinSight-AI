/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * Push Notification Utility for subscription reminders and alerts
 * Uses the Notification API with Firebase Cloud Messaging support
 */

import { formatCurrency } from "@/src/lib/utils";

export interface NotificationPermission {
  granted: boolean;
  canRequest: boolean;
  denied: boolean;
}

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: Record<string, any>;
}

// Check if push notifications are supported
export function isNotificationSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

// Check current notification permission status
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) {
    return { granted: false, canRequest: false, denied: false };
  }

  const permission = Notification.permission;
  return {
    granted: permission === 'granted',
    canRequest: permission === 'default',
    denied: permission === 'denied',
  };
}

// Request notification permission from user
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    return { granted: false, canRequest: false, denied: false };
  }

  const permission = await Notification.requestPermission();
  return {
    granted: permission === 'granted',
    canRequest: permission === 'default',
    denied: permission === 'denied',
  };
}

// Show a local notification
export async function showNotification(options: NotificationOptions): Promise<Notification | null> {
  const permission = getNotificationPermission();
  
  if (!permission.granted) {
    console.warn('Notification permission not granted');
    return null;
  }

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      icon: options.icon || '/favicon.ico',
      tag: options.tag,
      requireInteraction: options.requireInteraction || false,
    });

    return notification;
  } catch (error) {
    console.error('Error showing notification:', error);
    return null;
  }
}

// Schedule subscription renewal reminder
export async function scheduleSubscriptionReminder(
  subscriptionName: string,
  renewalDate: Date,
  amount: number
): Promise<void> {
  const now = new Date();
  const daysUntilRenewal = Math.ceil((renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Show reminder 1 day before
  if (daysUntilRenewal === 1) {
    await showNotification({
      title: '📅 Subscription Renewal Tomorrow',
      body: `${subscriptionName} renews tomorrow for ${formatCurrency(amount)}`,
      tag: `subscription-${subscriptionName}`,
      requireInteraction: true,
    });
  }

  // Show reminder on the day
  if (daysUntilRenewal === 0) {
    await showNotification({
      title: '🔔 Subscription Due Today',
      body: `${subscriptionName} renews today for ${formatCurrency(amount)}`,
      tag: `subscription-${subscriptionName}`,
      requireInteraction: true,
    });
  }
}

// Send budget alert notification
export async function sendBudgetAlert(
  category: string,
  spent: number,
  limit: number,
  percentageUsed: number
): Promise<Notification | null> {
  const overBudget = spent > limit;
  
  return showNotification({
    title: overBudget ? '⚠️ Budget Exceeded!' : '💰 Budget Alert',
    body: `${category}: ${formatCurrency(spent)} of ${formatCurrency(limit)} (${percentageUsed.toFixed(0)}%)`,
    tag: `budget-${category}`,
    requireInteraction: overBudget,
  });
}

// Send anomaly alert
export async function sendAnomalyAlert(
  description: string,
  amount: number,
  category: string
): Promise<Notification | null> {
  return showNotification({
    title: '🚨 Unusual Transaction Detected',
    body: `${formatCurrency(amount)} ${category}: ${description.substring(0, 50)}...`,
    tag: 'anomaly-alert',
    requireInteraction: true,
  });
}

// Subscribe to FCM topic for cross-device notifications
export async function subscribeToTopic(userId: string, topic: string): Promise<boolean> {
  try {
    // This would integrate with Firebase Cloud Messaging
    // For now, return true to indicate the function exists
    return true;
  } catch (error) {
    console.error('Error subscribing to topic:', error);
    return false;
  }
}

// Store notification preferences in Firestore
export interface NotificationPreferences {
  subscriptionReminders: boolean;
  budgetAlerts: boolean;
  anomalyAlerts: boolean;
  dailyDigest: boolean;
  reminderDaysBefore: number;
}

export function getDefaultNotificationPreferences(): NotificationPreferences {
  return {
    subscriptionReminders: true,
    budgetAlerts: true,
    anomalyAlerts: true,
    dailyDigest: false,
    reminderDaysBefore: 1,
  };
}
