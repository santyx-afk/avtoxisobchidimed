import { PageHeader, EmptyState } from '../components/ui'
import { Calculator } from 'lucide-react'

export default function Calculate() {
  return (
    <div>
      <PageHeader title="Oylik hisoblash" subtitle="IVMS faylni yuklab, oylikni hisoblang" />
      <EmptyState icon={Calculator} title="Tez orada" description="Bu sahifa 2-bosqichda to'ldiriladi." />
    </div>
  )
}
