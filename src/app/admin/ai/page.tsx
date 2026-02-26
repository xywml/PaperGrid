import { redirect } from 'next/navigation'
import { AdminAiChatPage } from '@/components/admin/ai/chat-page'
import { getAiRuntimeSettings } from '@/lib/ai/config'

export default async function AdminAiPage() {
  const settings = await getAiRuntimeSettings()

  if (!settings.enabled) {
    redirect('/admin/ai/settings')
  }

  return <AdminAiChatPage />
}
