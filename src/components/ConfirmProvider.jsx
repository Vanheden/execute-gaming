import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const ConfirmContext = createContext(null)

// App-wide replacement for window.confirm / window.prompt with a styled modal.
// Usage:
//   const { confirm, prompt } = useConfirm()
//   if (await confirm({ title, message, confirmLabel, danger })) { … }
//   const reason = await prompt({ title, placeholder })  // string | null
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const [value, setValue] = useState('')
  const resolver = useRef(null)

  const openDialog = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolver.current = resolve
        setValue(opts.defaultValue || '')
        setDialog(opts)
      }),
    [],
  )

  const confirm = useCallback((opts) => openDialog({ ...opts, mode: 'confirm' }), [openDialog])
  const prompt = useCallback((opts) => openDialog({ ...opts, mode: 'prompt', input: true }), [openDialog])

  const close = useCallback(
    (result) => {
      setDialog(null)
      const resolve = resolver.current
      resolver.current = null
      if (resolve) resolve(result)
    },
    [],
  )

  const cancelValue = dialog?.mode === 'prompt' ? null : false
  const acceptValue = dialog?.mode === 'prompt' ? value : true

  useEffect(() => {
    if (!dialog) return
    const onKey = (e) => {
      if (e.key === 'Escape') close(cancelValue)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, cancelValue, close])

  return (
    <ConfirmContext.Provider value={{ confirm, prompt }}>
      {children}
      {dialog && (
        <div className="modal" onClick={() => close(cancelValue)} role="dialog" aria-modal="true">
          <div className="modal__card confirm" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm__title">{dialog.title}</h3>
            {dialog.message && <p className="confirm__msg">{dialog.message}</p>}
            {dialog.input && (
              <input
                className="cform__input"
                autoFocus
                value={value}
                placeholder={dialog.placeholder || ''}
                maxLength={dialog.maxLength || 280}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && close(acceptValue)}
              />
            )}
            <div className="confirm__actions">
              <button className="btn btn--ghost btn--sm" onClick={() => close(cancelValue)}>
                {dialog.cancelLabel || 'Cancel'}
              </button>
              <button
                className={`btn btn--sm ${dialog.danger ? 'btn--danger' : ''}`}
                autoFocus={!dialog.input}
                onClick={() => close(acceptValue)}
              >
                {dialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  return useContext(ConfirmContext)
}
