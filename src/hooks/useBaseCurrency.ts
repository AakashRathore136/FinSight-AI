import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase'
import { setDefaultCurrency } from '@/src/lib/utils'
import type { CurrencySettings } from '@/src/lib/currencyUtils'

/**
 * Loads the signed-in user's base currency from the `currencies/{uid}`
 * settings document and keeps the app-wide default in sync so every
 * `formatCurrency` call (including plain-language insight text) renders in
 * the user's currency instead of hardcoded USD.
 *
 * Falls back to "USD" when the document is missing.
 */
export function useBaseCurrency(user: { uid: string } | null): string {
  const [baseCurrency, setBaseCurrency] = useState('USD')

  useEffect(() => {
    if (!user) {
      setDefaultCurrency('USD')
      setBaseCurrency('USD')
      return
    }

    let cancelled = false

    getDoc(doc(db, 'currencies', user.uid))
      .then((settingsDoc) => {
        if (cancelled) return
        const settings = settingsDoc.exists()
          ? (settingsDoc.data() as CurrencySettings)
          : null
        const currency = settings?.baseCurrency || 'USD'
        setDefaultCurrency(currency)
        setBaseCurrency(currency)
      })
      .catch((error) => {
        handleFirestoreError(error, OperationType.GET, 'currencies')
      })

    return () => {
      cancelled = true
    }
  }, [user?.uid])

  return baseCurrency
}
