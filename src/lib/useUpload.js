import { useState } from 'react'
import { api } from './api'

/**
 * Hook for uploading files to Cloudflare R2 via backend presigned URLs.
 *
 * Flow:
 *  1. POST /api/uploads/presign  → server creates a `pending` row and returns
 *                                  a signed PUT URL plus that row's id
 *  2. PUT {uploadUrl}            → upload file bytes directly to R2
 *  3. POST /api/uploads/confirm  → server checks the object with HeadObject,
 *                                  verifies size/type/magic bytes, marks it ready
 *
 * The browser never chooses the object key, and never reports the final size:
 * the backend reads both from R2.
 *
 * @example
 *   const { upload, uploading, error } = useUpload()
 *   const doc = await upload(file, { date: '2026-11-06', tag: 'invoice' })
 */
export function useUpload() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * @param {File} file
   * @param {{ date?: string, tag?: string }} [options]
   * @returns {Promise<object>} confirmed document record
   */
  async function upload(file, options = {}) {
    setUploading(true)
    setError(null)

    let pendingId = null

    try {
      // 1. Ask our backend for a presigned PUT URL. The server owns the key.
      const { id, uploadUrl } = await api.post('/uploads/presign', {
        filename: file.name,
        contentType: file.type,
        size: file.size,
        date: options.date,
        tag: options.tag,
      })
      pendingId = id

      // 2. PUT file bytes straight to R2 — bypasses our server entirely.
      //    Content-Type must be byte-for-byte what was signed.
      const r2Response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!r2Response.ok) {
        throw new Error(`R2 upload failed (HTTP ${r2Response.status}).`)
      }

      // 3. Ask the backend to verify what landed and mark the row ready.
      const { document } = await api.post('/uploads/confirm', { id })

      return document
    } catch (err) {
      // Never leave a pending row (or an orphan object) behind.
      if (pendingId) {
        await api.del(`/uploads/${pendingId}`).catch(() => {})
      }
      const message = err.message ?? 'Upload failed.'
      setError(message)
      throw err
    } finally {
      setUploading(false)
    }
  }

  /**
   * Fetches a fresh presigned GET URL for downloading a document.
   * @param {string} documentId
   * @returns {Promise<string>} download URL (valid ~15 min)
   */
  async function getDownloadUrl(documentId) {
    const { url } = await api.get(`/uploads/${documentId}/url`)
    return url
  }

  /**
   * Deletes a document from R2 and the database.
   * @param {string} documentId
   */
  async function remove(documentId) {
    await api.del(`/uploads/${documentId}`)
  }

  return { upload, getDownloadUrl, remove, uploading, error }
}
