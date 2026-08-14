-- ============================================================
-- 010_chat.sql
-- Historial de conversaciones del chat IA
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Tabla: chat_conversations
-- Una conversación = un padre hablando sobre un niño específico
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.chat_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT,             -- Título generado automáticamente por IA (opcional)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_conversations_child_idx ON public.chat_conversations (child_id);
CREATE INDEX chat_conversations_user_idx ON public.chat_conversations (user_id);
CREATE INDEX chat_conversations_user_date_idx ON public.chat_conversations (user_id, updated_at DESC);

-- ────────────────────────────────────────────────────────────
-- Tabla: chat_messages
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.chat_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT NOT NULL,

  -- Metadata útil: tokens usados, modelo, sources del RAG usados, etc.
  metadata          JSONB NOT NULL DEFAULT '{}'
                    CHECK (jsonb_typeof(metadata) = 'object'),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_conversation_idx ON public.chat_messages (conversation_id);
CREATE INDEX chat_messages_conv_date_idx ON public.chat_messages (conversation_id, created_at);

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Admin: ver todas las conversaciones
CREATE POLICY chat_conv_admin_all ON public.chat_conversations
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY chat_msg_admin_all ON public.chat_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users: solo sus propias conversaciones
CREATE POLICY chat_conv_own ON public.chat_conversations
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY chat_msg_own ON public.chat_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations cc
      WHERE cc.id = chat_messages.conversation_id
        AND cc.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- Trigger: updated_at para chat_conversations
-- ────────────────────────────────────────────────────────────
CREATE TRIGGER chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────
-- Trigger: actualizar updated_at de conversación al insertar mensaje
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_messages_touch_conversation
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_on_message();
