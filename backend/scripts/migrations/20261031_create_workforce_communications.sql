-- In-app upward communication for organization workforce roles.
-- Apply with the project's normal migration procedure before deploying the UI.
CREATE TABLE IF NOT EXISTS public.workforce_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject varchar(160) NOT NULL,
  created_by_user_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workforce_conversations_distinct_participants CHECK (created_by_user_id <> recipient_user_id),
  CONSTRAINT workforce_conversations_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT workforce_conversations_creator_org_fk FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES public.users (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT workforce_conversations_recipient_org_fk FOREIGN KEY (organization_id, recipient_user_id)
    REFERENCES public.users (organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.workforce_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz NULL,
  read_at timestamptz NULL,
  CONSTRAINT workforce_messages_conversation_org_fk FOREIGN KEY (organization_id, conversation_id)
    REFERENCES public.workforce_conversations (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT workforce_messages_sender_org_fk FOREIGN KEY (organization_id, sender_user_id)
    REFERENCES public.users (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS workforce_conversations_org_last_message_idx
  ON public.workforce_conversations (organization_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS workforce_conversations_created_by_idx
  ON public.workforce_conversations (created_by_user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS workforce_conversations_recipient_idx
  ON public.workforce_conversations (recipient_user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS workforce_messages_conversation_created_idx
  ON public.workforce_messages (conversation_id, created_at, id);

CREATE INDEX IF NOT EXISTS workforce_messages_unread_idx
  ON public.workforce_messages (organization_id, sender_user_id, read_at)
  WHERE read_at IS NULL;
