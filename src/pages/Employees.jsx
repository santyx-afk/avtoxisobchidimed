import { PageHeader, EmptyState } from '../components/ui'
import { Users } from 'lucide-react'

export default function Employees() {
  return (
    <div>
      <PageHeader title="Ishchilar" subtitle="Ishchilar ro'yxati va sozlamalari" />
      <EmptyState icon={Users} title="Tez orada" description="Bu sahifa 2-bosqichda to'ldiriladi." />
    </div>
  )
}
