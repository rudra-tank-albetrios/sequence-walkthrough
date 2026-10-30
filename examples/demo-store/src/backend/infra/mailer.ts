// Mail stand-in: records every mail instead of sending it; an optional sink sees each one.

export interface SentMail {
  to: string;
  subject: string;
  text: string;
}

export type MailSink = (mail: SentMail) => void;

export class Mailer {
  readonly sent: SentMail[] = [];
  private readonly sink: MailSink | undefined;

  constructor(sink?: MailSink) {
    this.sink = sink;
  }

  send(to: string, subject: string, text: string): SentMail {
    const mail: SentMail = { to, subject, text };
    this.sent.push(mail);
    this.sink?.(mail);
    return mail;
  }
}
