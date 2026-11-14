// The views of Owl Studio and their addresses. The address is the part after # so a link can be shared or reloaded.

export type View = 'tasks' | 'documents' | 'people' | 'help' | 'data'

export interface Route {
  view: View
  /** The task, person or help request that is open, if any. "new" opens the form for a new person. */
  id: string | null
}

export const VIEWS: View[] = ['tasks', 'documents', 'people', 'help', 'data']

export const VIEW_TITLE: Record<View, string> = {
  tasks: 'Tasks',
  documents: 'Documents',
  people: 'People',
  help: 'Help',
  data: 'Data',
}

export function parseRoute(hash: string): Route {
  const [view, id] = hash.replace(/^#\/?/, '').split('/')
  if ((VIEWS as string[]).includes(view)) return { view: view as View, id: id ? decodeURIComponent(id) : null }
  return { view: 'tasks', id: null }
}

export function href(view: View, id: string | null = null): string {
  return id ? `#/${view}/${encodeURIComponent(id)}` : `#/${view}`
}
