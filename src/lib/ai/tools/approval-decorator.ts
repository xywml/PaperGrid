import crypto from 'node:crypto'
import { AiAgentTool, AiAgentToolContext, AiAgentToolRegistration } from '@/lib/ai/tools/types'

function toSafeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort((left, right) => left.localeCompare(right))
  const parts = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
  return `{${parts.join(',')}}`
}

function buildApprovalKey(toolName: string, args: Record<string, unknown>) {
  const payload = `${toolName}:${stableStringify(args)}`
  return crypto.createHash('sha256').update(payload).digest('hex')
}

export function withApprovalDecorator(
  tool: AiAgentTool,
  registration: AiAgentToolRegistration,
  context: AiAgentToolContext
): AiAgentTool {
  if (!registration.approvalPolicy) {
    return tool
  }

  const originalInvoke = (tool as { invoke?: unknown }).invoke
  if (typeof originalInvoke !== 'function') {
    return tool
  }

  const invoke = originalInvoke as (input: unknown, config?: unknown) => Promise<unknown>

  const wrapped = Object.create(tool) as AiAgentTool & {
    invoke: (input: unknown, config?: unknown) => Promise<unknown>
  }

  wrapped.invoke = async (input: unknown, config?: unknown) => {
    const args = toSafeRecord(input)
    const needApproval = registration.approvalPolicy?.requiredWhen(args) === true
    if (!needApproval) {
      return invoke.call(tool, input, config)
    }

    const approvalKey = buildApprovalKey(registration.key, args)
    if (context.approvedToolKeys.has(approvalKey)) {
      return invoke.call(tool, input, config)
    }

    return JSON.stringify({
      ok: false,
      error: 'approval_required',
      approval: {
        key: approvalKey,
        toolName: registration.key,
        reason: registration.approvalPolicy?.reason || '该工具调用需要审批',
        args,
      },
    })
  }

  return wrapped
}
