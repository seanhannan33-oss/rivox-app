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
