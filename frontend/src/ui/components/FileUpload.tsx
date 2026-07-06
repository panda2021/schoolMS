import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'

interface FileUploadProps {
  schoolId: string
  uploadedBy: string
  folder: string                    // e.g. 'updates', 'messages', 'announcements'
  associationField?: string         // e.g. 'daily_update_id', 'message_id', 'announcement_id'
  associationId?: string            // the FK value
  onUploadComplete: (objectPath: string, assetId: string) => void
  onError: (msg: string) => void
  accept?: string                   // e.g. 'image/*,video/*'
  maxSizeMB?: number
  compact?: boolean                 // smaller inline variant
}

export function FileUpload({
  schoolId,
  uploadedBy,
  folder,
  associationField,
  associationId,
  onUploadComplete,
  onError,
  accept = 'image/*,video/*,application/pdf',
  maxSizeMB = 50,
  compact = false,
}: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File | null) => {
    if (!f) { setFile(null); setPreview(null); return }
    if (f.size > maxSizeMB * 1024 * 1024) {
      onError(`File too large. Max size is ${maxSizeMB}MB.`)
      return
    }
    setFile(f)
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f)
      setPreview(url)
    } else {
      setPreview(null)
    }
  }

  const upload = async () => {
    if (!file) return
    if (!schoolId) { onError('Missing school context'); return }

    const safeName = file.name.replace(/[^\w.]+/g, '_')
    const path = `${schoolId}/${folder}/${uploadedBy}/${Date.now()}_${safeName}`
    setUploading(true)

    let uploaded = false
    try {
      const { error: storageErr } = await supabase.storage
        .from('media')
        .upload(path, file, {
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        })
      if (storageErr) throw storageErr
      uploaded = true

      const assetRow: Record<string, unknown> = {
        bucket: 'media',
        object_path: path,
        school_id: schoolId,
        mime_type: file.type || 'application/octet-stream',
        file_size_bytes: file.size,
        uploaded_by: uploadedBy,
      }
      if (associationField && associationId) {
        assetRow[associationField] = associationId
      }

      const { data: asset, error: dbErr } = await supabase
        .from('media_assets')
        .insert(assetRow)
        .select('id')
        .single()

      if (dbErr) throw dbErr

      onUploadComplete(path, asset.id)
      setFile(null)
      setPreview(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (err: any) {
      console.error('Upload error:', err)
      // Don't leave an orphaned storage object if the DB row failed.
      if (uploaded) await supabase.storage.from('media').remove([path])
      onError(err.message || 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  const clear = () => {
    setFile(null)
    setPreview(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (compact) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          style={{ display: 'none' }}
        />
        {file ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.name}
            </span>
            {preview && (
              <img src={preview} alt="Preview" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} />
            )}
            <button className="btn btn-primary" onClick={upload} disabled={uploading} style={{ padding: '4px 12px', fontSize: 13 }}>
              {uploading ? <LoadingSpinner size="sm" /> : 'Upload'}
            </button>
            <button className="btn btn-ghost" onClick={clear} disabled={uploading} style={{ padding: '4px 8px', fontSize: 13 }}>
              &times;
            </button>
          </>
        ) : (
          <button className="btn btn-secondary" onClick={() => inputRef.current?.click()} style={{ padding: '4px 12px', fontSize: 13 }}>
            Attach File
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <div
        className={`dropzone${dragOver ? ' dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0] ?? null) }}
        onClick={() => inputRef.current?.click()}
        style={{ cursor: 'pointer', textAlign: 'center', padding: 20 }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          style={{ display: 'none' }}
        />
        {file ? (
          <div>
            {preview ? (
              <img src={preview} alt="Preview" style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, marginBottom: 8 }} />
            ) : (
              <div style={{ fontSize: 14, marginBottom: 4 }}>{file.name}</div>
            )}
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {(file.size / 1024 / 1024).toFixed(1)} MB &middot; Click to change
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--muted)' }}>
            Drop a file here or click to browse
          </div>
        )}
      </div>

      {file && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={upload} disabled={uploading}>
            {uploading ? <><LoadingSpinner size="sm" /> Uploading...</> : 'Upload'}
          </button>
          <button className="btn btn-ghost" onClick={clear} disabled={uploading}>
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
