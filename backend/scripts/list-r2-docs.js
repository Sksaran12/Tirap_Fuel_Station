import 'dotenv/config'
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { r2, R2_BUCKET } from '../src/r2.js'
import { prisma } from '../src/db.js'

async function checkStorage() {
  console.log('--- 1. CHECKING POSTGRESQL "documents" TABLE ---')
  const docs = await prisma.document.findMany({ orderBy: { createdAt: 'desc' } })
  console.table(
    docs.map((d) => ({
      ID: d.id.slice(0, 10) + '...',
      Filename: d.filename,
      Date: d.date,
      Tag: d.tag,
      Size: `${d.size} B`,
      R2_Key: d.key,
    }))
  )

  console.log('\n--- 2. CHECKING LIVE CLOUDFLARE R2 BUCKET ("tirap-docs") ---')
  const r2List = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET }))
  if (r2List.Contents?.length) {
    console.table(
      r2List.Contents.map((item) => ({
        Key: item.Key,
        Size: `${item.Size} bytes`,
        LastModified: item.LastModified?.toISOString(),
      }))
    )
  } else {
    console.log('No objects found in R2.')
  }

  await prisma.$disconnect()
}

checkStorage()

