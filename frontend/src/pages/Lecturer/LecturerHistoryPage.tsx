import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeftRight,
  ClipboardList,
  Clock3,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import bookingService from '@/services/booking.service';
import transferService from '@/services/transfer.service';
import { PERMISSIONS } from '@/utils/permissions';
import LecturerBookingHistoryPage from './LecturerBookingHistoryPage';
import LecturerIncomingTransfersPage from './LecturerIncomingTransfersPage';
import AccessLogPage from '../Admin/AccessLogPage';

type HistoryTab = 'booking-history' | 'incoming-transfers' | 'access-audit';

const DEFAULT_HISTORY_TAB: HistoryTab = 'booking-history';

const TAB_ALIASES: Record<string, HistoryTab> = {
  booking: 'booking-history',
  'booking-history': 'booking-history',
  transfer: 'incoming-transfers',
  request: 'incoming-transfers',
  requests: 'incoming-transfers',
  'transfer-request': 'incoming-transfers',
  'transfer-requests': 'incoming-transfers',
  transfers: 'incoming-transfers',
  incoming: 'incoming-transfers',
  'incoming-transfer': 'incoming-transfers',
  'incoming-transfers': 'incoming-transfers',
  access: 'access-audit',
  audit: 'access-audit',
  'access-audit': 'access-audit',
};

const resolveTab = (rawTab: string | null, availableTabs: HistoryTab[]): HistoryTab => {
  const normalized = String(rawTab || '').trim().toLowerCase();
  const mappedTab = TAB_ALIASES[normalized];

  if (mappedTab && availableTabs.includes(mappedTab)) {
    return mappedTab;
  }

  if (availableTabs.includes(DEFAULT_HISTORY_TAB)) {
    return DEFAULT_HISTORY_TAB;
  }

  return availableTabs[0];
};

type TabConfig = {
  value: HistoryTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isVisible: boolean;
};

type SummaryMetrics = {
  totalBookingsThisMonth: number;
  pendingBookings: number;
  pendingIncomingTransfers: number;
};

