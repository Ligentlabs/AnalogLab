import { ClientOptions } from 'openai';

import { getServerConfig } from '@/config/server';
import { JWTPayload } from '@/const/auth';
import { INBOX_SESSION_ID } from '@/const/session';
import {
  LOBE_CHAT_OBSERVATION_ID,
  LOBE_CHAT_TRACE_ID,
  TracePayload,
  TraceTagMap,
} from '@/const/trace';
import {
  ChatStreamPayload,
  LobeAnthropicAI,
  LobeAzureOpenAI,
  LobeBedrockAI,
  LobeGoogleAI,
  LobeGroq,
  LobeMistralAI,
  LobeMoonshotAI,
  LobeOllamaAI,
  LobeOpenAI,
  LobeOpenRouterAI,
  LobePerplexityAI,
  LobeRuntimeAI,
  LobeTogetherAI,
  LobeZeroOneAI,
  LobeZhipuAI,
  ModelProvider,
} from '@/libs/agent-runtime';
import AgentRuntimeLib from '@/libs/agent-runtime/AgentRuntime';
import { TraceClient } from '@/libs/traces';

import apiKeyManager from './apiKeyManager';

export interface AgentChatOptions {
  enableTrace?: boolean;
  provider: string;
  trace?: TracePayload;
}

/**
 * @deprecated
 */
class AgentRuntime {
  private _runtime: LobeRuntimeAI;

  constructor(runtime: LobeRuntimeAI) {
    this._runtime = runtime;
  }

  async chat(
    payload: ChatStreamPayload,
    { trace: tracePayload, provider, enableTrace }: AgentChatOptions,
  ) {
    const { messages, model, tools, ...parameters } = payload;

    // if not enabled trace then just call the runtime
    if (!enableTrace) return this._runtime.chat(payload);

    // create a trace to monitor the completion
    const traceClient = new TraceClient();
    const trace = traceClient.createTrace({
      id: tracePayload?.traceId,
      input: messages,
      metadata: { provider },
      name: tracePayload?.traceName,
      sessionId: `${tracePayload?.sessionId || INBOX_SESSION_ID}@${tracePayload?.topicId || 'start'}`,
      tags: tracePayload?.tags,
      userId: tracePayload?.userId,
    });

    const generation = trace?.generation({
      input: messages,
      metadata: { provider },
      model,
      modelParameters: parameters as any,
      name: `Chat Completion (${provider})`,
      startTime: new Date(),
    });

    return this._runtime.chat(payload, {
      callback: {
        experimental_onToolCall: async () => {
          trace?.update({
            tags: [...(tracePayload?.tags || []), TraceTagMap.ToolsCall],
          });
        },

        onCompletion: async (completion) => {
          generation?.update({
            endTime: new Date(),
            metadata: { provider, tools },
            output: completion,
          });

          trace?.update({ output: completion });
        },

        onFinal: async () => {
          await traceClient.shutdownAsync();
        },

        onStart: () => {
          generation?.update({ completionStartTime: new Date() });
        },
      },
      headers: {
        [LOBE_CHAT_OBSERVATION_ID]: generation?.id,
        [LOBE_CHAT_TRACE_ID]: trace?.id,
      },
    });
  }

  async models() {
    return this._runtime.models?.();
  }

