import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/errors';
import { getFinancialData } from '@/lib/plaidData';
import { buildFinancialContext } from '@/lib/financialContext';

// Groq's free tier: OpenAI-compatible API, no credit card needed. Get a key at console.groq.com/keys
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const MAX_HISTORY = 12;

const SYSTEM_PROMPT = `You are the built-in assistant for Moneta, a private personal finance dashboard used by one person to look at their own accounts.
Answer questions about their spending, income, accounts and investments using ONLY the data snapshot below. If the data doesn't contain the answer, say so plainly.
Guidelines:
- Be concise and specific: cite actual numbers, merchants, dates and percentages from the data.
- Do the math carefully. In transactions, positive amounts are money out and negative amounts are money in. Transactions tagged [not spending] (transfers between their own accounts, card payments and other transfers the user excluded) must not be counted as spending.
- Format with short paragraphs, **bold** for key figures, and "-" bullet lists. Do not use tables.
- You can point out patterns, risks and ideas (e.g. recurring charges, concentration in one stock, high card utilization), but remind them briefly that this is general information, not professional financial advice, when recommending actions.`;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function isChatMessage(m: unknown): m is ChatMessage {
  const msg = m as Partial<ChatMessage> | null;
  return (msg?.role === 'user' || msg?.role === 'assistant') && typeof msg.content === 'string';
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'NO_KEY' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const messages: ChatMessage[] = Array.isArray(body?.messages)
    ? (body.messages as unknown[])
      .filter(isChatMessage)
      .slice(-MAX_HISTORY)
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))
    : [];
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Send at least one user message.' }, { status: 400 });
  }

  let context: string;
  try {
    context = buildFinancialContext(await getFinancialData());
  } catch (e) {
    return NextResponse.json({ error: `Couldn't load your financial data: ${errorMessage(e)}` }, { status: 500 });
  }

  const upstream = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      temperature: 0.3,
      // gpt-oss is a reasoning model; reasoning tokens count toward the free tier's per-minute limit
      reasoning_effort: 'low',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\n# Data snapshot\n${context}` },
        ...messages,
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error('Groq error', upstream.status, detail);
    const error = upstream.status === 429
      ? 'The free AI limit was hit. Wait about a minute and try again.'
      : upstream.status === 401
        ? 'The GROQ_API_KEY was rejected. Check that it is correct.'
        : `The AI service returned an error (${upstream.status}).`;
    return NextResponse.json({ error }, { status: 502 });
  }

  // Convert Groq's server-sent events into a plain text stream of the reply
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  const stream = upstream.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const payload = line.trim();
        if (!payload.startsWith('data:')) continue;
        const json = payload.slice(5).trim();
        if (json === '[DONE]') continue;
        try {
          const delta = JSON.parse(json).choices?.[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        } catch {
          // Ignore keep-alive or partial lines
        }
      }
    },
  }));

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
