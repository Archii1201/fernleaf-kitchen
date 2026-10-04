'use client';

import { useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Feedback } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton, SkeletonRows } from '../../components/ui/Skeleton';
import { Table, type Column } from '../../components/ui/Table';
import { WEEKDAYS } from '../../lib/api/companies';
import {
  addHoliday,
  cutoffPreview,
  getSettings,
  listHolidays,
  removeHoliday,
  updateSettings,
  type CutoffPreview,
  type Holiday,
} from '../../lib/api/settings';
import { useAuth } from '../../lib/auth-context';
import { formatDate, formatDateTime, todayIso } from '../../lib/format';
import { useAction, useLoad } from '../../lib/use-load';

export default function SettingsPage() {
  const { can } = useAuth();

  // Preview tool state
  const [previewDate, setPreviewDate] = useState(() => todayIso());

  // Holiday Modal state
  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [deletingHoliday, setDeletingHoliday] = useState<Holiday | null>(null);

  // Data loading
  const {
    data: settingsData,
    loading: settingsLoading,
    error: settingsError,
    reload: reloadSettings,
  } = useLoad(() => getSettings(), []);

  const {
    data: holidaysData,
    loading: holidaysLoading,
    error: holidaysError,
    reload: reloadHolidays,
  } = useLoad(() => listHolidays(1), []);

  const {
    data: previewData,
    loading: previewLoading,
    error: previewError,
    reload: reloadPreview,
  } = useLoad<CutoffPreview>(
    () => cutoffPreview(previewDate),
    [previewDate],
  );

  const { run: runAction, busy: actionBusy, error: actionError, notice: actionNotice, setError: setActionError } = useAction();

  // Settings form state - tracks user edits; falls back to server data during render
  const [editedCutoffTime, setEditedCutoffTime] = useState<string | null>(null);
  const [editedCutoffWorkingDays, setEditedCutoffWorkingDays] = useState<number | null>(null);
  const [editedDeliveryGraceMinutes, setEditedDeliveryGraceMinutes] = useState<number | null>(null);
  const [editedWorkingDays, setEditedWorkingDays] = useState<string[] | null>(null);

  const cutoffTime = editedCutoffTime ?? settingsData?.cutoffTime ?? '18:00';
  const cutoffWorkingDays = editedCutoffWorkingDays ?? settingsData?.cutoffWorkingDays ?? 1;
  const deliveryGraceMinutes = editedDeliveryGraceMinutes ?? settingsData?.deliveryGraceMinutes ?? 15;
  const workingDays = editedWorkingDays ?? settingsData?.workingDays ?? [];

  const handleToggleWeekday = (day: string) => {
    const current = editedWorkingDays ?? settingsData?.workingDays ?? [];
    setEditedWorkingDays(
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    );
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const result = await runAction(
      () =>
        updateSettings({
          cutoffTime,
          cutoffWorkingDays: Number(cutoffWorkingDays),
          deliveryGraceMinutes: Number(deliveryGraceMinutes),
          workingDays,
        }),
      'Kitchen settings updated successfully!',
    );
    if (result) {
      setEditedCutoffTime(null);
      setEditedCutoffWorkingDays(null);
      setEditedDeliveryGraceMinutes(null);
      setEditedWorkingDays(null);
      reloadSettings();
      reloadPreview();
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayDate) return;
    setActionError(null);
    const result = await runAction(
      () =>
        addHoliday({
          date: holidayDate,
          name: holidayName.trim() || undefined,
        }),
      'Holiday added to kitchen calendar',
    );
    if (result) {
      setShowAddHoliday(false);
      setHolidayDate('');
      setHolidayName('');
      reloadHolidays();
      reloadPreview();
    }
  };

  const handleRemoveHoliday = async () => {
    if (!deletingHoliday) return;
    setActionError(null);
    const ok = await runAction(
      () => removeHoliday(deletingHoliday.id),
      'Holiday removed from kitchen calendar',
    );
    if (ok !== undefined) {
      setDeletingHoliday(null);
      reloadHolidays();
      reloadPreview();
    }
  };

  const holidayColumns: Column<Holiday>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (h) => (
        <span className="font-semibold text-[var(--navy)]">{formatDate(h.date)}</span>
      ),
    },
    {
      key: 'name',
      header: 'Holiday Name',
      render: (h) => (
        <span className="text-[var(--text)]">{h.name || 'Official Kitchen Holiday'}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (h) =>
        can('settings.manage') ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
            onClick={() => setDeletingHoliday(h)}
          >
            Remove
          </Button>
        ) : null,
    },
  ];

  const holidays = holidaysData?.data ?? [];

  return (
    <main className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Administration"
        title="Kitchen Settings"
        description="Configure ordering cutoff rules, operating schedules, and official kitchen holidays."
        actions={
          <Button
            variant="subtle"
            icon="refresh"
            onClick={() => {
              reloadSettings();
              reloadHolidays();
              reloadPreview();
            }}
            disabled={settingsLoading || actionBusy}
          >
            Refresh
          </Button>
        }
      />

      <Feedback error={actionError} notice={actionNotice} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Rules & Cutoff Configuration */}
        <div className="space-y-6 lg:col-span-7">
          <Card className="bg-white p-6">
            <CardHeader
              title="Cutoff & Schedule Configuration"
              eyebrow="Operational Rules"
            />

            {settingsError ? (
              <ErrorState message={settingsError} onRetry={reloadSettings} />
            ) : settingsLoading ? (
              <SkeletonRows rows={5} />
            ) : (
              <form onSubmit={handleSaveSettings} className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Daily Cutoff Time"
                    type="time"
                    value={cutoffTime}
                    onChange={(e) => setEditedCutoffTime(e.target.value)}
                    hint="Local time when orders lock"
                    disabled={!can('settings.manage')}
                    required
                  />

                  <Input
                    label="Cutoff Lead Time (Working Days)"
                    type="number"
                    min="0"
                    max={settingsData?.maxCutoffWorkingDays ?? 14}
                    value={cutoffWorkingDays}
                    onChange={(e) => setEditedCutoffWorkingDays(Number(e.target.value))}
                    hint="Number of working days prior to delivery"
                    disabled={!can('settings.manage')}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Delivery Grace Period (Minutes)"
                    type="number"
                    min="0"
                    max="120"
                    value={deliveryGraceMinutes}
                    onChange={(e) => setEditedDeliveryGraceMinutes(Number(e.target.value))}
                    hint="Buffer after scheduled delivery time"
                    disabled={!can('settings.manage')}
                  />

                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-3 text-xs">
                    <span className="font-semibold text-[var(--navy)]">Kitchen Timezone:</span>
                    <p className="mt-1 font-mono text-sm text-[var(--text)]">
                      {settingsData?.timeZone ?? 'Asia/Kolkata'}
                    </p>
                    <p className="mt-1 text-[var(--muted)]">
                      Last updated {formatDateTime(settingsData?.updatedAt)}
                    </p>
                  </div>
                </div>

                {/* Working Days Checklist */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--navy)] mb-2">
                    Kitchen Working Days
                  </label>
                  <p className="text-xs text-[var(--muted)] mb-3">
                    Orders cannot be scheduled on non-working days. Cutoff leads count working days only.
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {WEEKDAYS.map((day) => {
                      const isChecked = workingDays.includes(day);
                      return (
                        <label
                          key={day}
                          className={`flex items-center gap-2 rounded-[var(--radius-sm)] border p-2.5 text-xs font-semibold cursor-pointer transition-colors ${
                            isChecked
                              ? 'border-[var(--orange-deep)] bg-[var(--orange-soft)]/20 text-[var(--navy)]'
                              : 'border-[var(--border)] bg-[var(--ivory)] text-[var(--muted)] hover:bg-white'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!can('settings.manage')}
                            onChange={() => handleToggleWeekday(day)}
                            className="rounded accent-[var(--orange-deep)]"
                          />
                          <span>{day.slice(0, 3)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {can('settings.manage') && (
                  <div className="pt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      busy={actionBusy}
                    >
                      Save Configuration
                    </Button>
                  </div>
                )}
              </form>
            )}
          </Card>

          {/* Cutoff Preview Tool */}
          <Card className="bg-white p-6">
            <CardHeader
              title="Cutoff Preview Tool"
              eyebrow="Verification"
            />
            <p className="text-xs text-[var(--muted)] mb-4">
              Inspect how the configured lead time, working days, and holidays resolve for any delivery date.
            </p>

            <div className="mb-4 max-w-xs">
              <Input
                label="Target Delivery Date"
                type="date"
                value={previewDate}
                onChange={(e) => setPreviewDate(e.target.value)}
              />
            </div>

            {previewError ? (
              <ErrorState message={previewError} onRetry={reloadPreview} />
            ) : previewLoading ? (
              <Skeleton className="h-32" />
            ) : previewData ? (
              <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)]/70 pb-3">
                  <div>
                    <span className="eyebrow text-xs text-[var(--muted)]">Resolved Cutoff</span>
                    <p className="serif text-xl font-bold text-[var(--navy)]">
                      {formatDateTime(previewData.cutoffAt)}
                    </p>
                  </div>
                  {previewData.hasPassed ? (
                    <Badge tone="danger">Cutoff Has Passed</Badge>
                  ) : (
                    <Badge tone="success">Ordering Is Open</Badge>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div>
                    <span className="text-[var(--muted)] font-semibold">Delivery Date:</span>
                    <p className="font-medium text-[var(--navy)]">{formatDate(previewData.deliveryDate)}</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] font-semibold">Cutoff Date:</span>
                    <p className="font-medium text-[var(--navy)]">{formatDate(previewData.cutoffDate)}</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] font-semibold">Lead Time:</span>
                    <p className="font-medium text-[var(--navy)]">{previewData.cutoffWorkingDays} working day(s)</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] font-semibold">Timezone:</span>
                    <p className="font-medium text-[var(--navy)]">{previewData.timeZone}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        {/* Right Column: Kitchen Holidays Management */}
        <div className="space-y-6 lg:col-span-5">
          <Card className="bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="eyebrow">Calendar</p>
                <h2 className="serif text-2xl font-bold text-[var(--navy)]">Kitchen Holidays</h2>
              </div>
              {can('settings.manage') && (
                <Button
                  size="sm"
                  variant="primary"
                  icon="plus"
                  onClick={() => setShowAddHoliday(true)}
                >
                  Add Holiday
                </Button>
              )}
            </div>

            <p className="text-xs text-[var(--muted)] mb-4">
              Holidays act as non-working days for all cutoff lead calculations and delivery blackouts.
            </p>

            {holidaysError ? (
              <ErrorState message={holidaysError} onRetry={reloadHolidays} />
            ) : holidaysLoading ? (
              <SkeletonRows rows={5} />
            ) : holidays.length === 0 ? (
              <EmptyState
                icon="settings"
                title="No holidays scheduled"
                hint="Kitchen operations run standard working days without blackout exceptions."
              />
            ) : (
              <Table
                columns={holidayColumns}
                rows={holidays}
                rowKey={(h) => h.id}
              />
            )}
          </Card>
        </div>
      </div>

      {/* Add Holiday Modal */}
      <Modal
        open={showAddHoliday}
        title="Schedule Kitchen Holiday"
        onClose={() => setShowAddHoliday(false)}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowAddHoliday(false)}
              disabled={actionBusy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={actionBusy}
              onClick={handleAddHoliday}
              disabled={!holidayDate || actionBusy}
            >
              Save Holiday
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddHoliday} className="space-y-4">
          <Input
            label="Holiday Date"
            type="date"
            value={holidayDate}
            onChange={(e) => setHolidayDate(e.target.value)}
            required
          />
          <Input
            label="Holiday Name (Optional)"
            placeholder="e.g. Diwali, Republic Day, Annual Deep Clean"
            value={holidayName}
            onChange={(e) => setHolidayName(e.target.value)}
          />
        </form>
      </Modal>

      {/* Confirm Remove Holiday Dialog */}
      <ConfirmDialog
        open={Boolean(deletingHoliday)}
        title="Remove Holiday"
        message={
          <>
            Remove holiday <strong className="text-[var(--navy)]">{formatDate(deletingHoliday?.date)}</strong> (
            {deletingHoliday?.name || 'Unnamed'}) from the kitchen calendar?
          </>
        }
        confirmLabel="Remove"
        tone="danger"
        busy={actionBusy}
        onConfirm={handleRemoveHoliday}
        onCancel={() => setDeletingHoliday(null)}
      />
    </main>
  );
}
