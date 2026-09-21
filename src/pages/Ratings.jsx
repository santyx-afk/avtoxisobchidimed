import { PageHeader, EmptyState } from '../components/ui'
import { Trophy } from 'lucide-react'

export default function Ratings() {
  return (
    <div>
      <PageHeader title="Reyting" subtitle="Ishchilar reytingi" />
      <EmptyState icon={Trophy} title="Tez orada" description="Bu sahifa 3-bosqichda to'ldiriladi." />
    </div>
  )
}
