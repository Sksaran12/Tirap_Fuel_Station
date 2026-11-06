import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from './db.js'

const OWNER_USERNAME = process.env.OWNER_USERNAME || 'owner'
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'tirap12345'

async function main() {
  // Owner account (PRD §2: one owner, no staff logins in V1)
  const existing = await prisma.user.findUnique({ where: { username: OWNER_USERNAME } })
  if (!existing) {
    await prisma.user.create({
      data: {
        username: OWNER_USERNAME,
        passwordHash: await bcrypt.hash(OWNER_PASSWORD, 10),
      },
    })
    console.log(`owner created: ${OWNER_USERNAME}`)
  } else {
    console.log('owner already exists')
  }

  // Settings row
  await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      rounding: 'paper',
      stockLossValuation: 'selling',
      maxMeterDigits: 6,
      varianceLimit: 200,
      stationName: 'Tirap Fuel Station',
    },
  })

  // Nozzles: four per product, matching the paper sheet of 24/10/2026
  if ((await prisma.nozzle.count()) === 0) {
    await prisma.nozzle.createMany({
      data: [
        ...['MS', 'HSD'].flatMap((product) =>
          [1, 2, 3, 4].map((index) => ({
            name: `${product} Nozzle ${index}`,
            product,
            sortOrder: (product === 'MS' ? 0 : 10) + index,
          })),
        ),
      ],
    })
  }

  // Tanks
  if ((await prisma.tank.count()) === 0) {
    await prisma.tank.createMany({
      data: [
        { name: 'MS Tank 1', product: 'MS' },
        { name: 'HSD Tank 1', product: 'HSD' },
      ],
    })
  }

  // Lubricant items seen on the sample sheet
  if ((await prisma.lubeItem.count()) === 0) {
    await prisma.lubeItem.createMany({
      data: [
        { name: 'M-oil 1L', price: 230 },
        { name: 'M-oil 1.2L', price: 350 },
      ],
    })
  }

  // Expense categories typical for a pump
  const categories = [
    'Salary',
    'Electricity',
    'Tea & Food',
    'Repairs',
    'Transport',
    'Stationery',
    'Misc',
  ]
  for (const name of categories) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  console.log('seed complete')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
