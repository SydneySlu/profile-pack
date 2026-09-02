import { z } from "zod";
import type { ProfileObservation } from "./types.js";

export interface ExtractedObservation {
  scope: string;
  dimension: string;
  value: string;
  statement: string;
  confidence: number;
  evidence?: string;
}

export type LlmProvider = "openai-compatible" | "ollama";

export interface ExtractorConfig {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
  allowRemote: boolean;
}

const observationSchema = z.object({
  scope: z.string().min(1),
  dimension: z.string().min(1),
  value: z.string().min(1),
  statement: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.string().optional()
});
const responseSchema = z.object({ observations: z.array(observationSchema) });

export function parseObservationResponse(raw: string): ExtractedObservation[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); } catch { throw new Error("LLM returned invalid JSON; no profile changes were made"); }
  if (Array.isArray(parsed)) return z.array(observationSchema).parse(parsed);
  return responseSchema.parse(parsed).observations;
}

export class ProfileExtractor {
  constructor(private readonly config: ExtractorConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  async extract(transcript: string, defaultScope: string): Promise<ExtractedObservation[]> {
    if (!transcript.trim()) return [];
    if (this.config.provider === "openai-compatible" && !this.config.allowRemote && !isLocalUrl(this.config.baseUrl)) throw new Error("Remote profile extraction is disabled. Set PROFILE_PACK_ALLOW_REMOTE_EXTRACTION=true only after confirming transcript sharing.");
    const prompt = buildExtractionPrompt(transcript.slice(0, 16000), defaultScope);
    const content = this.config.provider === "ollama" ? await this.callOllama(prompt) : await this.callOpenAI(prompt);
    return parseObservationResponse(content);
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}) }, body: JSON.stringify({ model: this.config.model, temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "system", content: "You extract conservative, non-sensitive user preferences from conversations." }, { role: "user", content: prompt }] }) });
    if (!response.ok) throw new Error(`OpenAI-compatible provider returned HTTP ${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI-compatible provider returned no message content");
    return content;
  }

  private async callOllama(prompt: string): Promise<string> {
    const response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: this.config.model, stream: false, format: "json", messages: [{ role: "system", content: "You extract conservative, non-sensitive user preferences from conversations." }, { role: "user", content: prompt }] }) });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const body = await response.json() as { message?: { content?: string } };
    const content = body.message?.content;
    if (!content) throw new Error("Ollama returned no message content");
    return content;
  }
}

export function createExtractorFromEnv(env = process.env): ProfileExtractor {
  const provider = (env.PROFILE_PACK_LLM_PROVIDER ?? "ollama") as LlmProvider;
  if (provider === "ollama") return new ProfileExtractor({ provider, baseUrl: env.PROFILE_PACK_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434", model: env.PROFILE_PACK_OLLAMA_MODEL ?? "llama3.2", allowRemote: true });
  if (provider === "openai-compatible") return new ProfileExtractor({ provider, baseUrl: env.PROFILE_PACK_OPENAI_BASE_URL ?? "https://api.openai.com/v1", model: env.PROFILE_PACK_OPENAI_MODEL ?? "gpt-4o-mini", apiKey: env.PROFILE_PACK_OPENAI_API_KEY, allowRemote: env.PROFILE_PACK_ALLOW_REMOTE_EXTRACTION === "true" });
  throw new Error(`Unsupported PROFILE_PACK_LLM_PROVIDER: ${provider}`);
}

export function observationsToInput(observation: ExtractedObservation, agentId: string): Omit<ProfileObservation, "observationId" | "createdAt"> {
  return { ...observation, agentId };
}

function buildExtractionPrompt(transcript: string, defaultScope: string): string {
  return `Analyze this conversation only for repeated, useful user preferences or working tendencies. Do not infer health, politics, religion, protected traits, diagnoses, MBTI, nationality, or other sensitive identity attributes. Do not store one-off emotions or facts unless they are clearly relevant preferences. Return JSON only in the shape {"observations":[{"scope":"${defaultScope}","dimension":"short_snake_case_dimension","value":"short_value","statement":"自然、简洁的中文特质描述","confidence":0.0,"evidence":"简短证据"}]}. Use confidence below 0.7 when evidence is weak. If there is no stable observation, return {"observations":[]}.\n\nConversation:\n${transcript}`;
}

function isLocalUrl(baseUrl: string): boolean { try { const host = new URL(baseUrl).hostname; return host === "127.0.0.1" || host === "localhost" || host === "::1"; } catch { return false; } }
