-- Direct support channel between Organization Admins and the Platform Super Admin.
-- Apply using the project's normal migration procedure before deploying the support UI.
CREATE TABLE IF NOT EXISTS public.platform_support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL,
  super_admin_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  subject varchar(160) NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 160),
  status varchar(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_support_conversations_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT platform_support_conversations_creator_org_fk
    FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES public.users (organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.platform_support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz NULL,
  read_at timestamptz NULL,
  CONSTRAINT platform_support_messages_conversation_org_fk
    FOREIGN KEY (organization_id, conversation_id)
    REFERENCES public.platform_support_conversations (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS platform_support_conversations_org_last_message_idx
  ON public.platform_support_conversations (organization_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS platform_support_conversations_last_message_idx
  ON public.platform_support_conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS platform_support_messages_conversation_created_idx
  ON public.platform_support_messages (conversation_id, created_at, id);
CREATE INDEX IF NOT EXISTS platform_support_messages_unread_idx
  ON public.platform_support_messages (organization_id, sender_user_id, read_at)
  WHERE read_at IS NULL;
