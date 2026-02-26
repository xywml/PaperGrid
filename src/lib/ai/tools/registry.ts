import { withApprovalDecorator } from '@/lib/ai/tools/approval-decorator'
import { listTaxonomiesToolRegistration } from '@/lib/ai/tools/list-taxonomies'
import { withParameterRetryDecorator } from '@/lib/ai/tools/parameter-retry-decorator'
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
      const toolWithRetry = withParameterRetryDecorator(tool)
      return withApprovalDecorator(toolWithRetry, registration, context)
    })
  )
  return tools
}
