import { ToolInputParsingException } from '@langchain/core/tools'
import { AiAgentTool } from '@/lib/ai/tools/types'

const MAX_PARAMETER_RETRY_COUNT = 3

function isToolInputParsingError(error: unknown) {
  if (error instanceof ToolInputParsingException) {
    return true
  }

  if (!(error instanceof Error)) {
    return false
  }

  return error.name.toLowerCase().includes('toolinputparsingexception')
}

function toRetryExceededError(error: unknown) {
  const suffix = `工具参数校验失败，已自动重试 ${MAX_PARAMETER_RETRY_COUNT} 次，请修正参数后重试。`
  if (error instanceof Error) {
    return new Error(`${error.message}\n${suffix}`)
  }
  return new Error(suffix)
}

export function withParameterRetryDecorator(tool: AiAgentTool): AiAgentTool {
  const originalInvoke = (tool as { invoke?: unknown }).invoke
  if (typeof originalInvoke !== 'function') {
    return tool
  }

  const invoke = originalInvoke as (input: unknown, config?: unknown) => Promise<unknown>
  const wrapped = Object.create(tool) as AiAgentTool & {
    invoke: (input: unknown, config?: unknown) => Promise<unknown>
  }

  wrapped.invoke = async (input: unknown, config?: unknown) => {
    for (let retryCount = 0; retryCount <= MAX_PARAMETER_RETRY_COUNT; retryCount += 1) {
      try {
        return await invoke.call(tool, input, config)
      } catch (error) {
        if (!isToolInputParsingError(error)) {
          throw error
        }

        if (retryCount >= MAX_PARAMETER_RETRY_COUNT) {
          throw toRetryExceededError(error)
        }
      }
    }

    throw new Error('工具调用失败')
  }

  return wrapped
}
