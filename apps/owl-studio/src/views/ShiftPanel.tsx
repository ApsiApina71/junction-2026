import { useEffect, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { useStudio } from '../lib/studio.ts'
import type { OnShift } from '../lib/types.ts'
import { useToast } from '../ui/toast.ts'

/** JUN-100: who is the manager on shift now. A worker's Help call rings that person's glasses first. */
export function ShiftPanel() {
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
    <section className="panel" aria-labelledby="shift-heading">
      <h2 id="shift-heading">On shift now</h2>
      <p className="hint">When a new worker calls for help, the manager on shift answers on their own glasses and sees the worker's view. If they do not answer in 30 seconds, the call comes to Help here.</p>
      {companies.map((company) => {
        const current = onShift.find((row) => row.company === company)?.employee_id ?? ''
        const id = `shift-${company.replace(/\W+/g, '-')}`
        return (
          <div className="field" key={company}>
            <label htmlFor={id}>{companies.length > 1 ? `Manager on shift at ${company}` : 'Manager on shift'}</label>
            <select id={id} className="input" value={current} onChange={(event) => void choose(company, event.target.value)}>
              <option value="">No one: Help goes to Studio</option>
              {managers
                .filter((manager) => manager.company === company)
                .map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name}
                  </option>
                ))}
            </select>
          </div>
        )
      })}
      {error && <p className="field-error">{error}</p>}
    </section>
  )
}
