const EXTRA_COMPANIES = [
    {
        name: 'Globex Trading',
        domain: 'globex.com',
        legalName: 'Globex Trading Pvt Ltd',
        city: 'Bengaluru',
        line1: '88 MG Road',
        postalCode: '560001',
    },
    {
        name: 'Initech Labs',
        domain: 'initech.com',
        legalName: 'Initech Labs LLP',
        city: 'Bengaluru',
        line1: '12 Outer Ring Road',
        postalCode: '560103',
    },
    {
        name: 'Umbrella Health',
        domain: 'umbrella.health',
        legalName: 'Umbrella Health Pvt Ltd',
        city: 'Bengaluru',
        line1: '3 Whitefield Main',
        postalCode: '560066',
    },
];
export async function seedExtendedCatalogue(prisma) {
    const hot = await prisma.kitchenStation.findUnique({ where: { code: 'HOT_LINE' } });
    const cold = await prisma.kitchenStation.findUnique({ where: { code: 'COLD_LINE' } });
    const portion = await prisma.portionSize.findUnique({ where: { code: 'REGULAR' } });
    if (!hot || !cold || !portion) {
        return;
    }
    const names = [
        'Dal Tadka', 'Jeera Rice', 'Veg Biryani', 'Chicken Biryani', 'Egg Curry',
        'Palak Paneer', 'Chana Masala', 'Rajma Bowl', 'Veg Pulao', 'Fish Fry',
        'Mutton Keema', 'Tandoori Chicken', 'Veg Korma', 'Sambar Rice', 'Curd Rice',
        'Masala Dosa', 'Idli Sambar', 'Medu Vada', 'Poha Bowl', 'Upma Cup',
        'Fruit Bowl', 'Raita Cup',
    ];
    for (const [index, name] of names.entries()) {
        const sku = `FK-DEMO-${String(index + 1).padStart(3, '0')}`;
        const station = index % 3 === 0 ? cold : hot;
        await prisma.dish.upsert({
            where: { sku },
            update: { name, costCents: 600 + index * 35 },
            create: {
                sku,
                name,
                description: `Demo ${name.toLowerCase()} prepared for corporate lunch.`,
                temperature: station.id === cold.id ? 'COLD' : 'HOT',
                costCents: 600 + index * 35,
                kitchenStationId: station.id,
                portionSizeId: portion.id,
                active: index !== 21,
            },
        });
    }
    const spice = await prisma.optionGroup.upsert({
        where: { code: 'SPICE' },
        update: { name: 'Spice level' },
        create: { code: 'SPICE', name: 'Spice level', required: true, displayOrder: 0, maxSelections: 1 },
    });
    const extra = await prisma.optionGroup.upsert({
        where: { code: 'EXTRAS' },
        update: { name: 'Extras' },
        create: { code: 'EXTRAS', name: 'Extras', required: false, displayOrder: 1, maxSelections: 3 },
    });
    const mild = await prisma.option.upsert({
        where: { code: 'FK-OPT-MILD' },
        update: { name: 'Mild' },
        create: { code: 'FK-OPT-MILD', name: 'Mild', costCents: 0, active: true },
    });
    const hotOpt = await prisma.option.upsert({
        where: { code: 'FK-OPT-HOT' },
        update: { name: 'Hot' },
        create: { code: 'FK-OPT-HOT', name: 'Hot', costCents: 0, active: true },
    });
    for (const [order, option] of [mild, hotOpt].entries()) {
        await prisma.optionGroupOption.upsert({
            where: {
                optionGroupId_optionId: { optionGroupId: spice.id, optionId: option.id },
            },
            update: {},
            create: { optionGroupId: spice.id, optionId: option.id, displayOrder: order },
        });
    }
    const sauce = await prisma.option.findUnique({ where: { code: 'FK-OPT-EXTRA-SAUCE' } });
    if (sauce) {
        await prisma.optionGroupOption.upsert({
            where: {
                optionGroupId_optionId: { optionGroupId: extra.id, optionId: sauce.id },
            },
            update: {},
            create: { optionGroupId: extra.id, optionId: sauce.id, displayOrder: 0 },
        });
    }
    const curry = await prisma.dish.findUnique({ where: { sku: 'FK-CURRY-001' } });
    if (curry) {
        await prisma.dishOptionGroup.upsert({
            where: {
                dishId_optionGroupId: { dishId: curry.id, optionGroupId: spice.id },
            },
            update: { required: true },
            create: { dishId: curry.id, optionGroupId: spice.id, required: true },
        });
    }
    const mains = await prisma.menuCategory.upsert({
        where: { slug: 'mains-demo' },
        update: { name: 'Mains' },
        create: { slug: 'mains-demo', name: 'Mains', displayOrder: 3, isSecret: false, active: true },
    });
    const dishes = await prisma.dish.findMany({
        where: { sku: { startsWith: 'FK-DEMO-' } },
        select: { id: true, sku: true },
    });
    for (const [index, dish] of dishes.entries()) {
        await prisma.menuCategoryDish.upsert({
            where: { menuCategoryId_dishId: { menuCategoryId: mains.id, dishId: dish.id } },
            update: { displayOrder: index, active: dish.sku !== 'FK-DEMO-022' },
            create: {
                menuCategoryId: mains.id,
                dishId: dish.id,
                displayOrder: index,
                active: dish.sku !== 'FK-DEMO-022',
            },
        });
    }
}
export async function seedExtendedPricing(prisma) {
    const standard = await prisma.priceTier.findUnique({ where: { code: 'STANDARD' } });
    if (!standard) {
        return;
    }
    const dishes = await prisma.dish.findMany({
        where: { sku: { startsWith: 'FK-DEMO-' }, active: true },
        select: { id: true, costCents: true },
    });
    for (const dish of dishes) {
        await prisma.dishTierPrice.upsert({
            where: { dishId_priceTierId: { dishId: dish.id, priceTierId: standard.id } },
            update: {},
            create: { dishId: dish.id, priceTierId: standard.id, priceCents: dish.costCents + 700 },
        });
    }
}
export async function seedExtendedCompanies(prisma) {
    const standard = await prisma.priceTier.findUnique({ where: { code: 'STANDARD' } });
    const packaging = await prisma.packagingType.findUnique({ where: { code: 'INDIVIDUAL' } });
    if (!standard) {
        return;
    }
    for (const company of EXTRA_COMPANIES) {
        const existing = await prisma.companyDomain.findUnique({
            where: { domain: company.domain },
            select: { companyId: true },
        });
        const saved = existing
            ? await prisma.company.findUniqueOrThrow({
                where: { id: existing.companyId },
                select: { id: true },
            })
            : await prisma.company.create({
                data: {
                    name: company.name,
                    legalName: company.legalName,
                    priceTierId: standard.id,
                    defaultPackagingTypeId: packaging?.id,
                    leaveKitchenMinutes: 60,
                    defaultDeliveryTime: new Date('1970-01-01T12:30:00.000Z'),
                    active: true,
                    domains: { create: { domain: company.domain } },
                    workingDays: {
                        create: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].map((weekday) => ({
                            weekday: weekday,
                        })),
                    },
                },
                select: { id: true },
            });
        const address = (await prisma.companyAddress.findFirst({
            where: { companyId: saved.id, label: 'HQ' },
        })) ??
            (await prisma.companyAddress.create({
                data: {
                    companyId: saved.id,
                    label: 'HQ',
                    line1: company.line1,
                    city: company.city,
                    postalCode: company.postalCode,
                    country: 'IN',
                    active: true,
                },
            }));
        await prisma.company.update({
            where: { id: saved.id },
            data: { defaultAddressId: address.id },
        });
        const email = `ops@${company.domain}`;
        await prisma.customerEmployee.upsert({
            where: { email },
            update: { fullName: `${company.name} Ops` },
            create: {
                companyId: saved.id,
                email,
                fullName: `${company.name} Ops`,
                defaultAddressId: address.id,
                active: true,
            },
        });
    }
}
export async function seedDemoOperations(prisma) {
    const northwind = await prisma.companyDomain.findUnique({
        where: { domain: 'northwind.com' },
        select: { companyId: true },
    });
    if (!northwind) {
        return;
    }
    const company = await prisma.company.findUnique({
        where: { id: northwind.companyId },
        include: { defaultAddress: true },
    });
    const employee = await prisma.customerEmployee.findUnique({
        where: { email: 'alice@northwind.com' },
    });
    const wrap = await prisma.dish.findUnique({ where: { sku: 'FK-WRAP-001' } });
    const driver = await prisma.staff.findUnique({ where: { staffCode: 'DRIVER-001' } });
    const station = await prisma.kitchenStation.findUnique({ where: { code: 'HOT_LINE' } });
    if (!company?.defaultAddress || !employee || !wrap || !driver || !station || !company.priceTierId) {
        return;
    }
    const today = new Date();
    const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const yesterday = new Date(utcToday);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const tomorrow = new Date(utcToday);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await upsertDemoOrder(prisma, {
        key: 'demo:order:history:delivered',
        orderNumber: 'DEMO-HIST-001',
        status: 'DELIVERED',
        deliveryDate: yesterday,
        company,
        employeeId: employee.id,
        wrap,
        station,
    });
    const todayOrder = await upsertDemoOrder(prisma, {
        key: 'demo:order:today:confirmed',
        orderNumber: 'DEMO-TODAY-001',
        status: 'CONFIRMED',
        deliveryDate: utcToday,
        company,
        employeeId: employee.id,
        wrap,
        station,
    });
    await upsertDemoOrder(prisma, {
        key: 'demo:order:tomorrow:placed',
        orderNumber: 'DEMO-FUT-001',
        status: 'PLACED',
        deliveryDate: tomorrow,
        company,
        employeeId: employee.id,
        wrap,
        station,
    });
    if (todayOrder) {
        const drop = await prisma.drop.upsert({
            where: {
                companyId_companyAddressId_deliveryDate_deliveryTime: {
                    companyId: company.id,
                    companyAddressId: company.defaultAddress.id,
                    deliveryDate: utcToday,
                    deliveryTime: new Date('1970-01-01T12:30:00.000Z'),
                },
            },
            create: {
                companyId: company.id,
                companyAddressId: company.defaultAddress.id,
                deliveryDate: utcToday,
                deliveryTime: new Date('1970-01-01T12:30:00.000Z'),
                status: 'PENDING',
                driverStaffId: driver.id,
            },
            update: { driverStaffId: driver.id },
        });
        await prisma.dropOrder.upsert({
            where: { orderId: todayOrder },
            create: { dropId: drop.id, orderId: todayOrder },
            update: { dropId: drop.id },
        });
        await prisma.demoOwnedRecord.upsert({
            where: { key: 'demo:drop:today:driver' },
            update: { entityId: drop.id },
            create: { key: 'demo:drop:today:driver', entityType: 'Drop', entityId: drop.id },
        });
    }
    const issued = await prisma.invoice.upsert({
        where: { invoiceNumber: 'DEMO-INV-ISSUED' },
        update: {},
        create: {
            companyId: company.id,
            invoiceNumber: 'DEMO-INV-ISSUED',
            status: 'ISSUED',
            subtotalCents: 2099,
            totalCents: 2099,
        },
    });
    await prisma.invoice.upsert({
        where: { invoiceNumber: 'DEMO-INV-PAID' },
        update: {},
        create: {
            companyId: company.id,
            invoiceNumber: 'DEMO-INV-PAID',
            status: 'PAID',
            subtotalCents: 1799,
            totalCents: 1799,
        },
    });
    await prisma.invoice.upsert({
        where: { invoiceNumber: 'DEMO-INV-VOID' },
        update: {},
        create: {
            companyId: company.id,
            invoiceNumber: 'DEMO-INV-VOID',
            status: 'VOID',
            subtotalCents: 1299,
            totalCents: 1299,
        },
    });
    void issued;
}
async function upsertDemoOrder(prisma, input) {
    const address = input.company.defaultAddress;
    if (!address || !input.company.priceTierId) {
        return null;
    }
    const existing = await prisma.order.findUnique({
        where: { orderNumber: input.orderNumber },
        select: { id: true },
    });
    const order = existing ??
        (await prisma.order.create({
            data: {
                orderNumber: input.orderNumber,
                companyId: input.company.id,
                customerEmployeeId: input.employeeId,
                status: input.status,
                deliveryDate: input.deliveryDate,
                deliveryTime: new Date('1970-01-01T12:30:00.000Z'),
                deliveryAddressId: address.id,
                deliveryAddressLabel: address.label,
                deliveryAddressLine1: address.line1,
                deliveryAddressCity: address.city,
                deliveryAddressPostalCode: address.postalCode,
                deliveryAddressCountry: address.country,
                priceTierId: input.company.priceTierId,
                priceTierName: 'Standard',
                leaveKitchenMinutes: 60,
                subtotalCents: 2099,
                totalCents: 2099,
            },
            select: { id: true },
        }));
    const lineCount = await prisma.orderLine.count({ where: { orderId: order.id } });
    if (lineCount === 0) {
        const line = await prisma.orderLine.create({
            data: {
                orderId: order.id,
                dishId: input.wrap.id,
                dishName: input.wrap.name,
                dishSku: input.wrap.sku,
                dishTemperature: 'HOT',
                kitchenStationId: input.station.id,
                kitchenStationCode: input.station.code,
                kitchenStationName: input.station.name,
                quantity: 2,
                unitPriceCents: 2099,
                lineTotalCents: 4198,
            },
        });
        const combo = await prisma.orderCombination.create({
            data: {
                orderLineId: line.id,
                quantity: 2,
                unitPriceCents: 2099,
                optionsPriceCents: 0,
                totalCents: 4198,
                signature: 'no-options',
            },
        });
        await prisma.prepUnit.create({
            data: {
                orderId: order.id,
                orderCombinationId: combo.id,
                kitchenStationId: input.station.id,
                kitchenStationCode: input.station.code,
                kitchenStationName: input.station.name,
                dishName: input.wrap.name,
                quantity: 2,
                status: input.status === 'DELIVERED' ? 'READY' : 'PENDING',
            },
        });
    }
    await prisma.demoOwnedRecord.upsert({
        where: { key: input.key },
        update: { entityId: order.id },
        create: { key: input.key, entityType: 'Order', entityId: order.id },
    });
    return order.id;
}
//# sourceMappingURL=seed-demo.js.map