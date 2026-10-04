import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { CLOCK, FixedClock } from '../src/kitchen/time/clock.js';
import { KitchenTime } from '../src/kitchen/time/kitchen-time.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Step 25: Complete Order Business Lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let kitchenTime: KitchenTime;
  let fixedClock: FixedClock;

  let adminCookie: string;
  let kitchenCookie: string;
  let dispatchCookie: string;
  let driverCookie: string;

  const SUFFIX = Date.now();
  const DELIVERY_DATE = '2030-05-15'; // Wednesday
  // Cutoff is resolved by the kitchen cutoff rules to Monday 2030-05-13T10:30:00.000Z
  const BEFORE_CUTOFF_TIME = new Date('2030-05-13T04:00:00.000Z'); // before cutoff (04:00 UTC < 10:30 UTC)
  const AFTER_CUTOFF_TIME = new Date('2030-05-13T12:00:00.000Z'); // after cutoff (12:00 UTC > 10:30 UTC)
  const DELIVERY_DAY_TIME = new Date('2030-05-15T06:00:00.000Z'); // 11:30 AM IST (delivery day)

  // Entity IDs tracked across stages
  let standardTierId: string;
  let kitchenStationId: string;
  let driverStaffId: string;
  let companyId: string;
  let addressId: string;
  let employeeId: string;
  let dishId: string;
  let optionGroupId: string;
  let chickenOptionId: string;
  let paneerOptionId: string;
  let menuCategoryId: string;
  let orderId: string;
  let orderNumber: string;
  let prepUnitId: string;
  let dropId: string;
  let invoiceId: string;
  let otherDriverDropId: string;

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: SEED_PASSWORD })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return cookies.find((cookie) => cookie.startsWith(AUTH_COOKIE_NAME))!;
  }

  beforeAll(async () => {
    fixedClock = new FixedClock(BEFORE_CUTOFF_TIME);

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CLOCK)
      .useValue(fixedClock)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    kitchenTime = app.get(KitchenTime);

    adminCookie = await login('admin@test.com');
    kitchenCookie = await login('kitchen@test.com');
    dispatchCookie = await login('dispatch@test.com');
    driverCookie = await login('driver@test.com');

    const defaultTier = await prisma.priceTier.findFirstOrThrow({
      where: { isDefault: true },
      select: { id: true },
    });
    standardTierId = defaultTier.id;

    const driverStaff = await prisma.staff.findUniqueOrThrow({
      where: { staffCode: 'DRIVER-001' },
      select: { id: true },
    });
    driverStaffId = driverStaff.id;

    // Clean up any stale cutoff runs or drops for the test date
    const targetDate = new Date(`${DELIVERY_DATE}T00:00:00.000Z`);
    await prisma.dropOrder.deleteMany({
      where: { drop: { deliveryDate: targetDate } },
    });
    await prisma.drop.deleteMany({
      where: { deliveryDate: targetDate },
    });
    await prisma.order.updateMany({
      where: { deliveryDate: targetDate },
      data: { cutoffRunId: null },
    });
    await prisma.cutoffRun.deleteMany({
      where: { targetDeliveryDate: targetDate },
    });
  });

  afterAll(async () => {
    const orderWhere = companyId ? { companyId } : orderId ? { id: orderId } : null;
    if (orderWhere) {
      const orders = await prisma.order.findMany({ where: orderWhere, select: { id: true } });
      const oIds = orders.map((o) => o.id);
      if (oIds.length > 0) {
        await prisma.invoiceLine.deleteMany({ where: { invoice: { companyId } } });
        await prisma.orderCredit.deleteMany({ where: { orderId: { in: oIds } } });
        await prisma.order.updateMany({
          where: { id: { in: oIds } },
          data: { invoiceId: null, cutoffRunId: null },
        });
        await prisma.invoice.deleteMany({ where: { companyId } });
        await prisma.dropOrder.deleteMany({ where: { orderId: { in: oIds } } });
        await prisma.drop.deleteMany({ where: { companyId } });
        await prisma.prepUnit.deleteMany({ where: { orderId: { in: oIds } } });
        await prisma.combinationOption.deleteMany({
          where: { orderCombination: { orderLine: { orderId: { in: oIds } } } },
        });
        await prisma.orderCombination.deleteMany({
          where: { orderLine: { orderId: { in: oIds } } },
        });
        await prisma.orderLine.deleteMany({ where: { orderId: { in: oIds } } });
        await prisma.orderEvent.deleteMany({ where: { orderId: { in: oIds } } });
        await prisma.order.deleteMany({ where: { id: { in: oIds } } });
      }
    }

    const targetDate = new Date(`${DELIVERY_DATE}T00:00:00.000Z`);
    await prisma.order.updateMany({
      where: { deliveryDate: targetDate },
      data: { cutoffRunId: null },
    });
    await prisma.cutoffRun.deleteMany({
      where: { targetDeliveryDate: targetDate },
    });

    if (menuCategoryId) {
      await prisma.menuCategoryDish.deleteMany({
        where: { menuCategoryId },
      });
      await prisma.menuCategory.deleteMany({
        where: { id: menuCategoryId },
      });
    }

    if (dishId) {
      await prisma.orderLine.deleteMany({ where: { dishId } });
      await prisma.dishOptionGroup.deleteMany({ where: { dishId } });
      await prisma.dishTierPrice.deleteMany({ where: { dishId } });
      await prisma.dish.deleteMany({ where: { id: dishId } });
    }

    if (optionGroupId) {
      await prisma.optionGroupOption.deleteMany({ where: { optionGroupId } });
      await prisma.optionGroup.deleteMany({ where: { id: optionGroupId } });
    }

    if (chickenOptionId || paneerOptionId) {
      const optIds = [chickenOptionId, paneerOptionId].filter(Boolean);
      await prisma.optionTierPrice.deleteMany({
        where: { optionId: { in: optIds } },
      });
      await prisma.option.deleteMany({ where: { id: { in: optIds } } });
    }

    if (employeeId) {
      await prisma.customerEmployee.deleteMany({ where: { id: employeeId } });
    }

    if (companyId) {
      await prisma.companyDomain.deleteMany({ where: { companyId } });
      await prisma.companyAddress.deleteMany({ where: { companyId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
    }

    await app.close();
  });

  // =========================================================================
  // STAGE 1: COMPANY
  // =========================================================================
  it('Stage 1 — Company: creates a company with domains, addresses and working days', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/companies')
      .set('Cookie', adminCookie)
      .send({
        name: `Lifecycle Corp ${SUFFIX}`,
        priceTierId: standardTierId,
        domains: [`lifecycle-${SUFFIX}.com`],
        addresses: [
          {
            label: 'HQ Main Building',
            line1: '42 Brigade Road',
            city: 'Bengaluru',
            postalCode: '560025',
          },
        ],
        workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        billingContactName: 'Accounts Payable',
        billingContactEmail: `ap@lifecycle-${SUFFIX}.com`,
      })
      .expect(201);

    expect(res.body.id).toBeTruthy();
    expect(res.body.name).toBe(`Lifecycle Corp ${SUFFIX}`);
    expect(res.body.domains[0].domain).toBe(`lifecycle-${SUFFIX}.com`);
    expect(res.body.addresses).toHaveLength(1);
    expect(res.body.workingDays).toEqual([
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
    ]);

    companyId = res.body.id;
    addressId = res.body.addresses[0].id;
  });

  // =========================================================================
  // STAGE 2: EMPLOYEE
  // =========================================================================
  it('Stage 2 — Employee: creates an active customer employee belonging to the company', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/employees')
      .set('Cookie', adminCookie)
      .send({
        companyId,
        email: `tester@lifecycle-${SUFFIX}.com`,
        fullName: 'Alex Lifecycle',
        defaultAddressId: addressId,
        canChooseAddress: true,
        canChooseDeliveryTime: true,
      })
      .expect(201);

    expect(res.body.id).toBeTruthy();
    expect(res.body.email).toBe(`tester@lifecycle-${SUFFIX}.com`);
    expect(res.body.company.id).toBe(companyId);
    expect(res.body.active).toBe(true);
    expect(res.body.defaultAddress.id).toBe(addressId);

    employeeId = res.body.id;
  });

  // =========================================================================
  // STAGE 3: CATALOGUE (Dish, Option Group, Options)
  // =========================================================================
  it('Stage 3 — Catalogue: creates a dish with required option group and active options', async () => {
    // Obtain valid kitchen station from reference API
    const stationsRes = await request(app.getHttpServer())
      .get('/api/reference/kitchen-stations')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(stationsRes.body.length).toBeGreaterThan(0);
    kitchenStationId = stationsRes.body[0].id;

    // 1. Create Dish
    const dishRes = await request(app.getHttpServer())
      .post('/api/dishes')
      .set('Cookie', adminCookie)
      .send({
        name: `Rice Bowl ${SUFFIX}`,
        sku: `LC-BOWL-${SUFFIX}`,
        temperature: 'HOT',
        costCents: 5000,
        kitchenStationId,
        minimumOrderQuantity: 1,
      })
      .expect(201);

    expect(dishRes.body.id).toBeTruthy();
    expect(dishRes.body.sku).toBe(`LC-BOWL-${SUFFIX}`);
    expect(dishRes.body.active).toBe(true);
    dishId = dishRes.body.id;

    // 2. Create Required Option Group
    const groupRes = await request(app.getHttpServer())
      .post('/api/option-groups')
      .set('Cookie', adminCookie)
      .send({
        code: `LC-PROT-${SUFFIX}`,
        name: `Protein Selection ${SUFFIX}`,
        required: true,
        maxSelections: 1,
      })
      .expect(201);

    expect(groupRes.body.id).toBeTruthy();
    expect(groupRes.body.required).toBe(true);
    optionGroupId = groupRes.body.id;

    // 3. Create Options: Chicken and Paneer
    const chickenRes = await request(app.getHttpServer())
      .post('/api/options')
      .set('Cookie', adminCookie)
      .send({
        code: `LC-OPT-CHK-${SUFFIX}`,
        name: 'Grilled Chicken Breast',
        costCents: 1500,
      })
      .expect(201);

    const paneerRes = await request(app.getHttpServer())
      .post('/api/options')
      .set('Cookie', adminCookie)
      .send({
        code: `LC-OPT-PAN-${SUFFIX}`,
        name: 'Spiced Cottage Cheese',
        costCents: 1200,
      })
      .expect(201);

    chickenOptionId = chickenRes.body.id;
    paneerOptionId = paneerRes.body.id;

    // 4. Link options to option group
    const linkRes = await request(app.getHttpServer())
      .put(`/api/option-groups/${optionGroupId}/options`)
      .set('Cookie', adminCookie)
      .send({
        options: [{ optionId: chickenOptionId }, { optionId: paneerOptionId }],
      })
      .expect(200);

    expect(linkRes.body.options).toHaveLength(2);

    // 5. Attach option group to dish
    const attachRes = await request(app.getHttpServer())
      .put(`/api/dishes/${dishId}/option-groups`)
      .set('Cookie', adminCookie)
      .send({
        optionGroupIds: [optionGroupId],
      })
      .expect(200);

    expect(attachRes.body.optionGroups).toHaveLength(1);
    expect(attachRes.body.optionGroups[0].id).toBe(optionGroupId);
  });

  // =========================================================================
  // STAGE 4: PRICING
  // =========================================================================
  it('Stage 4 — Pricing: configures explicit prices for the dish and options', async () => {
    // Dish: 10,000 cents (₹100), Chicken: 2,000 cents (₹20), Paneer: 1,500 cents (₹15)
    await request(app.getHttpServer())
      .put(`/api/price-tiers/${standardTierId}/prices`)
      .set('Cookie', adminCookie)
      .send({
        prices: [
          { itemType: 'dish', itemId: dishId, priceCents: 10000 },
          { itemType: 'option', itemId: chickenOptionId, priceCents: 2000 },
          { itemType: 'option', itemId: paneerOptionId, priceCents: 1500 },
        ],
      })
      .expect(200);

    // Verify through tier price grid API
    const gridRes = await request(app.getHttpServer())
      .get(`/api/price-tiers/${standardTierId}/prices?type=dish&q=LC-BOWL-${SUFFIX}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(gridRes.body.data).toHaveLength(1);
    expect(gridRes.body.data[0].effectivePriceCents).toBe(10000);
    expect(gridRes.body.data[0].source).toBe('EXPLICIT');
  });

  // =========================================================================
  // STAGE 5: EMPLOYEE MENU PREVIEW
  // =========================================================================
  it('Stage 5 — Menu Preview: verifies dish and pricing in employee menu preview', async () => {
    // Create menu category and add dish
    const catRes = await request(app.getHttpServer())
      .post('/api/menu/categories')
      .set('Cookie', adminCookie)
      .send({
        name: `Healthy Bowls ${SUFFIX}`,
        slug: `healthy-bowls-${SUFFIX}`,
        displayOrder: 1,
        isSecret: false,
      })
      .expect(201);

    menuCategoryId = catRes.body.id;

    await request(app.getHttpServer())
      .put(`/api/menu/categories/${menuCategoryId}/dishes`)
      .set('Cookie', adminCookie)
      .send({
        dishes: [{ dishId, displayOrder: 1 }],
      })
      .expect(200);

    // Request menu preview for the employee's company
    const menuRes = await request(app.getHttpServer())
      .get(`/api/menu?companyId=${companyId}&employeeId=${employeeId}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(menuRes.body.company.id).toBe(companyId);
    expect(menuRes.body.employee.id).toBe(employeeId);

    const foundCategory = menuRes.body.categories.find(
      (c: { id: string }) => c.id === menuCategoryId,
    );
    expect(foundCategory).toBeDefined();

    const foundDish = foundCategory.dishes.find(
      (d: { id: string }) => d.id === dishId,
    );
    expect(foundDish).toBeDefined();
    expect(foundDish.priceCents).toBe(10000);

    // Inspect dish definition to verify option group and options availability
    const dishDetail = await request(app.getHttpServer())
      .get(`/api/dishes/${dishId}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(dishDetail.body.optionGroups).toHaveLength(1);
    expect(dishDetail.body.optionGroups[0].required).toBe(true);

    const groupDetail = await request(app.getHttpServer())
      .get(`/api/option-groups/${optionGroupId}`)
      .set('Cookie', adminCookie)
      .expect(200);

    const optionIds = groupDetail.body.options.map((o: { id: string }) => o.id);
    expect(optionIds).toContain(chickenOptionId);
    expect(optionIds).toContain(paneerOptionId);
  });

  // =========================================================================
  // STAGE 6: CREATE ORDER
  // =========================================================================
  it('Stage 6 — Create Order: creates a draft order with dish and chicken option for qty=2', async () => {
    // 2 bowls with grilled chicken: (10000 + 2000) * 2 = 24000 cents (₹240)
    const createRes = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Cookie', adminCookie)
      .send({
        customerEmployeeId: employeeId,
        deliveryDate: DELIVERY_DATE,
        deliveryTime: '12:30',
        deliveryAddressId: addressId,
        lines: [
          {
            dishId,
            quantity: 2,
            combinations: [
              {
                quantity: 2,
                selections: [
                  {
                    optionGroupId,
                    optionIds: [chickenOptionId],
                  },
                ],
              },
            ],
          },
        ],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeTruthy();
    expect(createRes.body.orderNumber).toBeTruthy();
    expect(createRes.body.status).toBe('DRAFT');
    expect(createRes.body.company.id).toBe(companyId);
    expect(createRes.body.employee.id).toBe(employeeId);
    expect(createRes.body.subtotalCents).toBe(24000);
    expect(createRes.body.totalCents).toBe(24000);
    expect(createRes.body.lines[0].sku).toBe(`LC-BOWL-${SUFFIX}`);
    expect(createRes.body.lines[0].quantity).toBe(2);
    expect(createRes.body.lines[0].combinations[0].quantity).toBe(2);
    expect(createRes.body.lines[0].combinations[0].unitPriceCents).toBe(12000);
    orderId = createRes.body.id;
    orderNumber = createRes.body.orderNumber;

    expect(createRes.body.lines[0].combinations[0].options[0].optionId).toBe(
      chickenOptionId,
    );
    expect(
      createRes.body.lines[0].combinations[0].options[0].optionPriceCents,
    ).toBe(2000);
  });

  // =========================================================================
  // STAGE 7: PLACE ORDER
  // =========================================================================
  it('Stage 7 — Place Order: transitions order from DRAFT to PLACED', async () => {
    const placeRes = await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/place`)
      .set('Cookie', adminCookie)
      .expect(201);

    expect(placeRes.body.id).toBe(orderId);
    expect(placeRes.body.status).toBe('PLACED');
    expect(placeRes.body.events.some((e: { type: string }) => e.type === 'PLACED')).toBe(
      true,
    );
  });

  // =========================================================================
  // STAGE 8 & 9: CUTOFF & ORDER CONFIRMED
  // =========================================================================
  it('Stage 8 & 9 — Cutoff & Order Confirmation: confirms order idempotently once cutoff passes', async () => {
    // 1. Move FixedClock past cutoff (10:30 AM IST on Tuesday, cutoff was 10:00 AM IST)
    fixedClock.set(AFTER_CUTOFF_TIME);

    // 2. Invoke real cutoff processing
    const cutoffRes = await request(app.getHttpServer())
      .post(`/api/cutoff/process/${DELIVERY_DATE}`)
      .set('Cookie', adminCookie)
      .expect(201);

    expect(cutoffRes.body.processed).toBe(true);
    expect(cutoffRes.body.confirmed).toBeGreaterThanOrEqual(1);
    expect(cutoffRes.body.drops).toBeGreaterThanOrEqual(1);

    // 3. Verify order transitioned to CONFIRMED
    const confirmedOrder = await request(app.getHttpServer())
      .get(`/api/orders/${orderId}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(confirmedOrder.body.status).toBe('CONFIRMED');

    const dbOrder = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(dbOrder.cutoffRunId).toBeTruthy();

    // 4. Verify idempotency: second cutoff run must report alreadyProcessed without duplicates
    const secondCutoff = await request(app.getHttpServer())
      .post(`/api/cutoff/process/${DELIVERY_DATE}`)
      .set('Cookie', adminCookie)
      .expect(201);

    expect(secondCutoff.body.alreadyProcessed).toBe(true);
  });

  // =========================================================================
  // STAGE 10: PREP UNITS & KITCHEN BOARD
  // =========================================================================
  it('Stage 10 — Kitchen Board: verifies prep unit created with correct station and quantity', async () => {
    const boardRes = await request(app.getHttpServer())
      .get(`/api/kitchen/board?date=${DELIVERY_DATE}`)
      .set('Cookie', kitchenCookie)
      .expect(200);

    // Find our order on the kitchen board
    const allStationOrders = boardRes.body.stations.flatMap(
      (s: { orders: { id: string; units: { id: string; status: string; quantity: number }[] }[] }) =>
        s.orders,
    );

    const kitchenOrder = allStationOrders.find(
      (o: { id: string }) => o.id === orderId,
    );
    expect(kitchenOrder).toBeDefined();
    expect(kitchenOrder.units).toHaveLength(1);

    const unit = kitchenOrder.units[0];
    expect(unit.status).toBe('PENDING');
    expect(unit.quantity).toBe(2);

    prepUnitId = unit.id;
  });

  // =========================================================================
  // STAGE 11: KITCHEN START
  // =========================================================================
  it('Stage 11 — Kitchen Start: starts prep unit to IN_PROGRESS and rejects repeat starts', async () => {
    const startRes = await request(app.getHttpServer())
      .post(`/api/kitchen/units/${prepUnitId}/start`)
      .set('Cookie', kitchenCookie)
      .expect(201);

    expect(startRes.body.status).toBe('IN_KITCHEN');
    const startedUnit = startRes.body.prepUnits.find(
      (u: { id: string }) => u.id === prepUnitId,
    );
    expect(startedUnit.status).toBe('IN_PROGRESS');
    expect(startedUnit.startedAt).toBeTruthy();

    // Repeated start must be rejected with 409
    await request(app.getHttpServer())
      .post(`/api/kitchen/units/${prepUnitId}/start`)
      .set('Cookie', kitchenCookie)
      .expect(409);
  });

  // =========================================================================
  // STAGE 12: KITCHEN COMPLETE
  // =========================================================================
  it('Stage 12 — Kitchen Complete: completes prep unit and order reaches READY state', async () => {
    const doneRes = await request(app.getHttpServer())
      .post(`/api/kitchen/units/${prepUnitId}/done`)
      .set('Cookie', kitchenCookie)
      .expect(201);

    expect(doneRes.body.status).toBe('READY');
    const completedUnit = doneRes.body.prepUnits.find(
      (u: { id: string }) => u.id === prepUnitId,
    );
    expect(completedUnit.status).toBe('READY');
    expect(completedUnit.completedAt).toBeTruthy();

    // Repeated done must be rejected with 409
    await request(app.getHttpServer())
      .post(`/api/kitchen/units/${prepUnitId}/done`)
      .set('Cookie', kitchenCookie)
      .expect(409);
  });

  // =========================================================================
  // STAGE 13 & 14: DISPATCH READY & DRIVER ASSIGNMENT
  // =========================================================================
  it('Stage 13 & 14 — Dispatch & Driver Assignment: moves to DISPATCH_READY and assigns driver', async () => {
    // 1. Advance clock to delivery day
    fixedClock.set(DELIVERY_DAY_TIME);

    // 2. Transition order to DISPATCH_READY (returns the parent drop)
    const readyRes = await request(app.getHttpServer())
      .post(`/api/dispatch/orders/${orderId}/ready`)
      .set('Cookie', dispatchCookie)
      .expect(201);

    expect(readyRes.body.status).toBe('READY');
    dropId = readyRes.body.id;

    // Verify order itself transitioned to DISPATCH_READY
    const orderAfterReady = await request(app.getHttpServer())
      .get(`/api/orders/${orderId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(orderAfterReady.body.status).toBe('DISPATCH_READY');

    // 3. Drop belongs to our company
    expect(readyRes.body.company.id).toBe(companyId);

    // 4. Assign driver
    const assignRes = await request(app.getHttpServer())
      .post(`/api/dispatch/drops/${dropId}/assign-driver`)
      .set('Cookie', dispatchCookie)
      .send({ driverStaffId })
      .expect(201);

    expect(assignRes.body.driver.id).toBe(driverStaffId);
  });

  // =========================================================================
  // STAGE 15: OUT FOR DELIVERY
  // =========================================================================
  it('Stage 15 — Out for Delivery: transitions drop to OUT and rejects premature delivery', async () => {
    // Premature deliver without moving OUT must fail with 409
    await request(app.getHttpServer())
      .post(`/api/dispatch/drops/${dropId}/deliver`)
      .set('Cookie', dispatchCookie)
      .expect(409);

    // Transition to OUT
    const outRes = await request(app.getHttpServer())
      .post(`/api/dispatch/drops/${dropId}/out`)
      .set('Cookie', dispatchCookie)
      .expect(201);

    expect(outRes.body.status).toBe('OUT_FOR_DELIVERY');

    // Verify order is OUT_FOR_DELIVERY
    const orderRes = await request(app.getHttpServer())
      .get(`/api/orders/${orderId}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(orderRes.body.status).toBe('OUT_FOR_DELIVERY');
  });

  // =========================================================================
  // STAGE 16: DRIVER VIEW & DATA ISOLATION
  // =========================================================================
  it('Stage 16 — Driver View: driver sees assigned drop and does not see other drivers drops', async () => {
    // Create another drop assigned to another staff member to verify isolation
    const otherStaff = await prisma.staff.findFirstOrThrow({
      where: { id: { not: driverStaffId }, active: true },
      select: { id: true },
    });

    const otherDrop = await prisma.drop.create({
      data: {
        companyId,
        companyAddressId: addressId,
        deliveryDate: new Date(`${DELIVERY_DATE}T00:00:00.000Z`),
        deliveryTime: kitchenTime.fromTimeString('13:00'),
        status: 'OUT_FOR_DELIVERY',
        driverStaffId: otherStaff.id,
      },
    });
    otherDriverDropId = otherDrop.id;

    // Call driver today list authenticated as driver
    const driverTodayRes = await request(app.getHttpServer())
      .get('/api/driver/drops/today')
      .set('Cookie', driverCookie)
      .expect(200);

    const dropIds = driverTodayRes.body.drops.map((d: { id: string }) => d.id);
    expect(dropIds).toContain(dropId);
    expect(dropIds).not.toContain(otherDriverDropId);

    // Verify driver views do not leak financial pricing data
    expect(JSON.stringify(driverTodayRes.body)).not.toMatch(/Cents|subtotal|unitPrice/i);
  });

  // =========================================================================
  // STAGE 17: DELIVERED
  // =========================================================================
  it('Stage 17 — Delivered: driver marks drop DELIVERED with note', async () => {
    const deliverRes = await request(app.getHttpServer())
      .post(`/api/driver/drops/${dropId}/deliver`)
      .set('Cookie', driverCookie)
      .field('note', 'Delivered to reception desk')
      .expect(201);

    expect(deliverRes.body.status).toBe('DELIVERED');
    expect(deliverRes.body.deliveredAt).toBeTruthy();

    // Verify order reaches DELIVERED status
    const orderRes = await request(app.getHttpServer())
      .get(`/api/orders/${orderId}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(orderRes.body.status).toBe('DELIVERED');
  });

  // =========================================================================
  // STAGE 18: INVOICE
  // =========================================================================
  it('Stage 18 — Invoice: creates an invoice and rejects duplicate invoicing', async () => {
    const invoiceRes = await request(app.getHttpServer())
      .post('/api/invoices')
      .set('Cookie', adminCookie)
      .send({ orderIds: [orderId] })
      .expect(201);

    expect(invoiceRes.body.id).toBeTruthy();
    expect(invoiceRes.body.companyId).toBe(companyId);
    expect(invoiceRes.body.status).toBe('ISSUED');
    expect(invoiceRes.body.subtotalCents).toBe(24000);
    expect(invoiceRes.body.totalCents).toBe(24000);

    invoiceId = invoiceRes.body.id;

    // Re-invoicing same order must fail with 409
    await request(app.getHttpServer())
      .post('/api/invoices')
      .set('Cookie', adminCookie)
      .send({ orderIds: [orderId] })
      .expect(409);
  });

  // =========================================================================
  // STAGE 19: PAYMENT
  // =========================================================================
  it('Stage 19 — Payment: marks invoice PAID and enforces immutable paid status against void', async () => {
    const paidRes = await request(app.getHttpServer())
      .post(`/api/invoices/${invoiceId}/paid`)
      .set('Cookie', adminCookie)
      .expect(201);

    expect(paidRes.body.id).toBe(invoiceId);
    expect(paidRes.body.status).toBe('PAID');

    // Attempting to void a PAID invoice must be rejected
    await request(app.getHttpServer())
      .post(`/api/invoices/${invoiceId}/void`)
      .set('Cookie', adminCookie)
      .expect(409);

    // Repeated pay must also be rejected
    await request(app.getHttpServer())
      .post(`/api/invoices/${invoiceId}/paid`)
      .set('Cookie', adminCookie)
      .expect(409);
  });

  // =========================================================================
  // STAGE 20: CREDIT
  // =========================================================================
  it('Stage 20 — Credit: applies credit to order, enforces credit limit rules', async () => {
    // Attempting credit exceeding order total (order total = 24000) must fail with 400
    await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/credits`)
      .set('Cookie', adminCookie)
      .send({ amountCents: 999999, reason: 'Exceeds order total' })
      .expect(400);

    // Create valid credit for the order (e.g. 2000 cents = ₹20 goodwill credit)
    const creditRes = await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/credits`)
      .set('Cookie', adminCookie)
      .send({
        amountCents: 2000,
        reason: 'Corporate catering promotional discount',
      })
      .expect(201);

    expect(creditRes.body.id).toBeTruthy();
    expect(creditRes.body.orderId).toBe(orderId);
    expect(creditRes.body.companyId).toBe(companyId);
    expect(creditRes.body.amountCents).toBe(2000);
  });

  // =========================================================================
  // STAGE 21: FINAL ORDER AGGREGATE ASSERTION
  // =========================================================================
  it('Stage 21 — Final Order Assertion: verifies full aggregate state and intact event history', async () => {
    const finalRes = await request(app.getHttpServer())
      .get(`/api/orders/${orderId}`)
      .set('Cookie', adminCookie)
      .expect(200);

    const order = finalRes.body;

    // 1. Company & Employee
    expect(order.company.id).toBe(companyId);
    expect(order.employee.id).toBe(employeeId);

    // 2. Catalogue dish & option selection
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0].sku).toBe(`LC-BOWL-${SUFFIX}`);
    expect(order.lines[0].quantity).toBe(2);
    expect(order.lines[0].combinations[0].quantity).toBe(2);
    expect(order.lines[0].combinations[0].options[0].optionId).toBe(
      chickenOptionId,
    );

    // 3. Pricing
    expect(order.totalCents).toBe(24000);
    expect(order.subtotalCents).toBe(24000);

    // 4. Delivery address and timing
    expect(order.delivery.address.id).toBe(addressId);
    expect(order.delivery.date).toBe(DELIVERY_DATE);

    // 5. Prep units & kitchen timestamps
    expect(order.prepUnits).toHaveLength(1);
    expect(order.prepUnits[0].status).toBe('READY');

    const dbPrepUnit = await prisma.prepUnit.findUniqueOrThrow({
      where: { id: prepUnitId },
    });
    expect(dbPrepUnit.startedAt).toBeTruthy();
    expect(dbPrepUnit.completedAt).toBeTruthy();

    // 6. Driver delivery & status
    expect(order.status).toBe('DELIVERED');
    const dbDrop = await prisma.drop.findUniqueOrThrow({
      where: { id: dropId },
    });
    expect(dbDrop.status).toBe('DELIVERED');
    expect(dbDrop.driverStaffId).toBe(driverStaffId);
    expect(dbDrop.deliveredAt).toBeTruthy();

    // 7. Invoice & payment status
    expect(order.invoice.id).toBe(invoiceId);
    const dbInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(dbInvoice.status).toBe('PAID');
    expect(dbInvoice.totalCents).toBe(24000);

    // 8. Credit information
    const dbCredits = await prisma.orderCredit.findMany({
      where: { orderId },
    });
    expect(dbCredits).toHaveLength(1);
    expect(dbCredits[0].amountCents).toBe(2000);
    expect(dbCredits[0].companyId).toBe(companyId);

    // 9. Lifecycle audit events — no skipped states
    const eventTypes = order.events.map((e: { type: string }) => e.type);
    expect(eventTypes).toContain('DRAFT');
    expect(eventTypes).toContain('PLACED');
    expect(eventTypes).toContain('CONFIRMED');
    expect(eventTypes).toContain('KITCHEN_STARTED');
    expect(eventTypes).toContain('KITCHEN_READY');
    expect(eventTypes).toContain('DISPATCH_READY');
    expect(eventTypes).toContain('OUT_FOR_DELIVERY');
    expect(eventTypes).toContain('DELIVERED');
  });
});
