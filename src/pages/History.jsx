import { PageHeader, EmptyState } from '../components/ui'
import { History as HistoryIcon } from 'lucide-react'

export default function History() {
  return (
    <div>
      <PageHeader title="Oylik tarixi" subtitle="Oldingi oylar hisob-kitobi" />
      <EmptyState icon={HistoryIcon} title="Tez orada" description="Bu sahifa 3-bosqichda to'ldiriladi." />
    </div>
  )
}
