import type { RLModel, RLModelCreateInput } from '@/types/rlTrading'
import { createClient } from '@/lib/supabase/server'

const RL_SERVER_URL = process.env.RL_SERVER_URL ?? 'http://127.0.0.1:8001'
const RL_API_KEY = process.env.RL_API_KEY ?? ''

export const rlModelService = {
  async listForClinic(clinicId: string): Promise<{ data: RLModel[]; error: string | null }> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('rl_models')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
    if (error) return { data: [], error: error.message }
    return { data: (data ?? []) as RLModel[], error: null }
  },

  async create(
    input: RLModelCreateInput,
    userId: string,
    clinicId: string,
  ): Promise<{ data: RLModel | null; error: string | null }> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('rl_models')
      .insert({
        user_id: userId,
        clinic_id: clinicId,
        name: input.name,
        description: input.description ?? null,
        source: input.source,
        algorithm: input.algorithm,
        kind: input.kind,
        market: input.market ?? 'US',
        timeframe: input.timeframe ?? '1d',
        universe: input.universe ?? null,
        input_features: input.input_features,
        state_window: input.state_window,
        output_shape: input.output_shape,
        checkpoint_url: input.checkpoint_url,
        checkpoint_sha256: input.checkpoint_sha256,
        min_confidence: input.min_confidence ?? 0.6,
        status: 'pending',
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as RLModel, error: null }
  },

  async triggerDownload(modelId: string): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createClient()
    const { data: model, error } = await supabase
      .from('rl_models')
      .select('*')
      .eq('id', modelId)
      .single()
    if (error || !model) return { success: false, error: error?.message ?? 'not found' }

    await supabase.from('rl_models').update({ status: 'downloading' }).eq('id', modelId)

    try {
      const resp = await fetch(`${RL_SERVER_URL}/models/download`, {
        method: 'POST',
        headers: { 'X-RL-API-KEY': RL_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          model_id: modelId,
          checkpoint_url: model.checkpoint_url,
          checkpoint_sha256: model.checkpoint_sha256,
        }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        await supabase
          .from('rl_models')
          .update({ status: 'failed', failure_reason: text })
          .eq('id', modelId)
        return { success: false, error: text }
      }
      const json = (await resp.json()) as { path?: string }
      if (!json.path) {
        await supabase
          .from('rl_models')
          .update({
            status: 'failed',
            failure_reason: 'rl-inference-server response missing path field',
          })
          .eq('id', modelId)
        return { success: false, error: 'rl-inference-server response missing path field' }
      }
      await supabase
        .from('rl_models')
        .update({ status: 'ready', checkpoint_path: json.path })
        .eq('id', modelId)
      return { success: true, error: null }
    } catch (err) {
      const msg = (err as Error).message
      await supabase
        .from('rl_models')
        .update({ status: 'failed', failure_reason: msg })
        .eq('id', modelId)
      return { success: false, error: msg }
    }
  },

  async archive(modelId: string, userId: string): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createClient()
    // 1) Deactivate strategies referencing this model
    await supabase
      .from('investment_strategies')
      .update({ is_active: false })
      .eq('rl_model_id', modelId)
      .eq('user_id', userId)
    // 2) Mark archived
    const { error } = await supabase
      .from('rl_models')
      .update({ status: 'archived' })
      .eq('id', modelId)
      .eq('user_id', userId)
    if (error) return { success: false, error: error.message }
    return { success: true, error: null }
  },
}
