/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState } from "react";
import { motion } from "motion/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Progress } from "@/src/components/ui/progress";
import { Calendar, AlertTriangle, Trash2, RefreshCw } from "lucide-react";
import { format, differenceInDays, differenceInMilliseconds, startOfDay } from "date-fns";
import { toast } from "sonner";
import { Subscription } from "@/src/lib/subscriptionUtils";
import {
  updateSubscription,
  deleteSubscription,
} from "@/src/lib/subscriptionUtils";

interface SubscriptionCardProps {
  subscription: Subscription;
  onUpdate: () => void;
}

export function SubscriptionCard({
  subscription,
  onUpdate,
}: SubscriptionCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const daysUntilRenewal = differenceInDays(
    subscription.nextRenewalDate,
    new Date(),
  );
  const isUrgent = daysUntilRenewal <= 7 && daysUntilRenewal >= 0;
  const isOverdue = daysUntilRenewal < 0;

  const handleToggleActive = async () => {
    setIsUpdating(true);
    try {
      await updateSubscription(subscription.id, {
        isActive: !subscription.isActive,
      });
      toast.success(
        subscription.isActive ? "Subscription paused" : "Subscription resumed",
      );
      onUpdate();
    } catch (error) {
      toast.error("Failed to update subscription");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteSubscription(subscription.id);
      toast.success("Subscription removed");
      onUpdate();
    } catch (error) {
      toast.error("Failed to remove subscription");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSetReminder = async () => {
    if (!("Notification" in window)) {
      toast.info("Browser notifications not supported");
      return;
    }

    if (Notification.permission === "denied") {
      toast.error("Notifications are blocked. Enable them in your browser settings.");
      return;
    }

    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notification permission was denied. Reminder not set.");
        return;
      }
    }

    const reminderDate = startOfDay(subscription.nextRenewalDate);
    const daysUntil = differenceInDays(reminderDate, startOfDay(new Date()));

    // Browsers clamp setTimeout delays to ~2^31 ms (~24.8 days): longer or
    // negative delays overflow and fire immediately, so never schedule one.
    if (daysUntil <= 0) {
      toast.info("This renewal is due today or already overdue.");
      return;
    }
    if (daysUntil > 24) {
      toast.info("Reminders can only be set up to 24 days before renewal.");
      return;
    }

    // Prefer a service-worker notification so the reminder survives tab
    // closes, falling back to a short in-page timer.
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration?.showNotification) {
        await registration.showNotification("Subscription Renewal Reminder", {
          body: `${subscription.name} renews on ${format(reminderDate, "MMM d, yyyy")}.`,
          icon: "/vite.svg",
          tag: `renewal-${subscription.id}`,
        });
        toast.success("Reminder set for renewal");
        return;
      }
    } catch {
      // Fall back to the in-page timer below.
    }

    setTimeout(
      () => {
        new Notification("Subscription Renewal Reminder", {
          body: `${subscription.name} renews on ${format(reminderDate, "MMM d, yyyy")}.`,
          icon: "/vite.svg",
        });
      },
      differenceInMilliseconds(reminderDate, new Date()),
    );
    toast.success("Reminder set for renewal");
  };

  const frequencyLabel =
    subscription.frequency === "monthly"
      ? "Monthly"
      : subscription.frequency === "yearly"
        ? "Yearly"
        : "Weekly";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="group relative"
    >
      <Card className="border-indigo-900/40 bg-indigo-950/20 hover:bg-indigo-950/40 transition-all duration-300 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CardTitle className="text-white text-base font-bold truncate">
                  {subscription.name}
                </CardTitle>
                <Badge
                  variant="secondary"
                  className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-[10px] uppercase tracking-wider font-bold"
                >
                  {subscription.category}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="font-medium">{frequencyLabel}</span>
                <span className="text-slate-600">|</span>
                <span>${subscription.amount.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {isUrgent && (
                <Badge
                  variant="destructive"
                  className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px] uppercase tracking-wider font-bold animate-pulse"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {daysUntilRenewal === 0 ? "Today" : `${daysUntilRenewal}d`}
                </Badge>
              )}
              {isOverdue && (
                <Badge
                  variant="destructive"
                  className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px] uppercase tracking-wider font-bold"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Overdue
                </Badge>
              )}
              {!isUrgent && !isOverdue && (
                <Badge
                  variant="outline"
                  className="border-slate-700 text-slate-400 text-[10px] uppercase tracking-wider font-bold"
                >
                  {daysUntilRenewal === 0
                    ? "Today"
                    : `${daysUntilRenewal}d left`}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                <span className="font-medium">Next Renewal</span>
              </div>
              <span className="text-slate-300 font-mono text-xs">
                {format(subscription.nextRenewalDate, "MMM d, yyyy")}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 uppercase tracking-wider font-bold text-[10px]">
                  Annual Cost
                </span>
                <span className="text-indigo-400 font-mono font-bold">
                  $
                  {(
                    subscription.amount *
                    (subscription.frequency === "monthly"
                      ? 12
                      : subscription.frequency === "yearly"
                        ? 1
                        : 52)
                  ).toFixed(2)}
                </span>
              </div>
              <Progress
                value={
                  subscription.frequency === "monthly"
                    ? 100 / 12
                    : subscription.frequency === "yearly"
                      ? 100
                      : 100 / 52
                }
                className="h-1.5 bg-slate-800"
              >
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{
                    width: `${subscription.frequency === "monthly" ? 100 / 12 : subscription.frequency === "yearly" ? 100 : 100 / 52}%`,
                  }}
                />
              </Progress>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white font-semibold uppercase tracking-wider rounded-lg"
                onClick={handleToggleActive}
                disabled={isUpdating}
              >
                <RefreshCw className="h-3 w-3 mr-1.5" />
                {subscription.isActive ? "Pause" : "Resume"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white font-semibold uppercase tracking-wider rounded-lg"
                onClick={handleSetReminder}
              >
                <Calendar className="h-3 w-3 mr-1.5" />
                Remind
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
