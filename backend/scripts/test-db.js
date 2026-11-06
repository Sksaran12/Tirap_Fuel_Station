import { prisma } from '../src/db.js'

async function run() {
  try {
    console.log('1. Checking User in PostgreSQL...')
    const user = await prisma.user.findFirst()
    console.log(`   Found user: ${user ? user.username : 'None'}`)

    console.log('2. Inserting test Expense Category...')
    let cat = await prisma.expenseCategory.findFirst({ where: { name: 'Test Generator Fuel' } })
    if (!cat) {
      cat = await prisma.expenseCategory.create({
        data: { name: 'Test Generator Fuel', active: true },
      })
      console.log(`   Created category: ${cat.name} (id: ${cat.id})`)
    } else {
      console.log(`   Reusing existing category: ${cat.name}`)
    }

    console.log('3. Inserting test Expense record (testing NUMERIC & FK)...')
    const expense = await prisma.expense.create({
      data: {
        date: '2026-11-06',
        categoryId: cat.id,
        type: 'running',
        amount: 250.00,
        details: 'DB test transaction',
      },
    })
    console.log(`   Saved expense ID: ${expense.id}, Amount: ₹${expense.amount}`)

    console.log('4. Inserting test Document record (R2 metadata table)...')
    const doc = await prisma.document.create({
      data: {
        key: 'uploads/2026-11-06/test-invoice.pdf',
        filename: 'invoice-sample.pdf',
        contentType: 'application/pdf',
        size: 24500,
        date: '2026-11-06',
        tag: 'invoice',
      },
    })
    console.log(`   Saved document ID: ${doc.id}, File: ${doc.filename}`)

    console.log('5. Querying inserted records back from PostgreSQL...')
    const fetchedExpense = await prisma.expense.findUnique({
      where: { id: expense.id },
      include: { category: true },
    })
    console.log(`   Fetched expense category: ${fetchedExpense.category.name}`)

    const fetchedDoc = await prisma.document.findUnique({ where: { id: doc.id } })
    console.log(`   Fetched document key: ${fetchedDoc.key}`)

    console.log('6. Cleaning up test records...')
    await prisma.expense.delete({ where: { id: expense.id } })
    await prisma.document.delete({ where: { id: doc.id } })
    console.log('   Cleaned up test expense & test document.')

    console.log('\n✅ ALL DATABASE TESTS PASSED SUCCESSFULLY!')
  } catch (err) {
    console.error('❌ DB test failed:', err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

run()
