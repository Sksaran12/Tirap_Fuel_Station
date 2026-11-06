import 'dotenv/config'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { r2, R2_BUCKET } from '../src/r2.js'
import { prisma } from '../src/db.js'

async function uploadSampleInvoice() {
  const date = '2026-11-06'
  const filename = 'BPCL-Fuel-Invoice-2026-11-06.pdf'
  const key = `uploads/${date}/${Date.now()}-${filename}`
  const fileContent = `
%PDF-1.4
% Tirap Fuel Station - BPCL Invoice Sample
Date: 2026-11-06
MS Litres: 12,000 L @ ₹99.66
HSD Litres: 18,000 L @ ₹89.08
Total Invoice Amount: ₹27,99,360
Status: PAID
`

  console.log(`1. Uploading demo file to Cloudflare R2 bucket "${R2_BUCKET}"...`)
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: Buffer.from(fileContent),
      ContentType: 'application/pdf',
    })
  )
  console.log(`   ✅ File stored in R2 with Key: ${key}`)

  console.log('2. Saving document metadata into PostgreSQL database...')
  const doc = await prisma.document.create({
    data: {
      key,
      filename,
      contentType: 'application/pdf',
      size: Buffer.byteLength(fileContent),
      date,
      tag: 'fuel-invoice',
    },
  })
  console.log(`   ✅ Document record saved in DB with ID: ${doc.id}`)

  console.log('\n🎉 DONE!')
  console.log(`You can now check Cloudflare Dashboard:`)
  console.log(`  Cloudflare Dashboard -> R2 -> tirap-docs -> "Objects" tab`)
  console.log(`  You will see: "${key}"`)

  await prisma.$disconnect()
}

uploadSampleInvoice()

