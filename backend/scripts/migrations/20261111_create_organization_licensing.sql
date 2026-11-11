-- Organization licensing and manual payment verification.
-- Existing organizations receive a one-time 30-day transition grace period.
-- New organizations must be given a NOT_ACTIVATED license by the organization
-- creation workflow added in a later implementation step.
--
-- This migration deliberately does not modify organizations.status. Administrative
-- status (ACTIVE/SUSPENDED/ARCHIVED/PENDING_SETUP) remains independent of licensing.

BEGIN;

-- Payment submissions are retained as an auditable history. Proof images are
-- stored privately in the database; retrieval will be restricted by API access
-- checks in a later implementation step.
CREATE TABLE IF NOT EXISTS public.organization_payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  submitted_by_user_id uuid NOT NULL,
  amount numeric(14, 2) NOT NULL,
  currency_code character(3) NOT NULL,
  transaction_reference varchar(120),
  proof_image bytea NOT NULL,
  proof_image_mime_type varchar(32) NOT NULL,
  proof_image_filename varchar(255),
  status varchar(20) NOT NULL DEFAULT 'PENDING_REVIEW',
  rejection_reason varchar(1000),
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT organization_payment_submissions_org_id_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT organization_payment_submissions_org_fk
    FOREIGN KEY (organization_id)
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  CONSTRAINT organization_payment_submissions_submitter_org_fk
    FOREIGN KEY (organization_id, submitted_by_user_id)
    REFERENCES public.users (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT organization_payment_submissions_reviewer_fk
    FOREIGN KEY (reviewed_by_user_id)
    REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT organization_payment_submissions_amount_check
    CHECK (amount > 0),
  CONSTRAINT organization_payment_submissions_currency_check
    CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT organization_payment_submissions_proof_size_check
    CHECK (octet_length(proof_image) BETWEEN 1 AND 5242880),
  CONSTRAINT organization_payment_submissions_proof_mime_check
    CHECK (proof_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT organization_payment_submissions_status_check
    CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
  CONSTRAINT organization_payment_submissions_review_state_check
    CHECK (
      (status = 'PENDING_REVIEW'
        AND reviewed_by_user_id IS NULL
        AND reviewed_at IS NULL
        AND rejection_reason IS NULL)
      OR
      (status = 'APPROVED'
        AND reviewed_by_user_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND rejection_reason IS NULL)
      OR
      (status = 'REJECTED'
        AND reviewed_by_user_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND rejection_reason IS NOT NULL
        AND length(btrim(rejection_reason)) BETWEEN 1 AND 1000)
    )
);

-- Only one payment may await review for an organization at a time. A rejected
-- submission can be followed by a new submission; approved history is retained.
CREATE UNIQUE INDEX IF NOT EXISTS organization_payment_one_pending_per_org_idx
  ON public.organization_payment_submissions (organization_id)
  WHERE status = 'PENDING_REVIEW';

CREATE INDEX IF NOT EXISTS organization_payment_submissions_org_created_idx
  ON public.organization_payment_submissions (organization_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS organization_payment_submissions_review_queue_idx
  ON public.organization_payment_submissions (created_at ASC, id ASC)
  WHERE status = 'PENDING_REVIEW';

CREATE INDEX IF NOT EXISTS organization_payment_submissions_reviewer_idx
  ON public.organization_payment_submissions (reviewed_by_user_id, reviewed_at DESC)
  WHERE reviewed_by_user_id IS NOT NULL;

-- One current license record per organization. Expiry is enforced by comparing
-- expires_at with database time; status may be materialized as EXPIRED by the
-- licensing service without changing the organization's administrative status.
CREATE TABLE IF NOT EXISTS public.organization_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE,
  status varchar(20) NOT NULL DEFAULT 'NOT_ACTIVATED',
  activation_source varchar(20) NOT NULL DEFAULT 'NONE',
  starts_at timestamptz,
  expires_at timestamptz,
  last_approved_payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT organization_licenses_org_id_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT organization_licenses_org_fk
    FOREIGN KEY (organization_id)
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  CONSTRAINT organization_licenses_status_check
    CHECK (status IN ('NOT_ACTIVATED', 'ACTIVE', 'EXPIRED')),
  CONSTRAINT organization_licenses_activation_source_check
    CHECK (activation_source IN ('NONE', 'LEGACY_GRACE', 'PAYMENT')),
  CONSTRAINT organization_licenses_period_check
    CHECK (
      (status = 'NOT_ACTIVATED'
        AND activation_source = 'NONE'
        AND starts_at IS NULL
        AND expires_at IS NULL
        AND last_approved_payment_id IS NULL)
      OR
      (status IN ('ACTIVE', 'EXPIRED')
        AND activation_source IN ('LEGACY_GRACE', 'PAYMENT')
        AND starts_at IS NOT NULL
        AND expires_at IS NOT NULL
        AND expires_at > starts_at
        AND (
          (activation_source = 'LEGACY_GRACE' AND last_approved_payment_id IS NULL)
          OR
          (activation_source = 'PAYMENT' AND last_approved_payment_id IS NOT NULL)
        ))
    ),
  CONSTRAINT organization_licenses_last_payment_fk
    FOREIGN KEY (organization_id, last_approved_payment_id)
    REFERENCES public.organization_payment_submissions (organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS organization_licenses_status_expiry_idx
  ON public.organization_licenses (status, expires_at);

CREATE INDEX IF NOT EXISTS organization_licenses_expiry_idx
  ON public.organization_licenses (expires_at)
  WHERE expires_at IS NOT NULL;

-- Backfill every organization that exists when this migration is applied.
-- The fixed timestamp is generated once for this statement, so all legacy
-- organizations receive the same transition window. ON CONFLICT prevents a
-- rerun from resetting an organization's grace period or paid license.
INSERT INTO public.organization_licenses (
  organization_id,
  status,
  activation_source,
  starts_at,
  expires_at
)
SELECT
  o.id,
  'ACTIVE',
  'LEGACY_GRACE',
  migration_clock.started_at,
  migration_clock.started_at + interval '30 days'
FROM public.organizations AS o
CROSS JOIN (SELECT transaction_timestamp() AS started_at) AS migration_clock
ON CONFLICT (organization_id) DO NOTHING;

COMMENT ON TABLE public.organization_licenses IS
  'One current subscription license per organization. Administrative organization status is stored separately.';

COMMENT ON COLUMN public.organization_licenses.activation_source IS
  'NONE for unactivated licenses, LEGACY_GRACE for the one-time migration grace period, or PAYMENT for verified payment activation.';

COMMENT ON TABLE public.organization_payment_submissions IS
  'Private organization payment proofs and immutable review history for manual Super Admin verification.';

COMMENT ON COLUMN public.organization_payment_submissions.proof_image IS
  'Private JPEG, PNG, or WebP payment proof; maximum size 5 MiB.';

COMMIT;
