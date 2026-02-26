import { withApprovalDecorator } from '@/lib/ai/tools/approval-decorator'
import { listTaxonomiesToolRegistration } from '@/lib/ai/tools/list-taxonomies'
import { queryPostsToolRegistration } from '@/lib/ai/tools/query-posts'
import { searchPostsToolRegistration } from '@/lib/ai/tools/search-posts'
import { AiAgentTool, AiAgentToolContext, AiAgentToolRegistration } from '@/lib/ai/tools/types'

const toolRegistrations: AiAgentToolRegistration[] = [
  queryPostsToolRegistration,
  listTaxonomiesToolRegistration,
  searchPostsToolRegistration,
]

export async function buildAiAgentTools(context: AiAgentToolContext): Promise<AiAgentTool[]> {
  const tools = await Promise.all(
    toolRegistrations.map(async (registration) => {
      const tool = await registration.factory(context)
      return withApprovalDecorator(tool, registration, context)
    })
  )
  return tools
}
