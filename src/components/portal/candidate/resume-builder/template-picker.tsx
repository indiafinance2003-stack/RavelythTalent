'use client';

import {
  RESUME_TEMPLATE_CODES,
  RESUME_TEMPLATE_LAYOUTS,
  type ResumeTemplateCode,
} from '@/lib/resume/template-layouts';
import { Badge, Card, CardHeader } from '@/components/portal/ui';

/**
 * The five-template picker.
 *
 * Every option is drawn from `RESUME_TEMPLATE_LAYOUTS` — the same layout data the
 * PDF renderer uses — so each card is a genuine miniature of the arrangement the
 * candidate will get: the sidebar ratio and fill, the header band, the accent
 * colour, and which sections move into the sidebar.
 *
 * A premium template is shown rather than hidden. Hiding the three paid layouts
 * would make the upgrade path invisible, and a candidate cannot judge whether one
 * is worth paying for without seeing what it does. The card states the price
 * requirement and stays locked; the server refuses it regardless of what this
 * component allows, because the check lives in the service.
 *
 * Nothing is rendered as HTML. Template metadata is server-seeded data, and it is
 * interpolated as text.
 */

function TemplateThumbnail({ code }: { code: ResumeTemplateCode }): React.ReactElement {
  const layout = RESUME_TEMPLATE_LAYOUTS[code];
  const hasSidebar = layout.sidebarRatio > 0;
  const sidebarWidth = `${Math.round(layout.sidebarRatio * 100)}%`;
  const accent = `#${layout.accent}`;

  return (
    <div
      aria-hidden="true"
      className="flex h-24 flex-col overflow-hidden rounded border border-line bg-white"
    >
      {layout.headerBand ? (
        <div className="h-5" style={{ backgroundColor: accent }} />
      ) : (
        <div className="h-px" style={{ backgroundColor: accent }} />
      )}

      <div className="flex flex-1 items-stretch gap-0.5 p-1">
        {hasSidebar ? (
          <div
            className="rounded-[1px]"
            style={{
              width: sidebarWidth,
              backgroundColor: layout.sidebarFill ? `#${layout.sidebarFill}` : '#f1f5f9',
            }}
          />
        ) : null}

        <div className="flex flex-1 flex-col gap-1 py-0.5">
          {/*
            The bar count mirrors the real sidebar routing, so "Modern" visibly
            shows fewer main-column blocks than "Classic".
          */}
          {Array.from({ length: hasSidebar ? 4 : 5 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-0.5">
              <div className="h-1 w-1/2 rounded-[1px]" style={{ backgroundColor: accent, opacity: 0.85 }} />
              <div className="h-[2px] w-full rounded-[1px] bg-slate-300" />
              <div
                className="h-[2px] rounded-[1px] bg-slate-200"
                style={{ width: `${70 + ((index * 13) % 30)}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TemplatePicker({
  selected,
  onSelect,
  canUsePremium,
  disabled,
}: {
  selected: ResumeTemplateCode;
  onSelect: (code: ResumeTemplateCode) => void;
  canUsePremium: boolean;
  disabled: boolean;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title="Template"
        description="Each template is a different arrangement, not a recolouring. Your choice is applied to the generated PDF."
      />
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {RESUME_TEMPLATE_CODES.map((code) => {
          const layout = RESUME_TEMPLATE_LAYOUTS[code];
          const locked = layout.isPremium && !canUsePremium;
          const isSelected = selected === code;

          return (
            <button
              key={code}
              type="button"
              // A locked template stays focusable and clickable so the candidate
              // can read WHY it is unavailable; it is not a disabled control that
              // silently does nothing when pressed.
              onClick={() => onSelect(code)}
              disabled={disabled}
              aria-pressed={isSelected}
              className={`flex flex-col gap-2 rounded-lg border p-3 text-left transition ${
                isSelected
                  ? 'border-accent bg-accent-tint'
                  : 'border-line hover:border-accent/60'
              } ${disabled ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-ink">{layout.name}</span>
                {layout.isPremium ? (
                  <Badge tone={locked ? 'bg-slate-700 text-slate-300' : 'bg-accent-tint text-accent-soft'}>
                    {locked ? 'Premium' : 'Premium ✓'}
                  </Badge>
                ) : (
                  <Badge tone="bg-slate-800 text-slate-400">Free</Badge>
                )}
              </div>

              <TemplateThumbnail code={code} />

              <p className="text-xs leading-relaxed text-slate-400">{layout.description}</p>

              <p className="text-[0.65rem] text-slate-500">
                {layout.sidebarRatio > 0
                  ? `Two columns, ${Math.round(layout.sidebarRatio * 100)}% sidebar`
                  : 'Single column'}
                {layout.headerBand ? ' · header band' : ''}
                {layout.density === 'compact' ? ' · dense' : ''}
              </p>

              {locked ? (
                <p className="text-[0.65rem] font-medium text-amber-300">
                  Needs a premium plan — pick a free template, or upgrade to use this.
                </p>
              ) : null}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
