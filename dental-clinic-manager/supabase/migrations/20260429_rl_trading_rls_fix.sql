-- ============================================
-- RL trading RLS hardening
-- - rl_models: enforce clinic_id ownership in WITH CHECK
-- - rl_inference_logs: restrict INSERT to own user_id
-- ============================================

DROP POLICY IF EXISTS "Users can manage own models" ON rl_models;
CREATE POLICY "Users can manage own models" ON rl_models
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Service can write logs" ON rl_inference_logs;
CREATE POLICY "Users can write own logs" ON rl_inference_logs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