  static async initializeWithUserPayload(provider: string, payload: JWTPayload) {
    let runtimeModel: LobeRuntimeAI;

    switch (provider) {
      default:
      case 'oneapi':
      case ModelProvider.OpenAI: {
        runtimeModel = this.initOpenAI(payload);
        break;
      }

      case ModelProvider.Azure: {
        runtimeModel = this.initAzureOpenAI(payload);
        break;
      }

      case ModelProvider.ZhiPu: {
        runtimeModel = await this.initZhipu(payload);
        break;
      }

      case ModelProvider.Google: {
        runtimeModel = this.initGoogle(payload);
        break;
      }

      case ModelProvider.Moonshot: {
        runtimeModel = this.initMoonshot(payload);
        break;
      }

      case ModelProvider.Bedrock: {
        runtimeModel = this.initBedrock(payload);
        break;
      }

      case ModelProvider.Ollama: {
        runtimeModel = this.initOllama(payload);
        break;
      }

      case ModelProvider.Perplexity: {
        runtimeModel = this.initPerplexity(payload);
        break;
      }

      case ModelProvider.Anthropic: {
        runtimeModel = this.initAnthropic(payload);
        break;
      }

      case ModelProvider.Mistral: {
        runtimeModel = this.initMistral(payload);
        break;
      }

      case ModelProvider.Groq: {
        runtimeModel = this.initGroq(payload);
        break;
      }

      case ModelProvider.OpenRouter: {
        runtimeModel = this.initOpenRouter(payload);
        break;
      }

      case ModelProvider.TogetherAI: {
        runtimeModel = this.initTogetherAI(payload);
        break;
      }

      case ModelProvider.ZeroOne: {
        runtimeModel = this.initZeroOne(payload);
        break;
      }
    }

    return new AgentRuntime(runtimeModel);
  }

  private static initOpenAI(payload: JWTPayload) {
    const { OPENAI_API_KEY, OPENAI_PROXY_URL } = getServerConfig();
    const openaiApiKey = payload?.apiKey || OPENAI_API_KEY;
    const baseURL = payload?.endpoint || OPENAI_PROXY_URL;

    const apiKey = apiKeyManager.pick(openaiApiKey);

    return new LobeOpenAI({ apiKey, baseURL });
  }

  private static initAzureOpenAI(payload: JWTPayload) {
    const { AZURE_API_KEY, AZURE_API_VERSION, AZURE_ENDPOINT } = getServerConfig();
    const apiKey = apiKeyManager.pick(payload?.apiKey || AZURE_API_KEY);
    const endpoint = payload?.endpoint || AZURE_ENDPOINT;
    const apiVersion = payload?.azureApiVersion || AZURE_API_VERSION;

    return new LobeAzureOpenAI(endpoint, apiKey, apiVersion);
  }

  private static async initZhipu(payload: JWTPayload) {
    const { ZHIPU_API_KEY } = getServerConfig();
    const apiKey = apiKeyManager.pick(payload?.apiKey || ZHIPU_API_KEY);

    return LobeZhipuAI.fromAPIKey({ apiKey });
  }

  private static initMoonshot(payload: JWTPayload) {
    const { MOONSHOT_API_KEY, MOONSHOT_PROXY_URL } = getServerConfig();
    const apiKey = apiKeyManager.pick(payload?.apiKey || MOONSHOT_API_KEY);

    return new LobeMoonshotAI({ apiKey, baseURL: MOONSHOT_PROXY_URL });
  }

  private static initGoogle(payload: JWTPayload) {
    const { GOOGLE_API_KEY, GOOGLE_PROXY_URL } = getServerConfig();
    const apiKey = apiKeyManager.pick(payload?.apiKey || GOOGLE_API_KEY);
    const baseURL = payload?.endpoint || GOOGLE_PROXY_URL;

    return new LobeGoogleAI({ apiKey, baseURL });
  }

  private static initBedrock(payload: JWTPayload) {
    const { AWS_SECRET_ACCESS_KEY, AWS_ACCESS_KEY_ID, AWS_REGION } = getServerConfig();

    let accessKeyId: string | undefined = AWS_ACCESS_KEY_ID;
    let accessKeySecret: string | undefined = AWS_SECRET_ACCESS_KEY;
    let region = AWS_REGION;
    // if the payload has the api key, use user
    if (payload.apiKey) {
      accessKeyId = payload?.awsAccessKeyId;
      accessKeySecret = payload?.awsSecretAccessKey;
      region = payload?.awsRegion;
    }

    return new LobeBedrockAI({ accessKeyId, accessKeySecret, region });
  }

