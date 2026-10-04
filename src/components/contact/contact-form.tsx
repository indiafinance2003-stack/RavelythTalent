"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { initialFormState } from "@/lib/form-state";
import { submitContactMessageAction } from "@/lib/contact/actions";

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContactMessageAction, initialFormState);
  return (
    <form action={action} className="space-y-4">
      {state.message ? (
        <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="contact-name" required>
          <Input id="contact-name" name="name" maxLength={120} autoComplete="name" required />
        </Field>
        <Field label="Email" htmlFor="contact-email" required>
          <Input id="contact-email" name="email" type="email" maxLength={254} autoComplete="email" required />
        </Field>
        <Field label="Phone (optional)" htmlFor="contact-phone">
          <Input id="contact-phone" name="phone" maxLength={40} autoComplete="tel" />
        </Field>
        <Field label="Subject (optional)" htmlFor="contact-subject">
          <Input id="contact-subject" name="subject" maxLength={180} />
        </Field>
      </div>
      <Field label="Message" htmlFor="contact-message" hint="Please enter between 20 and 5,000 characters." required>
        <Textarea id="contact-message" name="message" minLength={20} maxLength={5000} required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
