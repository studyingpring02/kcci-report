import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

let supabase: SupabaseClient | null = null
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey)
}

export { supabase }

export interface PersonRecord {
  id?: string
  name: string
  org: string
  title: string
  summary: string
  image_url: string
  naver_link: string
  confirmed: boolean
  created_at?: string
}

export async function getCachedPerson(name: string, org: string): Promise<PersonRecord | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('persons')
      .select('*')
      .eq('name', name)
      .eq('confirmed', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (error || !data) return null
    return data
  } catch { return null }
}

export async function savePerson(person: PersonRecord): Promise<void> {
  if (!supabase) return
  try {
    await supabase.from('persons').insert({
      name: person.name,
      org: person.org || '',
      title: person.title || '',
      summary: person.summary || '',
      image_url: person.image_url || '',
      naver_link: person.naver_link || '',
      confirmed: person.confirmed,
    })
  } catch { /* ignore */ }
}