  private static initOllama(payload: JWTPayload) {
    const { OLLAMA_PROXY_URL } = getServerConfig();
    const baseURL = payload?.endpoint || OLLAMA_PROXY_URL;

    return new LobeOllamaAI({ baseURL });
  }

  private static initPerplexity(payload: JWTPayload) {
    const { PERPLEXITY_API_KEY } = getServerConfig();
    const apiKey = apiKeyManager.pick(payload?.apiKey || PERPLEXITY_API_KEY);

    return new LobePerplexityAI({ apiKey });
  }

  private static initAnthropic(payload: JWTPayload) {
    const { ANTHROPIC_API_KEY, ANTHROPIC_PROXY_URL } = getServerConfig();
    const apiKey = apiKeyManager.pick(payload?.apiKey || ANTHROPIC_API_KEY);
    const baseURL = payload?.endpoint || ANTHROPIC_PROXY_URL;
    return new LobeAnthropicAI({ apiKey, baseURL });
  }

  private static initMistral(payload: JWTPayload) {
    const { MISTRAL_API_KEY } = getServerConfig();
    const apiKey = apiKeyManager.pick(payload?.apiKey || MISTRAL_API_KEY);

    return new LobeMistralAI({ apiKey });
  }

  private static initGroq(payload: JWTPayload) {
    const { GROQ_API_KEY } = getServerConfig();
    const apiKey = apiKeyManager.pick(payload?.apiKey || GROQ_API_KEY);

    return new LobeGroq({ apiKey });
  }

  private static initOpenRouter(payload: JWTPayload) {
    const { OPENROUTER_API_KEY } = getServerConfig();
    const apiKey = apiKeyManager.pick(payload?.apiKey || OPENROUTER_API_KEY);

    return new LobeOpenRouterAI({ apiKey });
  }

  private static initTogetherAI(payload: JWTPayload) {
    const { TOGETHERAI_API_KEY } = getServerConfig();
    const apiKey = apiKeyManager.pick(payload?.apiKey || TOGETHERAI_API_KEY);

    return new LobeTogetherAI({ apiKey });
  }

  private static initZeroOne(payload: JWTPayload) {
    const { ZEROONE_API_KEY } = getServerConfig();
    const apiKey = apiKeyManager.pick(payload?.apiKey || ZEROONE_API_KEY);

    return new LobeZeroOneAI({ apiKey });
  }
}

