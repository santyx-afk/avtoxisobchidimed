import { PageHeader, EmptyState } from '../components/ui'
import { HandCoins } from 'lucide-react'

export default function Advances() {
  return (
    <div>
      <PageHeader title="Avanslar" subtitle="Ishchilarga berilgan avanslar" />
      <EmptyState icon={HandCoins} title="Tez orada" description="Bu sahifa 3-bosqichda to'ldiriladi." />
    </div>
  )
}
