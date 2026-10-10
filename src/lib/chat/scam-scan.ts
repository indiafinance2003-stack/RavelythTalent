export function containsPaymentRequest(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(pay to apply|pay to get|registration fee|security deposit|training fee|kit charges?|processing fee|application fee|agent fee|advance fee|upfront payment|pay.{0,10}money|money transfer|upi id.*pay|send money)\b/.test(t) ||
    /\b(buy kit|purchase material|pay for form)\b/.test(t)
  );
}

export function chatMessageFlagsPayment(message: string): boolean {
  return containsPaymentRequest(message);
}