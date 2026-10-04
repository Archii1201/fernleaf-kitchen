'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardHeader } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { EmptyState, ErrorState, Feedback } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { OrderCombinationEditor } from '../../../components/orders/OrderCombinationEditor';
import {
  createOrder,
  placeOrder,
  quoteOrder,
  type CreateOrderInput,
  type OrderLineInput,
  type OrderQuote,
} from '../../../lib/api/orders';
import { listCompanies } from '../../../lib/api/companies';
import { listEmployees, type Employee } from '../../../lib/api/employees';
import { listRefs } from '../../../lib/api/catalogue';
import type { CombinationInput } from '../../../lib/order-combinations';
import { previewMenu, type MenuPreview } from '../../../lib/api/menu';
import { useLoad, useAction } from '../../../lib/use-load';
import { formatDate, formatDateTime, rupees, todayIso } from '../../../lib/format';

type Step = 1 | 2 | 3 | 4 | 5;

interface SelectedItem {
  dishId: string;
  categoryId?: string;
  name: string;
  sku: string;
  quantity: number;
  notes: string;
  combinations: CombinationInput[];
}

export default function NewOrderPage() {
  const router = useRouter();
  const action = useAction();

  const [step, setStep] = useState<Step>(1);

  // Step 1: Customer & Attendee
  const [companyId, setCompanyId] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  // Step 2: Delivery Details
  const [deliveryDate, setDeliveryDate] = useState(() => {
    // Tomorrow by default
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [userDeliveryTime, setUserDeliveryTime] = useState<string | null>(null);
  const [userAddressId, setUserAddressId] = useState<string | null>(null);
  const [userPackagingTypeId, setUserPackagingTypeId] = useState<string | null>(null);
  const [customerNotes, setCustomerNotes] = useState('');

  // Step 3 & 4: Dishes & Customizations
  const [items, setItems] = useState<SelectedItem[]>([]);

  // Step 5: Quote state
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quantitiesReady = items.every((item) => item.combinations.length > 0 &&
    item.combinations.every((combination) => Number.isInteger(combination.quantity) && combination.quantity > 0) &&
    item.combinations.reduce((sum, combination) => sum + combination.quantity, 0) === item.quantity);

  // Fetch Companies
  const { data: companiesData } = useLoad(
    () => listCompanies({ limit: 100 }),
    ['new-order-companies'],
  );
  const companies = companiesData?.data ?? [];

  // Fetch Employees for Selected Company
  const { data: employeesData, loading: employeesLoading } = useLoad(
    () =>
      companyId
        ? listEmployees({ companyId, limit: 100 })
        : Promise.resolve({ data: [] as Employee[], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } }),
    ['new-order-employees', companyId],
  );
  const employees = employeesData?.data ?? [];

  // Selected Employee object
  const selectedEmployee = employees.find((e) => e.id === employeeId);
  // Selected Company object
  const selectedCompany = companies.find((c) => c.id === companyId);

  // Derived defaults for delivery
  const defaultAddressId =
    selectedEmployee?.defaultAddress?.id ??
    selectedCompany?.deliveryDefaults?.defaultAddressId ??
    selectedCompany?.addresses?.[0]?.id ??
    '';
  const defaultDeliveryTime = selectedCompany?.deliveryDefaults?.defaultDeliveryTime ?? '12:30';
  const defaultPackagingTypeId = selectedCompany?.deliveryDefaults?.packagingType?.id ?? '';

  const addressId = userAddressId ?? defaultAddressId;
  const deliveryTime = userDeliveryTime ?? defaultDeliveryTime;
  const packagingTypeId = userPackagingTypeId ?? defaultPackagingTypeId;

  // Fetch Packaging Types
  const { data: packagingTypes } = useLoad(
    () => listRefs('packaging-types'),
    ['packaging-types'],
  );

  // Fetch Available Menu for Company/Employee
  const { data: menuPreview, loading: menuLoading } = useLoad(
    () =>
      companyId
        ? previewMenu({ companyId, employeeId: employeeId || undefined })
        : Promise.resolve(null as MenuPreview | null),
    ['new-order-menu', companyId, employeeId],
  );

  // Dish Selection Helpers
  const handleToggleDish = (dishId: string, dishName: string, sku: string, categoryId?: string) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.dishId === dishId);
      if (existing) {
        return prev.filter((i) => i.dishId !== dishId);
      }
      return [
        ...prev,
        {
          dishId,
          categoryId,
          name: dishName,
          sku,
          quantity: 1,
          notes: '',
          combinations: [{ quantity: 1, selections: [] }],
        },
      ];
    });
  };

  const handleUpdateQuantity = (dishId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((item) => {
          if (item.dishId === dishId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? {
              ...item,
              quantity: nextQty,
              combinations: item.combinations.length === 1
                ? [{ ...item.combinations[0], quantity: nextQty }]
                : item.combinations,
            } : null;
          }
          return item;
        })
        .filter(Boolean) as SelectedItem[],
    );
  };

  // Build the Authoritative Input
  const buildOrderInput = (): CreateOrderInput => {
    const lines: OrderLineInput[] = items.map((item) => {
      return {
        dishId: item.dishId,
        categoryId: item.categoryId,
        quantity: item.quantity,
        notes: item.notes.trim() || undefined,
        combinations: item.combinations,
      };
    });

    return {
      customerEmployeeId: employeeId,
      deliveryDate,
      deliveryTime: deliveryTime || undefined,
      deliveryAddressId: addressId || undefined,
      packagingTypeId: packagingTypeId || undefined,
      customerNotes: customerNotes.trim() || undefined,
      lines,
    };
  };

  // Step 5: Fetch Quote
  const fetchAuthoritativeQuote = async () => {
    setQuoteLoading(true);
    setQuote(null);
    setQuoteError(null);
    try {
      const payload = buildOrderInput();
      const result = await quoteOrder(payload);
      setQuote(result);
    } catch (err: unknown) {
      setQuoteError(err instanceof Error ? err.message : 'Unable to calculate quote');
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  };

  // Submit Order
  const handleSubmitOrder = async (placeImmediately: boolean) => {
    const payload = buildOrderInput();
    const result = await action.run(async () => {
      const created = await createOrder(payload);
      if (placeImmediately) {
        await placeOrder(created.id);
      }
      return created;
    }, placeImmediately ? 'Order placed successfully!' : 'Order drafted successfully!');

    if (result) {
      router.push(`/orders/${result.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Order Creation"
        title="New Order"
        description="Step-by-step corporate order builder. All pricing, tier rates, and delivery cutoffs are authoritatively evaluated by the kitchen server."
        actions={
          <Button variant="ghost" onClick={() => router.push('/orders')}>
            Back to Orders
          </Button>
        }
      />

      {/* STEP INDICATOR */}
      <nav aria-label="Order steps" className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
        <ol className="flex flex-wrap items-center justify-between gap-3 text-sm">
          {[
            { num: 1, label: 'Client & Attendee' },
            { num: 2, label: 'Delivery Details' },
            { num: 3, label: 'Menu Selection' },
            { num: 4, label: 'Customizations' },
            { num: 5, label: 'Review & Authoritative Quote' },
          ].map((s) => (
            <li
              key={s.num}
              className={`flex items-center gap-2 font-medium ${
                step === s.num
                  ? 'text-[var(--orange-deep)] font-semibold'
                  : step > s.num
                    ? 'text-[var(--navy)]'
                    : 'text-[var(--muted)]'
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  step === s.num
                    ? 'bg-[var(--orange)] text-[var(--navy-dark)]'
                    : step > s.num
                      ? 'bg-[var(--navy)] text-white'
                      : 'bg-[var(--cream-soft)] text-[var(--muted)]'
                }`}
              >
                {step > s.num ? '✓' : s.num}
              </span>
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
      </nav>

      <Feedback error={action.error} notice={action.notice} />

      {/* ==================== STEP 1: COMPANY & EMPLOYEE ==================== */}
      {step === 1 && (
        <Card>
          <CardHeader
            eyebrow="Step 1 of 5"
            title="Select Client Company & Attendee"
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <Select
              label="Client Company"
              value={companyId}
              required
              onChange={(e) => {
                setCompanyId(e.target.value);
                setEmployeeId('');
                setItems([]);
              }}
            >
              <option value="">Choose organization…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.priceTier ? `(${c.priceTier.name})` : ''}
                </option>
              ))}
            </Select>

            <Select
              label="Customer Employee"
              value={employeeId}
              disabled={!companyId || employeesLoading}
              required
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setItems([]);
              }}
            >
              <option value="">
                {employeesLoading ? 'Loading employees…' : 'Choose employee…'}
              </option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.email})
                </option>
              ))}
            </Select>
          </div>

          {selectedEmployee ? (
            <div className="mt-6 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="serif text-lg font-semibold text-[var(--navy)]">
                    {selectedEmployee.fullName}
                  </h4>
                  <p className="text-xs text-[var(--muted)]">
                    {selectedEmployee.email} {selectedEmployee.phone ? `· ${selectedEmployee.phone}` : ''}
                  </p>
                </div>
                {selectedCompany?.priceTier ? (
                  <Badge tone="orange">Tier: {selectedCompany.priceTier.name}</Badge>
                ) : null}
              </div>

              {selectedEmployee.allergens.length > 0 || selectedEmployee.dietaryTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedEmployee.allergens.map((a) => (
                    <Badge key={a.id} tone="danger">
                      Allergen: {a.name}
                    </Badge>
                  ))}
                  {selectedEmployee.dietaryTags.map((d) => (
                    <Badge key={d.id} tone="navy">
                      Diet: {d.name}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {selectedEmployee.allergyNotes ? (
                <p className="text-xs text-[var(--danger)]">
                  <strong>Allergy notes:</strong> {selectedEmployee.allergyNotes}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex justify-end">
            <Button
              variant="primary"
              disabled={!companyId || !employeeId}
              onClick={() => setStep(2)}
            >
              Continue to Delivery Details
            </Button>
          </div>
        </Card>
      )}

      {/* ==================== STEP 2: DELIVERY DETAILS ==================== */}
      {step === 2 && (
        <Card>
          <CardHeader eyebrow="Step 2 of 5" title="Delivery Schedule & Address" />

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold text-[var(--navy)]">Delivery Date</span>
              <input
                type="date"
                value={deliveryDate}
                required
                min={todayIso()}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--orange)]"
              />
              <span className="text-xs text-[var(--muted)]">
                Selected: {formatDate(deliveryDate)}
              </span>
            </label>

            <Input
              label="Delivery Time (Kitchen Clock)"
              type="time"
              value={deliveryTime}
              required
              onChange={(e) => setUserDeliveryTime(e.target.value)}
              hint="Scheduled arrival time at corporate location"
            />

            <Select
              label="Delivery Address"
              value={addressId}
              required
              onChange={(e) => setUserAddressId(e.target.value)}
            >
              <option value="">Select corporate address…</option>
              {selectedCompany?.addresses?.map((addr) => (
                <option key={addr.id} value={addr.id}>
                  {addr.label}: {addr.line1}, {addr.city}
                </option>
              ))}
            </Select>

            <Select
              label="Packaging Type"
              value={packagingTypeId}
              onChange={(e) => setUserPackagingTypeId(e.target.value)}
            >
              <option value="">Standard Kitchen Packaging</option>
              {packagingTypes?.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} ({pkg.code})
                </option>
              ))}
            </Select>

            <div className="sm:col-span-2">
              <Textarea
                label="Kitchen & Delivery Instructions"
                placeholder="Gate code, reception drop-off instructions, or dietary warnings…"
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              variant="primary"
              disabled={!deliveryDate || !deliveryTime || !addressId}
              onClick={() => setStep(3)}
            >
              Continue to Menu Selection
            </Button>
          </div>
        </Card>
      )}

      {/* ==================== STEP 3: MENU SELECTION ==================== */}
      {step === 3 && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              eyebrow="Step 3 of 5"
              title="Select Dishes from Authorized Menu"
              action={
                <Badge tone="orange">
                  {items.reduce((acc, i) => acc + i.quantity, 0)} items selected
                </Badge>
              }
            />

            {menuLoading ? (
              <SkeletonRows rows={6} />
            ) : !menuPreview || menuPreview.categories.length === 0 ? (
              <EmptyState
                icon="menu"
                title="No dishes visible for this client"
                hint="Verify menu categories and visibility permissions for this company."
              />
            ) : (
              <div className="space-y-8">
                {menuPreview.categories.map((category) => (
                  <div key={category.id} className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                      <h3 className="serif text-xl font-semibold text-[var(--navy)]">
                        {category.name}
                      </h3>
                      {category.isSecret ? (
                        <Badge tone="warning">Secret</Badge>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {category.dishes.map((dish) => {
                        const selected = items.find((i) => i.dishId === dish.id);
                        return (
                          <div
                            key={dish.id}
                            className={`flex flex-col justify-between rounded-[var(--radius-sm)] border p-3.5 transition-all ${
                              selected
                                ? 'border-[var(--orange)] bg-[var(--orange-soft)]/15 shadow-sm'
                                : 'border-[var(--border)] bg-white hover:border-[var(--muted)]'
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-mono text-[0.7rem] uppercase text-[var(--muted)]">
                                  {dish.sku}
                                </span>
                                <span className="font-semibold text-sm text-[var(--orange-deep)]">
                                  {rupees(dish.priceCents)}
                                </span>
                              </div>
                              <h4 className="serif mt-1 font-semibold text-[var(--navy)]">
                                {dish.name}
                              </h4>
                              {dish.description ? (
                                <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                                  {dish.description}
                                </p>
                              ) : null}
                            </div>

                            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2.5">
                              {selected ? (
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleUpdateQuantity(dish.id, -1)}
                                    aria-label="Decrease quantity"
                                  >
                                    -
                                  </Button>
                                  <span className="font-semibold text-sm text-[var(--navy)] w-6 text-center">
                                    {selected.quantity}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleUpdateQuantity(dish.id, 1)}
                                    aria-label="Increase quantity"
                                  >
                                    +
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-[var(--muted)]">Not selected</span>
                              )}

                              <Button
                                variant={selected ? 'danger' : 'subtle'}
                                size="sm"
                                onClick={() =>
                                  handleToggleDish(dish.id, dish.name, dish.sku, category.id)
                                }
                              >
                                {selected ? 'Remove' : 'Select'}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-between border-t border-[var(--border)] pt-4">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                variant="primary"
                disabled={items.length === 0}
                onClick={() => setStep(4)}
              >
                Continue to Customizations ({items.length} items)
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ==================== STEP 4: CUSTOMIZATIONS & OPTIONS ==================== */}
      {step === 4 && (
        <Card>
          <CardHeader
            eyebrow="Step 4 of 5"
            title="Options & Dish Combinations"
          />

          {items.length === 0 ? (
            <EmptyState
              icon="menu"
              title="No dishes selected"
              action={
                <Button variant="primary" onClick={() => setStep(3)}>
                  Back to Dish Selection
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              {items.map((item) => {
                return (
                  <div
                    key={item.dishId}
                    className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-4 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2">
                      <div>
                        <span className="text-xs font-mono uppercase text-[var(--muted)]">{item.sku}</span>
                        <h4 className="serif text-lg font-semibold text-[var(--navy)]">
                          {item.name} (Qty: {item.quantity})
                        </h4>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUpdateQuantity(item.dishId, -1)}
                        >
                          -
                        </Button>
                        <span className="font-semibold text-sm px-2">{item.quantity}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUpdateQuantity(item.dishId, 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>

                    <OrderCombinationEditor
                      dishId={item.dishId}
                      quantity={item.quantity}
                      combinations={item.combinations}
                      onChange={(combinations) => setItems((prev) => prev.map((current) =>
                        current.dishId === item.dishId ? { ...current, combinations } : current))}
                    />

                    <Input
                      label="Item Preparation Notes (Optional)"
                      placeholder="e.g. dressing on the side, extra spicy…"
                      value={item.notes}
                      onChange={(e) => {
                        const val = e.target.value;
                        setItems((prev) =>
                          prev.map((i) => (i.dishId === item.dishId ? { ...i, notes: val } : i)),
                        );
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex justify-between border-t border-[var(--border)] pt-4">
            <Button variant="ghost" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button
              variant="primary"
              disabled={items.length === 0 || !quantitiesReady}
              onClick={() => {
                setStep(5);
                void fetchAuthoritativeQuote();
              }}
            >
              Review & Calculate Quote
            </Button>
          </div>
        </Card>
      )}

      {/* ==================== STEP 5: REVIEW & AUTHORITATIVE QUOTE ==================== */}
      {step === 5 && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              eyebrow="Step 5 of 5"
              title="Authoritative Server Quote & Cutoff Verification"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  busy={quoteLoading}
                  onClick={() => void fetchAuthoritativeQuote()}
                >
                  Recalculate Quote
                </Button>
              }
            />

            {quoteLoading ? (
              <SkeletonRows rows={6} />
            ) : quoteError ? (
              <ErrorState
                message={`Backend Validation Error: ${quoteError}`}
                onRetry={() => void fetchAuthoritativeQuote()}
              />
            ) : !quote ? (
              <EmptyState
                icon="orders"
                title="No quote received"
                hint="Please click recalculate to generate an authoritative order quote from the server."
                action={
                  <Button variant="primary" onClick={() => void fetchAuthoritativeQuote()}>
                    Calculate Quote
                  </Button>
                }
              />
            ) : (
              <div className="space-y-6">
                {/* CUTOFF STATUS BANNER */}
                {quote.cutoff.hasPassed ? (
                  <div className="rounded-[var(--radius-sm)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4 text-[var(--danger)]">
                    <div className="flex items-start gap-3">
                      <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
                      <div>
                        <h4 className="font-semibold text-sm">Kitchen Cutoff Has Passed!</h4>
                        <p className="mt-1 text-xs">
                          The official preparation cutoff for <strong>{formatDate(quote.cutoff.deliveryDate)}</strong> expired on{' '}
                          <strong>{formatDateTime(quote.cutoff.cutoffAt)}</strong>. Placing this order may require kitchen manager authorization or be rejected.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[var(--radius-sm)] border border-[var(--success)]/40 bg-[var(--success-soft)] p-4 text-[var(--success)]">
                    <div className="flex items-start gap-3">
                      <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0" />
                      <div>
                        <h4 className="font-semibold text-sm">Within Kitchen Cutoff Window</h4>
                        <p className="mt-1 text-xs">
                          Order cutoff for {formatDate(quote.cutoff.deliveryDate)} is on{' '}
                          <strong>{formatDateTime(quote.cutoff.cutoffAt)}</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* DETAILS SUMMARY GRID */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-3.5 text-xs space-y-1">
                    <p className="text-[var(--muted)] font-semibold uppercase">Client & Attendee</p>
                    <p className="text-sm font-semibold text-[var(--navy)]">{quote.employee.fullName}</p>
                    <p className="text-[var(--muted)]">{quote.company.name}</p>
                    <p className="text-[var(--muted)]">{quote.employee.email}</p>
                  </div>

                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-3.5 text-xs space-y-1">
                    <p className="text-[var(--muted)] font-semibold uppercase">Delivery Schedule</p>
                    <p className="text-sm font-semibold text-[var(--navy)]">
                      {formatDate(quote.delivery.date)} at {quote.delivery.time}
                    </p>
                    <p className="text-[var(--muted)]">
                      Address: {quote.delivery.addressLabel ?? 'Selected Address'}
                    </p>
                    <p className="text-[var(--muted)]">
                      Packaging: {quote.delivery.packagingTypeName ?? 'Standard Packaging'}
                    </p>
                  </div>

                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-3.5 text-xs space-y-1">
                    <p className="text-[var(--muted)] font-semibold uppercase">Pricing Schedule</p>
                    <p className="text-sm font-semibold text-[var(--orange-deep)]">{quote.priceTier.name}</p>
                    <p className="text-[var(--muted)]">
                      Kitchen buffer: {quote.delivery.leaveKitchenMinutes} minutes
                    </p>
                  </div>
                </div>

                {/* AUTHORITATIVE LINE ITEMS TABLE */}
                <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border)]">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--ivory)]">
                        <th className="eyebrow px-4 py-3">Dish Item</th>
                        <th className="eyebrow px-4 py-3">Qty</th>
                        <th className="eyebrow px-4 py-3">Server Unit Price</th>
                        <th className="eyebrow px-4 py-3 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.lines.map((line) => (
                        <tr key={line.dishId} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs uppercase text-[var(--muted)]">{line.sku}</span>
                            <p className="font-medium text-[var(--navy)]">{line.name}</p>
                            {line.combinations.map((combination, index) => (
                              <p key={combination.signature} className="mt-1 text-xs text-[var(--muted)]">
                                Combination {index + 1}: {combination.quantity} × {rupees(combination.unitPriceCents)}
                                {' '}= {rupees(combination.totalCents)}
                                {' '}({combination.options.map((option) => option.optionName).join(', ') || 'Standard'})
                              </p>
                            ))}
                          </td>
                          <td className="px-4 py-3 font-semibold">{line.quantity}</td>
                          <td className="px-4 py-3 text-[var(--muted)]">{rupees(line.unitPriceCents)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[var(--navy)]">
                            {rupees(line.lineTotalCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* TOTALS DISPLAY */}
                <div className="flex justify-end">
                  <div className="w-full max-w-xs space-y-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-4 text-right">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--muted)]">Subtotal:</span>
                      <span className="font-medium text-[var(--navy)]">{rupees(quote.subtotalCents)}</span>
                    </div>
                    <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base">
                      <span className="serif font-semibold text-[var(--navy)]">Total:</span>
                      <span className="serif text-2xl font-bold text-[var(--orange-deep)]">
                        {rupees(quote.totalCents)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
              <Button variant="ghost" onClick={() => setStep(4)}>
                Back to Customizations
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  busy={action.busy}
                  disabled={!quote}
                  onClick={() => handleSubmitOrder(false)}
                >
                  Save as Draft
                </Button>
                <Button
                  variant="primary"
                  busy={action.busy}
                  disabled={!quote}
                  onClick={() => handleSubmitOrder(true)}
                >
                  Create & Place Order
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
