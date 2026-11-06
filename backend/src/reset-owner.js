import 'dotenv/config'
import { prisma } from './db.js'

// Developer utility: clear a lockout and sign the owner out everywhere.
// Usage: node src/reset-owner.js
const user = await prisma.user.findFirst()
if (!user) {
  console.log('No owner account found. Run: node src/seed.js')
} else {
  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null },
  })
  const sessions = await prisma.session.deleteMany({ where: { userId: user.id } })
  console.log(`Unlocked ${user.username}; cleared ${sessions.count} session(s).`)
}

await prisma.$disconnect()
