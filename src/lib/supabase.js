import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from './config'

// Supabase klienti — faqat URL va ANON_KEY sozlangan bo'lsa yaratiladi.
// Aks holda null qaytadi va ilova DEMO (localStorage) rejimga o'tadi.
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    })
  : null
