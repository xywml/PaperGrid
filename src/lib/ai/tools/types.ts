import { ClientTool, ServerTool } from '@langchain/core/tools'

export type AiAgentTool = ClientTool | ServerTool

export type AiAgentToolContext = {
  includeProtected: boolean
  ragTopK: number
  ragMinScore: number
  approvedToolKeys: Set<string>
}

export type AiToolApprovalPolicy = {
  requiredWhen: (args: Record<string, unknown>) => boolean
  reason?: string
}

export type AiAgentToolFactory = (
  context: AiAgentToolContext
) => Promise<AiAgentTool> | AiAgentTool

export type AiAgentToolRegistration = {
  key: string
  description: string
  factory: AiAgentToolFactory
  approvalPolicy?: AiToolApprovalPolicy
}
