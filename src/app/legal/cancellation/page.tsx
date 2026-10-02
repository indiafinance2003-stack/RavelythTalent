import type { Metadata } from 'next';
import { Clause, LegalDocument, List } from '@/components/legal/legal-document';

export const metadata: Metadata = {
  title: 'Cancellation and refunds | Ravelyth Talent',
  description:
    'When credits and premium subscriptions can be cancelled, when they cannot be refunded, and what we do if something goes wrong.',
  alternates: { canonical: '/legal/cancellation' },
};

export default function Page(): React.ReactElement {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Cancellation and refunds"
      summary="Job credits and premium subscriptions are sold once they are granted. This page says exactly when that is, and what happens if we get something wrong."
      version="v1"
      effectiveFrom="1 October 2024"
    >
      <Clause id="1" heading="Credits are granted when payment is confirmed">
        <p>
          A purchase does not grant credits the moment you click pay. Credits appear on your balance
          only after the payment provider confirms to our servers that the money arrived. If a payment
          fails, is reversed, or never completes, no credits are granted and no balance changes.
        </p>
        <p>
          If you have paid and your credits have not appeared, do not buy again. Contact us with your
          order number and we will check it against the payment provider’s record.
        </p>
      </Clause>

      <Clause id="2" heading="Job credits cannot be refunded once used">
        <p>
          Job credits are consumed when a posting is published. A credit that has already been spent on
          a live vacancy cannot be returned, because the posting it paid for is live and visible to
          candidates.
        </p>
        <p>
          You must accept the non-refundable terms at the point of purchase. That acknowledgement is
          recorded against your order, and it is the reason an order shows whether the terms were
          accepted — if it is missing from an order, tell us, because that is a fault on our side and
          we will correct it.
        </p>
      </Clause>

      <Clause id="3" heading="Unused credits">
        <List
          items={[
            'Unused credits remain on your balance until they expire. The expiry date is shown in your credit history, and credits are used oldest-first.',
            'Closing your account does not refund unused credits, and does not extend their expiry.',
            'Credits cannot be transferred to another company or another account.',
          ]}
        />
      </Clause>

      <Clause id="4" heading="When we do refund">
        <p>
          We refund or replace in these cases, regardless of the non-refundable terms:
        </p>
        <List
          items={[
            'We removed a posting for a policy breach and you ask for the credit back.',
            'A payment was taken but the order was never created, or the credits were never granted.',
            'You were charged twice for the same order.',
            'A service we sold you is unavailable for a sustained period.',
          ]}
        />
        <p>
          Refunds go back to the original payment method. The provider, not Ravelyth, decides how
          quickly the money appears on your statement.
        </p>
      </Clause>

      <Clause id="5" heading="Premium subscriptions">
        <p>
          A premium subscription runs for the period you bought and can be cancelled before it renews.
          Cancelling stops the renewal; it does not shorten or refund the period you have already paid
          for, and the features stay available until that period ends.
        </p>
        <p>
          Premium is only ever activated by a confirmed payment. It cannot be granted by support staff,
          by an administrator, or by anyone else inside Ravelyth, so if your premium is not active the
          payment has not completed.
        </p>
      </Clause>

      <Clause id="6" heading="Withdrawing a posting">
        <p>
          An employer can withdraw a posting at any time. Withdrawal does not return the credit that
          paid for it, because the posting was live while the credit was spent. A rejected posting
          that was never published is handled under clause 4.
        </p>
      </Clause>

      <Clause id="7" heading="Contacting us">
        <p>
          Keep your order number. It appears in your purchase history and is the reference we use with
          the payment provider. Raising a refund request does not extend or pause credit expiry while
          we look into it.
        </p>
      </Clause>
    </LegalDocument>
  );
}
