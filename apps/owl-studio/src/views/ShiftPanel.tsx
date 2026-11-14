import { TextColor, TextStyle, TextView } from '@wearables-ui-toolkit/mrbd'
import { useEffect, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { useStudio } from '../lib/studio.ts'
import type { OnShift } from '../lib/types.ts'
import { ChoiceRow } from '../ui/meta.tsx'
import { useToast } from '../ui/toast.ts'

/**
 * JUN-100: who is the manager on shift now. A worker's Help call rings that person's glasses first. Rows for the
 * People list (one per workplace), so they sit in its VerticalList.
 */
export function ShiftRows() {
  const { api, employees } = useStudio()
  const toast = useToast()
  const [onShift, setOnShift] = useState<OnShift[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .onShift()
      .then((rows) => !cancelled && setOnShift(rows))
      .catch(() => !cancelled && setOnShift([]))
    return () => {
      cancelled = true
    }
  }, [api])

  const managers = (employees ?? []).filter((employee) => employee.shift_manager)
  if (onShift === null || managers.length === 0) return null
  const companies = [...new Set(managers.map((manager) => manager.company))].sort()

  const choose = async (company: string, employeeId: string) => {
    setError('')
    try {
      setOnShift(await api.setOnShift(company, employeeId || null))
      const who = managers.find((manager) => manager.id === employeeId)
      toast({ message: who ? `${who.name} is on shift. Help calls ring their glasses first.` : `No one is on shift at ${company}. Help goes to Studio.` })
    } catch (err) {
      setError(messageOf(err))
    }
  }

  return (
    <>
      <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY} className="list-note">
        When a new worker calls for help, the manager on shift answers on their own glasses and sees the worker's view. If they do not answer in 30 seconds, the call comes to Help here.
      </TextView>
      {companies.map((company) => {
        const current = onShift.find((row) => row.company === company)?.employee_id ?? ''
        const choices = [{ value: '', label: 'No one', detail: 'Help goes to Studio' }, ...managers.filter((manager) => manager.company === company).map((manager) => ({ value: manager.id, label: manager.name, detail: 'Answers on their own glasses' }))]
        return <ChoiceRow key={company} label={companies.length > 1 ? `Manager on shift at ${company}` : 'Manager on shift'} choices={choices} value={current} onChange={(id) => void choose(company, id)} />
      })}
      {error && (
        <TextView as="p" textStyle={TextStyle.META1} className="list-note">
          <span className="status-text is-negative">{error}</span>
        </TextView>
      )}
    </>
  )
}
