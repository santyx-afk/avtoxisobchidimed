import { PageHeader, EmptyState } from '../components/ui'
import { Settings as SettingsIcon } from 'lucide-react'

export default function Settings() {
  return (
    <div>
      <PageHeader title="Sozlamalar" subtitle="Jarima, koeffitsientlar va agent sozlamalari" />
      <EmptyState icon={SettingsIcon} title="Tez orada" description="Bu sahifa 3-bosqichda to'ldiriladi." />
    </div>
  )
}
