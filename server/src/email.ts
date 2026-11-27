export interface EmailSender {
  sendCode(to: string, code: string): Promise<void>;
}

/** Development only. Prints the code to the server log; sends nothing. */
export class ConsoleEmailSender implements EmailSender {
  async sendCode(to: string, code: string) {
    console.log(`[dev email] sign-in code for ${to}: ${code}`);
  }
}

export const CODE_EMAIL_SUBJECT = "Your Rivox code";

export function codeEmailText(code: string): string {
  return [
    `Your Rivox sign-in code is ${code}.`,
    "",
    "It works for 10 minutes. If you didn't ask for it, ignore this email.",
  ].join("\n");
}

export function codeEmailHtml(code: string): string {
  return [
    '<div style="background:#071224;padding:32px 24px;font-family:Arial,Helvetica,sans-serif;color:#ffffff">',
    '<p style="font-size:14px;letter-spacing:1px;color:#A0AEC0;margin:0 0 8px">RIVOX LABS</p>',
    '<p style="font-size:16px;margin:0 0 16px">Your sign-in code:</p>',
    `<p style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#FFE500;margin:0 0 16px">${code}</p>`,
    '<p style="font-size:14px;color:#CBD5E0;margin:0">It works for 10 minutes. If you didn\'t ask for it, ignore this email.</p>',
    "</div>",
  ].join("");
}

type Fetch = typeof fetch;

/** Sends through Resend (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly doFetch: Fetch = fetch,
  ) {}

  async sendCode(to: string, code: string) {
    const res = await this.doFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: this.from,
        to: [to],
        subject: CODE_EMAIL_SUBJECT,
        text: codeEmailText(code),
        html: codeEmailHtml(code),
      }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Resend responded ${res.status} sending a sign-in code. ${detail}`);
    }
  }
}
