import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { useI18n } from '../../i18n'

interface ConfirmOptions {
  title: string
  message: ReactNode
  /** label of the confirming button (e.g. "Delete") */
  confirmLabel: string
  cancelLabel?: string
  /** danger renders a red confirm button and autofocuses Cancel */
  tone?: 'danger' | 'default'
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * `const confirm = useConfirm()` → `if (await confirm({...})) doIt()`.
 * One styled confirmation dialog for every destructive action, replacing the
 * mix of window.confirm / bespoke overlays / no-confirmation.
 */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext)
  if (!fn) throw new Error('useConfirm must be used within ConfirmProvider')
  return fn
}

interface Pending {
  options: ConfirmOptions
  resolve: (ok: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useI18n()
  const [pending, setPending] = useState<Pending | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    []
  )

  const settle = (ok: boolean): void => {
    pending?.resolve(ok)
    setPending(null)
  }

  const danger = pending?.options.tone !== 'default'

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Modal
          size="sm"
          title={pending.options.title}
          onClose={() => settle(false)}
          closeLabel={t('common.cancel')}
          // For destructive confirms, land focus on the safe option.
          initialFocusRef={danger ? cancelRef : undefined}
          footer={
            <>
              <Button ref={cancelRef} variant="ghost" onClick={() => settle(false)}>
                {pending.options.cancelLabel ?? t('common.cancel')}
              </Button>
              <Button variant={danger ? 'danger' : 'primary'} onClick={() => settle(true)}>
                {pending.options.confirmLabel}
              </Button>
            </>
          }
        >
          <p className="text-sm text-fgdim">{pending.options.message}</p>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}
