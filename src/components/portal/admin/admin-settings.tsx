'use client';

import { useState } from 'react';
import { portalGet, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { formatDateTime, titleCase } from '@/lib/portal-client/format';
import { useAsync } from '@/lib/portal-client/use-async';
import {
  Alert,
  Button,
  Card,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  inputClass,
  labelClass,
} from '@/components/portal/ui';

/**
 * How each platform setting should be edited, and what it actually does.
 *
 * The key list comes from the server so the form cannot offer a setting the
 * platform does not read, and this map only supplies the presentation and an
 * honest description. A setting with no entry here is rendered read-only rather
 * than guessed at, because writing a value in the wrong shape (a string where a
 * boolean is read, say) would be a silent no-op that looks like a success.
 */
const SETTING_EDITOR: Record<
  string,
  { label: string; kind: 'boolean' | 'number' | 'text'; description: string }
> = {
  job_approval_required: {
    label: 'Review job postings before they go live',
    kind: 'boolean',
    description:
      'When on, a new posting is held for an administrator to approve. Turning this off makes postings public the moment they are submitted, so use it deliberately.',
  },
  job_credit_required: {
    label: 'Require a job credit to post',
    kind: 'boolean',
    description:
      'When on, an employer spends a credit to publish. Turning it off makes posting free, which is a commercial decision as well as a technical one.',
  },
  job_default_validity_days: {
    label: 'Default job validity (days)',
    kind: 'number',
    description: 'How long a new posting stays live before it expires.',
  },
  require_verified_email_to_apply: {
    label: 'Require a verified email to apply',
    kind: 'boolean',
    description:
      'When on, an unverified candidate cannot submit an application. This is an abuse control: leaving it off allows applications from throwaway addresses.',
  },
  platform_announcement: {
    label: 'Announcement banner',
    kind: 'text',
    description: 'Shown across the public site. Leave empty to show nothing.',
  },
};

/** Renders a stored JSONB value for editing. */
function toInput(value: unknown, kind: 'boolean' | 'number' | 'text'): string {
  if (kind === 'boolean') return value === true || value === 'true' ? 'true' : 'false';
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Converts the edited string back to the shape the reader expects. */
function fromInput(raw: string, kind: 'boolean' | 'number' | 'text'): unknown {
  if (kind === 'boolean') return raw === 'true';
  if (kind === 'number') {
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return raw.trim().length === 0 ? '' : raw.trim();
}

/**
 * Platform settings.
 *
 * A setting here changes how the platform behaves for everyone, so every write
 * is audited and the screen re-reads the stored values after saving rather than
 * echoing the input back. If a value was coerced or rejected on the way in, this
 * shows what was actually kept.
 *
 * None of these are security controls. Anything that gated access would be a way
 * to turn that control off from a browser, so authentication and authorisation
 * are fixed in code and not configurable here.
 */
export function AdminSettings(): React.ReactElement {
  const settings = useAsync(
    () =>
      portalGet<{
        items: Array<{ key: string; value: unknown; updatedAt: string }>;
        keys: string[];
      }>('/api/portal/admin/settings'),
    []
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (settings.loading) return <LoadingState label="Loading platform settings…" />;
  if (settings.error) {
    return <ErrorState message={settings.error} onRetry={settings.reload} />;
  }

  const stored = new Map((settings.data?.items ?? []).map((row) => [row.key, row]));
  const keys = settings.data?.keys ?? [];

  async function save(key: string, kind: 'boolean' | 'number' | 'text'): Promise<void> {
    setError(null);
    setMessage(null);

    setBusyKey(key);
    try {
      await portalSend('PUT', '/api/portal/admin/settings', {
        key,
        value: fromInput(values[key] ?? '', kind),
      });
      await settings.reload();
      setValues((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setMessage('Setting saved.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Platform settings"
        description="Behaviour that applies to everyone. Every change is audited, and none of these are security controls."
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      {keys.map((key) => {
        const editor = SETTING_EDITOR[key];
        const row = stored.get(key);

        // A key with no known editor is shown but not editable, so an
        // unrecognised setting can never be written in the wrong shape.
        if (!editor) {
          return (
            <Card key={key}>
              <div className="space-y-1 p-5">
                <h3 className="text-sm font-semibold text-ink">{titleCase(key)}</h3>
                <p className="text-sm text-slate-400">
                  {row ? JSON.stringify(row.value) : 'Not set'}
                </p>
                <p className="text-xs text-slate-600">
                  This console does not know how to edit this setting, so it is shown read-only.
                </p>
              </div>
            </Card>
          );
        }

        const current = values[key] ?? toInput(row?.value, editor.kind);

        return (
          <Card key={key}>
            <div className="space-y-3 p-5">
              <div>
                <h3 className="text-sm font-semibold text-ink">{editor.label}</h3>
                <p className="mt-1 text-sm text-slate-400">{editor.description}</p>
              </div>

              {editor.kind === 'boolean' ? (
                <div>
                  <label className={labelClass} htmlFor={`set-${key}`}>
                    Current value
                  </label>
                  <select
                    id={`set-${key}`}
                    className={inputClass}
                    value={current}
                    onChange={(event) => setValues((state) => ({ ...state, [key]: event.target.value }))}
                  >
                    <option value="true">On</option>
                    <option value="false">Off</option>
                  </select>
                </div>
              ) : (
                <Field
                  label={editor.kind === 'number' ? 'Value' : 'Text'}
                  htmlFor={`set-${key}`}
                >
                  <input
                    id={`set-${key}`}
                    className={inputClass}
                    inputMode={editor.kind === 'number' ? 'numeric' : undefined}
                    value={current}
                    onChange={(event) => setValues((state) => ({ ...state, [key]: event.target.value }))}
                  />
                </Field>
              )}

              {row ? (
                <p className="text-xs text-slate-600">Last changed {formatDateTime(row.updatedAt)}</p>
              ) : (
                <p className="text-xs text-slate-600">
                  Not set yet — the platform is using its built-in default.
                </p>
              )}

              <Button
                size="sm"
                loading={busyKey === key}
                onClick={() => save(key, editor.kind)}
              >
                Save {titleCase(key)}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