const getDateInputValue = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const LecturerHistoryPage: React.FC = () => {
  const { hasAnyPermission } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryMetrics>({
    totalBookingsThisMonth: 0,
    pendingBookings: 0,
    pendingIncomingTransfers: 0,
  });
  const [reloadSignals, setReloadSignals] = useState<Record<HistoryTab, number>>({
    'booking-history': 0,
    'incoming-transfers': 0,
    'access-audit': 0,
  });

  const canViewBookingHistory = hasAnyPermission([PERMISSIONS.BOOKINGS_READ]);
  const canViewIncomingTransfers = hasAnyPermission([PERMISSIONS.TRANSFERS_READ]);
  const canViewAccessAudit = hasAnyPermission([
    PERMISSIONS.ACCESS_LOGS_READ,
    PERMISSIONS.ACCESS_LOGS_MANAGE,
  ]);

  const availableTabs = useMemo<HistoryTab[]>(() => {
    const tabs: HistoryTab[] = [];

    if (canViewBookingHistory) tabs.push('booking-history');
    if (canViewIncomingTransfers) tabs.push('incoming-transfers');
    if (canViewAccessAudit) tabs.push('access-audit');

    return tabs;
  }, [canViewBookingHistory, canViewIncomingTransfers, canViewAccessAudit]);

  const tabConfigs = useMemo<TabConfig[]>(
    () => [
      {
        value: 'booking-history',
        label: 'Booking History',
        icon: ClipboardList,
        isVisible: canViewBookingHistory,
      },
      {
        value: 'incoming-transfers',
        label: 'Transfer History',
        icon: ArrowLeftRight,
        isVisible: canViewIncomingTransfers,
      },
      {
        value: 'access-audit',
        label: 'Access Audit',
        icon: ShieldCheck,
        isVisible: canViewAccessAudit,
      },
    ],
    [canViewBookingHistory, canViewIncomingTransfers, canViewAccessAudit],
  );

  const visibleTabConfigs = useMemo(
    () => tabConfigs.filter((tab) => tab.isVisible),
    [tabConfigs],
  );

  const tabsListGridClass = useMemo(() => {
    if (visibleTabConfigs.length <= 1) return 'sm:grid-cols-1';
    if (visibleTabConfigs.length === 2) return 'sm:grid-cols-2';
    return 'sm:grid-cols-3';
  }, [visibleTabConfigs.length]);

  const currentMonthLabel = useMemo(
    () => new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    [],
  );

  const activeTab = resolveTab(
    searchParams.get('tab'),
    availableTabs.length > 0 ? availableTabs : [DEFAULT_HISTORY_TAB],
  );

  const handleTabChange = (value: string) => {
    const nextTab = resolveTab(value, availableTabs);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', nextTab);
    setSearchParams(nextParams, { replace: true });
  };

  const loadSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const fromDate = getDateInputValue(monthStart);
      const toDate = getDateInputValue(monthEnd);

      const [monthlyBookings, pendingBookings, pendingIncomingTransfers] = await Promise.all([
        bookingService.getSelfBookings({ fromDate, toDate }),
        bookingService.getSelfBookings({ status: 'pending' }),
        transferService.getSelfIncomingTransfers({ status: 'pending' }),
      ]);

      setSummary({
        totalBookingsThisMonth: Array.isArray(monthlyBookings) ? monthlyBookings.length : 0,
        pendingBookings: Array.isArray(pendingBookings) ? pendingBookings.length : 0,
        pendingIncomingTransfers: Array.isArray(pendingIncomingTransfers)
          ? pendingIncomingTransfers.length
          : 0,
      });
    } catch (error: any) {
      toast({
        title: 'Summary unavailable',
        description: error?.message || 'Could not load booking and transfer summary metrics.',
        variant: 'destructive',
      });
    } finally {
      setSummaryLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handleReloadActiveTab = () => {
    setReloadSignals((prev) => ({
      ...prev,
      [activeTab]: prev[activeTab] + 1,
    }));
    void loadSummary();
  };

  if (availableTabs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        You do not have permission to view history data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Activity History</h1>

        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-lg border-slate-300 bg-white"
          onClick={handleReloadActiveTab}
          title="Reload current tab"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-600">Bookings This Month</p>
                <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
                  {summaryLoading ? '...' : summary.totalBookingsThisMonth.toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-slate-500">Based on your records in {currentMonthLabel}</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <ClipboardList className="h-5 w-5" />
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-600">Pending Booking Requests</p>
                <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
                  {summaryLoading ? '...' : summary.pendingBookings.toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-amber-700">Waiting for approval workflow</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Clock3 className="h-5 w-5" />
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-600">Pending Incoming Transfers</p>
                <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
                  {summaryLoading ? '...' : summary.pendingIncomingTransfers.toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-slate-500">Requires your accept or reject decision</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <ArrowLeftRight className="h-5 w-5" />
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-0">
        <TabsList
          className={`grid h-auto w-full grid-cols-1 gap-0 rounded-none border-b border-[#e2e8f0] bg-transparent p-0 ${tabsListGridClass}`}
        >
          {visibleTabConfigs.map((tab) => {
            const Icon = tab.icon;

            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-12 w-full min-w-0 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 text-[13px] font-semibold text-slate-500 data-[state=active]:border-[#c45a11] data-[state=active]:bg-transparent data-[state=active]:text-[#c45a11] data-[state=active]:shadow-none"
              >
                <span className="flex w-full items-center justify-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="truncate">{tab.label}</span>
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="rounded-b-2xl border border-t-0 border-[#e2e8f0] bg-white p-4 sm:p-5">
          {canViewBookingHistory ? (
            <TabsContent value="booking-history" className="mt-0">
              <LecturerBookingHistoryPage reloadSignal={reloadSignals['booking-history']} />
            </TabsContent>
          ) : null}

          {canViewIncomingTransfers ? (
            <TabsContent value="incoming-transfers" className="mt-0">
              <LecturerIncomingTransfersPage
                hideHeader
                showInlineReload={false}
                reloadSignal={reloadSignals['incoming-transfers']}
              />
            </TabsContent>
          ) : null}

          {canViewAccessAudit ? (
            <TabsContent value="access-audit" className="mt-0">
              <AccessLogPage
                hideHeader
                showInlineReload={false}
                reloadSignal={reloadSignals['access-audit']}
              />
            </TabsContent>
          ) : null}
        </div>
      </Tabs>
    </div>
  );
};

export default LecturerHistoryPage;
