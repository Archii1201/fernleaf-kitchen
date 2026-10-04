import { upsertFinancialDemoInvoice, upsertFinancialDemoOrder } from './seed-financials.js';
import { createSeedScenario, seedTime, relativeSeedDate } from './seed-runtime.js';
import { WEEKDAYS } from '../src/kitchen/time/weekday.js';
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
    const mains = (await prisma.menuCategory.findUnique({
        where: { name: 'Mains' },
    })) ??
        (await prisma.menuCategory.create({
            data: {
                slug: 'mains-demo',
                name: 'Mains',
                displayOrder: 3,
                isSecret: false,
                active: true,
            },
        }));
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
                        create: WEEKDAYS.map((weekday) => ({
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
export async function seedDemoOperations(prisma, options = {}) {
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
    const time = seedTime(options);
    const utcToday = relativeSeedDate(time, 0);
    const yesterday = relativeSeedDate(time, -1);
    const tomorrow = relativeSeedDate(time, 1);
    const historyOrder = await upsertDemoOrder(prisma, {
        key: 'demo:order:history:delivered',
        orderNumber: 'DEMO-HIST-001',
        status: 'DELIVERED',
        deliveryDate: yesterday,
        company,
        employeeId: employee.id,
        wrap,
        station,
    }, options);
    const todayOrder = await upsertDemoOrder(prisma, {
        key: 'demo:order:today:confirmed',
        orderNumber: 'DEMO-TODAY-001',
        status: 'CONFIRMED',
        deliveryDate: utcToday,
        company,
        employeeId: employee.id,
        wrap,
        station,
    }, options);
    await upsertDemoOrder(prisma, {
        key: 'demo:order:tomorrow:placed',
        orderNumber: 'DEMO-FUT-001',
        status: 'PLACED',
        deliveryDate: tomorrow,
        company,
        employeeId: employee.id,
        wrap,
        station,
    }, options);
    const voidOrder = await upsertDemoOrder(prisma, {
        key: 'demo:order:history:void', orderNumber: 'DEMO-HIST-VOID-001',
        status: 'DELIVERED', deliveryDate: relativeSeedDate(time, -2), company, employeeId: employee.id, wrap, station,
    }, options);
    if (historyOrder)
        await upsertFinancialDemoInvoice(prisma, 'DEMO-INV-PAID', historyOrder, 'PAID');
    if (todayOrder)
        await upsertFinancialDemoInvoice(prisma, 'DEMO-INV-ISSUED', todayOrder, 'ISSUED', true);
    if (voidOrder)
        await upsertFinancialDemoInvoice(prisma, 'DEMO-INV-VOID', voidOrder, 'VOID');
}
async function upsertDemoOrder(prisma, input, options = {}) {
    const address = input.company.defaultAddress;
    if (!address || !input.company.priceTierId) {
        return null;
    }
    const existing = await prisma.order.findUnique({ where: { orderNumber: input.orderNumber }, select: { id: true } });
    const orderId = existing ? await upsertFinancialDemoOrder(prisma, {
        orderNumber: input.orderNumber, companyId: input.company.id,
        customerEmployeeId: input.employeeId, status: input.status,
        deliveryDate: input.deliveryDate, deliveryTime: new Date('1970-01-01T12:30:00.000Z'),
        deliveryAddressId: address.id, deliveryAddressLabel: address.label,
        deliveryAddressLine1: address.line1, deliveryAddressCity: address.city,
        deliveryAddressPostalCode: address.postalCode, deliveryAddressCountry: address.country,
        priceTierId: input.company.priceTierId, priceTierName: 'Standard', leaveKitchenMinutes: 60,
    }, input.wrap.id) : await createSeedScenario(prisma, {
        orderNumber: input.orderNumber, employeeId: input.employeeId, dishId: input.wrap.id,
        deliveryDate: input.deliveryDate, status: input.status,
    }, options);
    await prisma.demoOwnedRecord.upsert({
        where: { key: input.key },
        update: { entityId: orderId },
        create: { key: input.key, entityType: 'Order', entityId: orderId },
    });
    return orderId;
}
// ============================================================
// RICH DEMO DATA
// ============================================================
export async function seedRichDemoData(prisma, options = {}) {
    console.log('🌱 Seeding rich demo data...');
    const hot = await prisma.kitchenStation.findUnique({
        where: { code: 'HOT_LINE' },
    });
    const cold = await prisma.kitchenStation.findUnique({
        where: { code: 'COLD_LINE' },
    });
    const regular = await prisma.portionSize.findUnique({
        where: { code: 'REGULAR' },
    });
    const small = await prisma.portionSize.findUnique({
        where: { code: 'SMALL' },
    });
    const packaging = await prisma.packagingType.findUnique({
        where: { code: 'INDIVIDUAL' },
    });
    if (!hot || !cold || !regular) {
        console.log('⚠️ Required reference data missing. Skipping rich demo data.');
        return;
    }
    // ----------------------------------------------------------
    // 1. PRICE TIERS
    // ----------------------------------------------------------
    const standard = await prisma.priceTier.findUnique({
        where: { code: 'STANDARD' },
    });
    const partner = await prisma.priceTier.findUnique({
        where: { code: 'PARTNER' },
    });
    const enterprise = await prisma.priceTier.findUnique({
        where: { code: 'ENTERPRISE' },
    });
    if (!standard) {
        console.log('⚠️ Standard price tier missing.');
        return;
    }
    // ----------------------------------------------------------
    // 2. ADDITIONAL COMPANIES
    // ----------------------------------------------------------
    const companies = [
        {
            name: 'Tata Digital',
            legalName: 'Tata Digital Private Limited',
            domain: 'tatadigital.com',
            city: 'Mumbai',
            line1: 'One Forbes, Dr. V.B. Gandhi Marg',
            postalCode: '400001',
            tier: enterprise,
        },
        {
            name: 'Infosys Technologies',
            legalName: 'Infosys Limited',
            domain: 'infosys.com',
            city: 'Bengaluru',
            line1: 'Electronic City, Hosur Road',
            postalCode: '560100',
            tier: enterprise,
        },
        {
            name: 'Razorpay',
            legalName: 'Razorpay Software Private Limited',
            domain: 'razorpay.com',
            city: 'Bengaluru',
            line1: 'Koramangala Industrial Area',
            postalCode: '560095',
            tier: partner,
        },
        {
            name: 'Swiggy Corporate',
            legalName: 'Bundl Technologies Private Limited',
            domain: 'swiggy.in',
            city: 'Bengaluru',
            line1: 'Embassy Tech Village',
            postalCode: '560103',
            tier: enterprise,
        },
        {
            name: 'Zerodha',
            legalName: 'Zerodha Broking Limited',
            domain: 'zerodha.com',
            city: 'Bengaluru',
            line1: 'J.P. Nagar',
            postalCode: '560078',
            tier: partner,
        },
        {
            name: 'Tech Mahindra',
            legalName: 'Tech Mahindra Limited',
            domain: 'techmahindra.com',
            city: 'Pune',
            line1: 'Hinjewadi Phase 3',
            postalCode: '411057',
            tier: standard,
        },
    ];
    const savedCompanies = [];
    for (const company of companies) {
        const existingDomain = await prisma.companyDomain.findUnique({
            where: { domain: company.domain },
            select: { companyId: true },
        });
        let companyId;
        if (existingDomain) {
            companyId = existingDomain.companyId;
        }
        else {
            const created = await prisma.company.create({
                data: {
                    name: company.name,
                    legalName: company.legalName,
                    priceTierId: company.tier?.id ?? standard.id,
                    defaultPackagingTypeId: packaging?.id,
                    leaveKitchenMinutes: 60,
                    defaultDeliveryTime: new Date('1970-01-01T12:30:00.000Z'),
                    active: true,
                    domains: {
                        create: {
                            domain: company.domain,
                        },
                    },
                    workingDays: {
                        create: WEEKDAYS.map((weekday) => ({
                            weekday: weekday,
                        })),
                    },
                },
                select: {
                    id: true,
                },
            });
            companyId = created.id;
        }
        let address = await prisma.companyAddress.findFirst({
            where: {
                companyId,
                label: 'HQ',
            },
        });
        if (!address) {
            address = await prisma.companyAddress.create({
                data: {
                    companyId,
                    label: 'HQ',
                    line1: company.line1,
                    city: company.city,
                    postalCode: company.postalCode,
                    country: 'IN',
                    active: true,
                },
            });
        }
        await prisma.company.update({
            where: { id: companyId },
            data: {
                defaultAddressId: address.id,
                priceTierId: company.tier?.id ?? standard.id,
            },
        });
        const tierId = company.tier?.id ?? standard.id;
        savedCompanies.push({
            id: companyId,
            name: company.name,
            domain: company.domain,
            priceTierId: tierId,
            priceTierName: company.tier?.name ??
                (tierId === standard.id ? 'Standard' : 'Standard'),
            addressId: address.id,
        });
    }
    // ----------------------------------------------------------
    // 3. EMPLOYEES
    // ----------------------------------------------------------
    const employeeNames = [
        ['Aarav Shah', 'aarav'],
        ['Diya Mehta', 'diya'],
        ['Rohan Patel', 'rohan'],
        ['Ananya Iyer', 'ananya'],
        ['Kabir Joshi', 'kabir'],
        ['Meera Nair', 'meera'],
        ['Arjun Rao', 'arjun'],
        ['Ishita Desai', 'ishita'],
        ['Vivaan Kapoor', 'vivaan'],
        ['Sara Khan', 'sara'],
    ];
    const savedEmployees = [];
    for (let companyIndex = 0; companyIndex < savedCompanies.length; companyIndex++) {
        const company = savedCompanies[companyIndex];
        // 4 employees per company
        for (let employeeIndex = 0; employeeIndex < 4; employeeIndex++) {
            const [name, username] = employeeNames[(companyIndex * 4 + employeeIndex) % employeeNames.length];
            const email = `${username}.${companyIndex + 1}@${company.domain}`;
            const employee = await prisma.customerEmployee.upsert({
                where: { email },
                update: {
                    fullName: name,
                    active: true,
                },
                create: {
                    companyId: company.id,
                    email,
                    fullName: name,
                    defaultAddressId: company.addressId,
                    active: true,
                },
            });
            savedEmployees.push({
                id: employee.id,
                companyId: company.id,
                fullName: name,
                email,
                addressId: company.addressId,
            });
        }
    }
    // ----------------------------------------------------------
    // 4. MORE DISHES
    // ----------------------------------------------------------
    const dishDefinitions = [
        ['Butter Chicken', 1450, 'HOT'],
        ['Paneer Tikka', 1050, 'HOT'],
        ['Veg Kebab Platter', 950, 'HOT'],
        ['Chicken Seekh Kebab', 1350, 'HOT'],
        ['Dal Makhani', 750, 'HOT'],
        ['Kadai Paneer', 900, 'HOT'],
        ['Chole Bhature', 850, 'HOT'],
        ['Veg Hakka Noodles', 800, 'HOT'],
        ['Chicken Hakka Noodles', 1050, 'HOT'],
        ['Thai Green Curry', 1250, 'HOT'],
        ['Veg Thai Curry', 1050, 'HOT'],
        ['Mexican Burrito Bowl', 1150, 'HOT'],
        ['Falafel Bowl', 950, 'COLD'],
        ['Greek Salad', 850, 'COLD'],
        ['Caesar Salad', 900, 'COLD'],
        ['Quinoa Power Bowl', 1050, 'COLD'],
        ['Grilled Chicken Salad', 1200, 'COLD'],
        ['Mango Yogurt Bowl', 700, 'COLD'],
        ['Chocolate Brownie', 550, 'COLD'],
        ['Gulab Jamun', 450, 'COLD'],
        ['Fresh Fruit Cup', 500, 'COLD'],
        ['Lemon Iced Tea', 350, 'COLD'],
        ['Masala Chaas', 300, 'COLD'],
        ['Cold Coffee', 450, 'COLD'],
    ];
    const savedDishes = [];
    for (let i = 0; i < dishDefinitions.length; i++) {
        const [name, costCents, temperature] = dishDefinitions[i];
        const station = temperature === 'COLD' ? cold : hot;
        const sku = `FK-RICH-${String(i + 1).padStart(3, '0')}`;
        const dish = await prisma.dish.upsert({
            where: { sku },
            update: {
                name,
                costCents,
                temperature,
                kitchenStationId: station.id,
                active: true,
            },
            create: {
                sku,
                name,
                description: `${name} prepared fresh for corporate meal programs.`,
                temperature,
                costCents,
                kitchenStationId: station.id,
                portionSizeId: name.includes('Cup') || name.includes('Brownie')
                    ? small?.id ?? regular.id
                    : regular.id,
                active: true,
            },
            select: {
                id: true,
                name: true,
                sku: true,
                costCents: true,
            },
        });
        savedDishes.push({
            id: dish.id,
            name: dish.name,
            sku: dish.sku,
            costCents: dish.costCents,
            stationId: station.id,
            stationCode: station.code,
            stationName: station.name,
        });
    }
    // ----------------------------------------------------------
    // 5. PRICE FOR EVERY TIER
    // ----------------------------------------------------------
    const tiers = [
        standard,
        partner,
        enterprise,
    ].filter(Boolean);
    for (const dish of savedDishes) {
        for (const tier of tiers) {
            if (!tier)
                continue;
            let price = dish.costCents + 700;
            if (tier.code === 'PARTNER') {
                price = dish.costCents + 850;
            }
            if (tier.code === 'ENTERPRISE') {
                price = dish.costCents + 1000;
            }
            await prisma.dishTierPrice.upsert({
                where: {
                    dishId_priceTierId: {
                        dishId: dish.id,
                        priceTierId: tier.id,
                    },
                },
                update: {
                    priceCents: price,
                },
                create: {
                    dishId: dish.id,
                    priceTierId: tier.id,
                    priceCents: price,
                },
            });
        }
    }
    // ----------------------------------------------------------
    // 6. OPTION GROUPS
    // ----------------------------------------------------------
    const optionGroups = [
        {
            code: 'PROTEIN',
            name: 'Protein',
            required: false,
            displayOrder: 2,
            maxSelections: 1,
        },
        {
            code: 'SAUCE',
            name: 'Sauce',
            required: false,
            displayOrder: 3,
            maxSelections: 2,
        },
        {
            code: 'SIDES',
            name: 'Side',
            required: false,
            displayOrder: 4,
            maxSelections: 2,
        },
        {
            code: 'BEVERAGE',
            name: 'Beverage',
            required: false,
            displayOrder: 5,
            maxSelections: 1,
        },
    ];
    const savedGroups = {};
    for (const group of optionGroups) {
        const saved = await prisma.optionGroup.upsert({
            where: { code: group.code },
            update: {
                name: group.name,
                required: group.required,
                displayOrder: group.displayOrder,
                maxSelections: group.maxSelections,
                active: true,
            },
            create: {
                code: group.code,
                name: group.name,
                required: group.required,
                displayOrder: group.displayOrder,
                maxSelections: group.maxSelections,
                active: true,
            },
            select: {
                id: true,
            },
        });
        savedGroups[group.code] = saved;
    }
    // ----------------------------------------------------------
    // 7. OPTIONS
    // ----------------------------------------------------------
    const demoOptions = [
        ['PROTEIN-CHICKEN', 'Grilled Chicken', 300, 'PROTEIN'],
        ['PROTEIN-PANEER', 'Paneer', 200, 'PROTEIN'],
        ['PROTEIN-TOFU', 'Tofu', 180, 'PROTEIN'],
        ['SAUCE-MINT', 'Mint Chutney', 0, 'SAUCE'],
        ['SAUCE-TANDOORI', 'Tandoori Sauce', 50, 'SAUCE'],
        ['SAUCE-PERI', 'Peri Peri Sauce', 75, 'SAUCE'],
        ['SAUCE-YOGURT', 'Herb Yogurt', 50, 'SAUCE'],
        ['SIDE-SALAD', 'Garden Salad', 150, 'SIDES'],
        ['SIDE-FRIES', 'Masala Fries', 180, 'SIDES'],
        ['SIDE-RAITA', 'Boondi Raita', 120, 'SIDES'],
        ['DRINK-CHAAS', 'Masala Chaas', 100, 'BEVERAGE'],
        ['DRINK-TEA', 'Iced Tea', 120, 'BEVERAGE'],
        ['DRINK-COFFEE', 'Cold Coffee', 180, 'BEVERAGE'],
    ];
    const savedOptions = [];
    for (let i = 0; i < demoOptions.length; i++) {
        // IMPORTANT:
        // Get one option from the array.
        const [code, name, costCents, groupCode] = demoOptions[i];
        const option = await prisma.option.upsert({
            where: {
                code,
            },
            update: {
                name,
                costCents,
                active: true,
            },
            create: {
                code,
                name,
                costCents,
                active: true,
            },
            select: {
                id: true,
            },
        });
        savedOptions.push({
            id: option.id,
            groupCode,
        });
        const group = savedGroups[groupCode];
        if (!group) {
            console.log(`⚠️ Option group "${groupCode}" was not found for option "${name}".`);
            continue;
        }
        await prisma.optionGroupOption.upsert({
            where: {
                optionGroupId_optionId: {
                    optionGroupId: group.id,
                    optionId: option.id,
                },
            },
            update: {
                displayOrder: i,
            },
            create: {
                optionGroupId: group.id,
                optionId: option.id,
                displayOrder: i,
            },
        });
    }
    // ----------------------------------------------------------
    // 8. MENU CATEGORIES
    // ----------------------------------------------------------
    const categories = [
        'Breakfast',
        'Indian Mains',
        'Rice & Biryani',
        'Wraps & Bowls',
        'Healthy Choices',
        'Salads',
        'Desserts',
        'Beverages',
    ];
    const savedCategories = [];
    for (let i = 0; i < categories.length; i++) {
        const name = categories[i];
        const category = await prisma.menuCategory.upsert({
            where: {
                // Names are unique too; reuse the basic seed's "Salads" category.
                name,
            },
            update: {
                name,
                active: true,
                displayOrder: i,
                isSecret: false,
            },
            create: {
                slug: `rich-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                name,
                displayOrder: i,
                isSecret: false,
                active: true,
            },
            select: {
                id: true,
                name: true,
            },
        });
        savedCategories.push(category);
    }
    // Put rich dishes into categories.
    for (let i = 0; i < savedDishes.length; i++) {
        const dish = savedDishes[i];
        const category = savedCategories[i % savedCategories.length];
        await prisma.menuCategoryDish.upsert({
            where: {
                menuCategoryId_dishId: {
                    menuCategoryId: category.id,
                    dishId: dish.id,
                },
            },
            update: {
                displayOrder: i,
                active: true,
            },
            create: {
                menuCategoryId: category.id,
                dishId: dish.id,
                displayOrder: i,
                active: true,
            },
        });
    }
    // ----------------------------------------------------------
    // 9. LINK OPTION GROUPS TO DISHES
    // ----------------------------------------------------------
    for (let i = 0; i < savedDishes.length; i++) {
        const dish = savedDishes[i];
        const groupsToAttach = i % 4 === 0
            ? ['PROTEIN', 'SAUCE', 'SIDES']
            : i % 4 === 1
                ? ['SAUCE', 'BEVERAGE']
                : i % 4 === 2
                    ? ['SIDES', 'BEVERAGE']
                    : ['SAUCE'];
        for (const groupCode of groupsToAttach) {
            await prisma.dishOptionGroup.upsert({
                where: {
                    dishId_optionGroupId: {
                        dishId: dish.id,
                        optionGroupId: savedGroups[groupCode].id,
                    },
                },
                update: {
                    required: false,
                },
                create: {
                    dishId: dish.id,
                    optionGroupId: savedGroups[groupCode].id,
                    required: false,
                },
            });
        }
    }
    // ----------------------------------------------------------
    // 10. REALISTIC ORDERS
    // ----------------------------------------------------------
    const driver = await prisma.staff.findUnique({
        where: {
            staffCode: 'DRIVER-001',
        },
    });
    const time = seedTime(options);
    const todayUtc = relativeSeedDate(time, 0);
    const dateOffset = (days) => relativeSeedDate(time, days);
    let orderNumber = 100;
    // ----------------------------------------------------------
    // PAST ORDERS
    // ----------------------------------------------------------
    const pastStatuses = [
        'DELIVERED',
        'DELIVERED',
        'DELIVERED',
        'DELIVERED',
        'CANCELLED',
        'REJECTED',
        'DELIVERED',
        'DELIVERED',
    ];
    for (let i = 0; i < pastStatuses.length; i++) {
        const company = savedCompanies[i % savedCompanies.length];
        const employee = savedEmployees.find((e) => e.companyId === company.id);
        const dish = savedDishes[i % savedDishes.length];
        if (!employee)
            continue;
        await createRichOrder(prisma, {
            orderNumber: `RICH-PAST-${String(orderNumber++).padStart(4, '0')}`,
            status: pastStatuses[i],
            deliveryDate: dateOffset(-(i + 1)),
            company,
            employee,
            dish,
        }, options);
    }
    // ----------------------------------------------------------
    // TODAY ORDERS
    // ----------------------------------------------------------
    const todayStatuses = [
        'CONFIRMED',
        'CONFIRMED',
        'CONFIRMED',
        'CONFIRMED',
        'DELIVERED',
        'CONFIRMED',
    ];
    for (let i = 0; i < todayStatuses.length; i++) {
        const company = savedCompanies[i % savedCompanies.length];
        const employee = savedEmployees.find((e) => e.companyId === company.id);
        const dish = savedDishes[(i + 5) % savedDishes.length];
        if (!employee)
            continue;
        const orderId = await createRichOrder(prisma, {
            orderNumber: `RICH-TODAY-${String(orderNumber++).padStart(4, '0')}`,
            status: todayStatuses[i],
            deliveryDate: todayUtc,
            company,
            employee,
            dish,
        }, options);
    }
    // ----------------------------------------------------------
    // FUTURE ORDERS
    // ----------------------------------------------------------
    const futureStatuses = [
        'DRAFT',
        'PLACED',
        'PLACED',
        'CONFIRMED',
        'PLACED',
        'CONFIRMED',
        'DRAFT',
        'PLACED',
        'CONFIRMED',
        'PLACED',
        'DRAFT',
        'CONFIRMED',
    ];
    for (let i = 0; i < futureStatuses.length; i++) {
        const company = savedCompanies[i % savedCompanies.length];
        const employee = savedEmployees.find((e) => e.companyId === company.id);
        const dish = savedDishes[(i + 10) % savedDishes.length];
        if (!employee)
            continue;
        await createRichOrder(prisma, {
            orderNumber: `RICH-FUTURE-${String(orderNumber++).padStart(4, '0')}`,
            status: futureStatuses[i],
            deliveryDate: dateOffset((i % 7) + 1),
            company,
            employee,
            dish,
        }, options);
    }
    console.log('✅ Rich demo data seeded successfully.');
    console.log(`   Companies: ${savedCompanies.length}`);
    console.log(`   Employees: ${savedEmployees.length}`);
    console.log(`   Dishes: ${savedDishes.length}`);
    console.log(`   Categories: ${savedCategories.length}`);
}
// ============================================================
// CREATE REALISTIC ORDER
// ============================================================
async function createRichOrder(prisma, input, options = {}) {
    const existing = await prisma.order.findUnique({ where: { orderNumber: input.orderNumber }, select: { id: true } });
    if (!existing)
        return createSeedScenario(prisma, {
            orderNumber: input.orderNumber, employeeId: input.employee.id, dishId: input.dish.id,
            deliveryDate: input.deliveryDate, status: input.status,
        }, options);
    return upsertFinancialDemoOrder(prisma, {
        orderNumber: input.orderNumber, companyId: input.company.id,
        customerEmployeeId: input.employee.id, status: input.status,
        deliveryDate: input.deliveryDate, deliveryTime: new Date('1970-01-01T12:30:00.000Z'),
        deliveryAddressId: input.company.addressId, deliveryAddressLabel: 'HQ',
        deliveryAddressLine1: 'Corporate Headquarters', deliveryAddressCity: 'Bengaluru',
        deliveryAddressPostalCode: '560001', deliveryAddressCountry: 'IN',
        priceTierId: input.company.priceTierId, priceTierName: input.company.priceTierName,
        leaveKitchenMinutes: 60,
    }, input.dish.id);
}
