import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'
interface Toast { id: number; type: ToastType; message: string }

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

/**
 * success / info -> transient toast (bottom right, auto-dismiss).
 * error          -> blocking dialog that stays until the user presses OK or X,
 *                   so problems can't be missed. Multiple errors queue up and
 *                   are shown one at a time.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [errors, setErrors] = useState<Toast[]>([])

  const show = (message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random()
    if (type === 'error') {
      setErrors(e => [...e, { id, type, message }])
      return
    }
    setToasts(t => [...t, { id, type, message }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }

  const dismissError = () => setErrors(e => e.slice(1))
  const current = errors[0]

  // Esc dismisses the current error, same as OK/X
  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissError() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current?.id])

  const value = useMemo(() => ({ show }), [])
  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Transient toasts (success / info) */}
      <div className="toast-stack" aria-live="polite" aria-atomic="true" style={{ position: 'fixed', right: 16, bottom: 16, display: 'grid', gap: 8, zIndex: 90 }}>
        {toasts.map(t => (
          <div key={t.id} className="toast" role="status" style={{ borderLeft: `4px solid ${t.type === 'success' ? 'var(--success)' : 'var(--primary)'}` }}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Blocking error dialog */}
      {current && (
        <div
          className="modal-overlay"
          style={{ zIndex: 200 }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="error-dialog-title"
          aria-describedby="error-dialog-message"
          onClick={e => { if (e.target === e.currentTarget) dismissError() }}
        >
          <div className="card" style={{ width: '90%', maxWidth: 440, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  display: 'grid', placeItems: 'center',
                  background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
                  color: 'var(--danger)',
                }}>
                  <AlertTriangle size={20} />
                </span>
                <h3 id="error-dialog-title" style={{ margin: 0, fontSize: 19 }}>Something went wrong</h3>
              </div>
              <button
                onClick={dismissError}
                aria-label="Close"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <p id="error-dialog-message" style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--text)', overflowWrap: 'break-word' }}>
              {current.message}
            </p>

            {errors.length > 1 && (
              <p className="helper" style={{ margin: '10px 0 0' }}>
                {errors.length - 1} more {errors.length - 1 === 1 ? 'issue' : 'issues'} after this one.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-primary" onClick={dismissError} autoFocus>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
