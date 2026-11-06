import { useState } from 'react'
import { api } from './api'

/**
 * Hook for uploading files to Cloudflare R2 via backend presigned URLs.
 *
 * Flow:
 *  1. POST /api/uploads/presign  → get a presigned PUT URL from the backend
 *  2. PUT {uploadUrl}            → upload file bytes directly to R2 (no backend roundtrip)
 *  3. POST /api/uploads/confirm  → save metadata to the database
 *
 * @example
 *   const { upload, uploading, error } = useUpload()
 *   await upload(file, { date: '2026-11-06', tag: 'invoice' })
 */
export function useUpload() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * @param {File} file
   * @param {{ date?: string, tag?: string }} [options]
   * @returns {Promise<object>} saved document record
   */
  async function upload(file, options = {}) {
    setUploading(true)
    setError(null)

    try {
      // 1. Ask our backend for a presigned PUT URL
      const { uploadUrl, key } = await api.post('/uploads/presign', {
        filename: file.name,
        contentType: file.type,
        size: file.size,
        date: options.date,
        tag: options.tag,
      })

      // 2. PUT file bytes straight to R2 — bypasses our server entirely
      const r2Response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!r2Response.ok) {
        throw new Error(`R2 upload failed (HTTP ${r2Response.status}).`)
      }

      // 3. Tell the backend the upload succeeded so it saves the metadata row
      const { document } = await api.post('/uploads/confirm', {
        key,
        filename: file.name,
        contentType: file.type,
        size: file.size,
        date: options.date,
        tag: options.tag,
      })

      return document
    } catch (err) {
      setError(err.message ?? 'Upload failed.')
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

