import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from './db.js'

const SESSION_MINUTES = 30
const LOCK_MINUTES = 15
const MAX_FAILED = 5
const LOGIN_REDIRECT_MS = 1500
const ROLL_EVERY_MS = 60_000
const COOKIE = process.env.SESSION_COOKIE || 'tirap_session'

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(200),
})

const cookieOptions = (maxAgeMs) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: maxAgeMs,
})

export async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Username and password are required.' })

  const { username, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { username } })
  const invalid = () => res.status(401).json({ error: 'Wrong username or password.' })

  if (!user) return invalid()

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil - new Date()) / 60000)
    return res.status(423).json({ error: `Too many failed attempts. Try again in ${minutes} minute(s).` })
  }

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) {
    const attempts = user.failedAttempts + 1
    const lock = attempts >= MAX_FAILED
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
      },
    })
    if (lock) {
      return res.status(423).json({ error: `Too many failed attempts. Locked for ${LOCK_MINUTES} minutes.` })
    }
    return res.status(401).json({ error: 'Wrong username or password.', attemptsLeft: MAX_FAILED - attempts })
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } })

  const token = crypto.randomBytes(32).toString('hex')
  await prisma.session.create({
    data: {
      id: token,
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_MINUTES * 60000),
    },
  })

  res.cookie(COOKIE, token, cookieOptions(SESSION_MINUTES * 60000))
  res.json({
    user: { id: user.id, username: user.username },
    // The client shows a success confirmation for this long before routing on.
    redirectDelayMs: LOGIN_REDIRECT_MS,
    redirectTo: '/dashboard',
  })
}

export async function logout(req, res) {
  const token = req.cookies?.[COOKIE]
  if (token) await prisma.session.deleteMany({ where: { id: token } })
  res.clearCookie(COOKIE, { path: '/' })
  res.json({ ok: true })
}

export async function me(req, res) {
  res.json({ user: { id: req.user.id, username: req.user.username } })
}

export async function changePassword(req, res) {
  const parsed = passwordSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'New password must be at least 10 characters.' })

  const ok = await bcrypt.compare(parsed.data.currentPassword, req.user.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Current password is wrong.' })

  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10) },
  })
  await prisma.session.deleteMany({ where: { userId: req.user.id, NOT: { id: req.cookies?.[COOKIE] } } })
  res.json({ ok: true })
}

/** Rolling 30-minute inactivity session. */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE]
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const session = await prisma.session.findUnique({ where: { id: token }, include: { user: true } })
  if (!session) return res.status(401).json({ error: 'Not signed in.' })

  if (session.expiresAt < new Date()) {
    await prisma.session.deleteMany({ where: { id: token } })
    return res.status(401).json({ error: 'Session expired. Sign in again.' })
  }

  // Rolling extension — but only within a minute of the current expiry, so an
  // idle-but-signed-in screen does not turn every API call into an extra DB
  // write over the pooler. A session unused for 30 minutes still expires: the
  // last call near expiry triggers the write and slides the window forward.
  if (session.expiresAt.getTime() - Date.now() < ROLL_EVERY_MS) {
    const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60000)
    await prisma.session.update({ where: { id: token }, data: { expiresAt, lastSeen: new Date() } })
    res.cookie(COOKIE, token, cookieOptions(SESSION_MINUTES * 60000))
  }

  req.user = session.user
  req.sessionId = token
  next()
}