const getLlmOptionsFromPayload = (provider: string, payload: JWTPayload) => {
  let options:
    | Partial<ClientOptions>
    | Partial<{
        accessKeyId: string;
        accessKeySecret: string;
        apiVersion: string;
        apikey: string;
        endpoint: string;
        region: string;
      }> = {};

  switch (provider) {
    default: // Use Openai options as default
    case ModelProvider.OpenAI: {
      const { OPENAI_API_KEY, OPENAI_PROXY_URL } = getServerConfig();
      const openaiApiKey = payload?.apiKey || OPENAI_API_KEY;
      const baseURL = payload?.endpoint || OPENAI_PROXY_URL;
      const apiKey = apiKeyManager.pick(openaiApiKey);
      options = {
        apiKey,
        baseURL,
      };
      break;
    }
    case ModelProvider.Azure: {
      const { AZURE_API_KEY, AZURE_API_VERSION, AZURE_ENDPOINT } = getServerConfig();
      const apiKey = apiKeyManager.pick(payload?.apiKey || AZURE_API_KEY);
      const endpoint = payload?.endpoint || AZURE_ENDPOINT;
      const apiVersion = payload?.azureApiVersion || AZURE_API_VERSION;
      options = {
        apiVersion,
        apikey: apiKey,
        endpoint,
      };
      break;
    }
    case ModelProvider.ZhiPu: {
      const { ZHIPU_API_KEY } = getServerConfig();
      const apiKey = apiKeyManager.pick(payload?.apiKey || ZHIPU_API_KEY);
      options = {
        apiKey,
      };
      break;
    }
    case ModelProvider.Google: {
      const { GOOGLE_API_KEY, GOOGLE_PROXY_URL } = getServerConfig();
      const apiKey = apiKeyManager.pick(payload?.apiKey || GOOGLE_API_KEY);
      const baseURL = payload?.endpoint || GOOGLE_PROXY_URL;
      options = {
        apiKey,
        baseURL,
      };
      break;
    }
    case ModelProvider.Moonshot: {
      const { MOONSHOT_API_KEY, MOONSHOT_PROXY_URL } = getServerConfig();
      const apiKey = apiKeyManager.pick(payload?.apiKey || MOONSHOT_API_KEY);
      options = {
        apiKey,
        baseURL: MOONSHOT_PROXY_URL,
      };
      break;
    }
    case ModelProvider.Bedrock: {
      const { AWS_SECRET_ACCESS_KEY, AWS_ACCESS_KEY_ID, AWS_REGION } = getServerConfig();
      let accessKeyId: string | undefined = AWS_ACCESS_KEY_ID;
      let accessKeySecret: string | undefined = AWS_SECRET_ACCESS_KEY;
      let region = AWS_REGION;
      // if the payload has the api key, use user
      if (payload.apiKey) {
        accessKeyId = payload?.awsAccessKeyId;
        accessKeySecret = payload?.awsSecretAccessKey;
        region = payload?.awsRegion;
      }
      options = {
        accessKeyId,
        accessKeySecret,
        region,
      };
      break;
    }
    case ModelProvider.Ollama: {
      const { OLLAMA_PROXY_URL } = getServerConfig();
      const baseURL = payload?.endpoint || OLLAMA_PROXY_URL;
      options = {
        baseURL,
      };
      break;
    }
    case ModelProvider.Perplexity: {
      const { PERPLEXITY_API_KEY } = getServerConfig();
      const apiKey = apiKeyManager.pick(payload?.apiKey || PERPLEXITY_API_KEY);
      options = {
        apiKey,
      };
      break;
    }
    case ModelProvider.Anthropic: {
      const { ANTHROPIC_API_KEY, ANTHROPIC_PROXY_URL } = getServerConfig();
      const apiKey = apiKeyManager.pick(payload?.apiKey || ANTHROPIC_API_KEY);
      const baseURL = payload?.endpoint || ANTHROPIC_PROXY_URL;
      options = {
        apiKey,
        baseURL,
      };
      break;
    }
    case ModelProvider.Mistral: {
      const { MISTRAL_API_KEY } = getServerConfig();
      const apiKey = apiKeyManager.pick(payload?.apiKey || MISTRAL_API_KEY);
      options = {
        apiKey,
      };
      break;
    }
    case ModelProvider.Groq: {
      const { GROQ_API_KEY } = getServerConfig();
      const apiKey = apiKeyManager.pick(payload?.apiKey || GROQ_API_KEY);
      options = {
        apiKey,
      };
      break;
    }
    case ModelProvider.OpenRouter: {
      const { OPENROUTER_API_KEY } = getServerConfig();
      const apiKey = apiKeyManager.pick(payload?.apiKey || OPENROUTER_API_KEY);
      options = {
        apiKey,
      };
      break;
    }
    case ModelProvider.TogetherAI: {
      const { TOGETHERAI_API_KEY } = getServerConfig();
      const apiKey = apiKeyManager.pick(payload?.apiKey || TOGETHERAI_API_KEY);
      options = {
        apiKey,
      };
      break;
    }
    case ModelProvider.ZeroOne: {
      const { ZEROONE_API_KEY } = getServerConfig();
      const apiKey = apiKeyManager.pick(payload?.apiKey || ZEROONE_API_KEY);
      options = {
        apiKey,
      };
      break;
    }
  }
  console.log('provider:', provider, options);
  return options;
};

export const initializeWithUserPayload = (provider: string, payload: JWTPayload) => {
  return AgentRuntimeLib.initializeWithProviderOptions(provider, {
    [provider]: getLlmOptionsFromPayload(provider, payload),
  });
};

export default AgentRuntime;
