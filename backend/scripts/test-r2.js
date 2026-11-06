import 'dotenv/config'
import { PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { r2, R2_BUCKET } from '../src/r2.js'

async function testR2() {
  console.log(`Connecting to R2 bucket: "${R2_BUCKET}"...`)
  const testKey = `test-folder/test-connection-${Date.now()}.txt`

  try {
    // 1. Upload a small test file
    console.log(`1. Uploading test file "${testKey}" to R2...`)
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: testKey,
        Body: 'Hello Cloudflare R2! Fuel station test connection successful.',
        ContentType: 'text/plain',
      })
    )
    console.log('   ✅ File successfully written to Cloudflare R2!')

    // 2. List objects in bucket to verify it exists
    console.log('2. Verifying file in bucket list...')
    const list = await r2.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: 'test-folder/',
      })
    )
    const found = list.Contents?.some((c) => c.Key === testKey)
    console.log(`   ✅ File confirmed in R2 listing: ${found ? 'FOUND' : 'NOT FOUND'}`)

    // 3. Clean up the test file
    console.log('3. Cleaning up test file...')
    await r2.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: testKey,
      })
    )
    console.log('   ✅ Test file deleted from R2.')

    console.log('\n🎉 CLOUDFLARE R2 CREDENTIALS & BUCKET CONNECTION FULLY WORKING!')
  } catch (err) {
    console.error('\n❌ R2 Connection Error:', err.message)
    console.error(err)
  }
}

testR2()

