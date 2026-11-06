import { createContext, useContext, useMemo, useState } from 'react'
import { todayKey } from '../lib/format'

const DayContext = createContext(null)

export function DayProvider({ children }) {
  const [date, setDate] = useState(todayKey())
  const value = useMemo(() => ({ date, setDate }), [date])
  return <DayContext.Provider value={value}>{children}</DayContext.Provider>
}

export function useDay() {
  const context = useContext(DayContext)
  if (!context) throw new Error('useDay must be used inside DayProvider')
  return context
}
