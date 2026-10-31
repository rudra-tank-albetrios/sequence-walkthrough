'use client';

import { useState } from 'react';

import { placeOrder } from '../lib/api-client';

export function CheckoutForm() {
  const [message, setMessage] = useState('');

  async function submit(form: FormData) {
    const reply = await placeOrder(String(form.get('code')), Number(form.get('units')));
    setMessage(reply.ok ? 'Thank you' : 'Please try again');
  }

  return (
    <form action={submit}>
      <input name="code" />
      <input name="units" type="number" />
      <button>Place order</button>
      <p>{message}</p>
    </form>
  );
}
