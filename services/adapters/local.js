// services/adapters/local.js
// Adaptadores para modelos locales (Ollama / LM Studio). Se usan como
// último respaldo cuando ningún proveedor en la nube responde.
export async function callOllama(model, history, systemExtra = '') {
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
  const messages = systemExtra
    ? [{ role: 'system', content: systemExtra }, ...history.map(m => ({ role: m.role, content: m.content }))]
    : history.map(m => ({ role: m.role, content: m.content }));

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  });

  if (!res.ok) {
    const err = new Error(`Ollama HTTP ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data.message?.content || '';
  const tokens = data.eval_count || Math.ceil(text.length / 4);
  return { text, tokens };
}

export async function callLMStudio(history, systemExtra = '') {
  const LMS_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234';
  const messages = systemExtra
    ? [{ role: 'system', content: systemExtra }, ...history.map(m => ({ role: m.role, content: m.content }))]
    : history.map(m => ({ role: m.role, content: m.content }));

  const res = await fetch(`${LMS_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'local', messages, temperature: 0.7 }),
  });

  if (!res.ok) {
    const err = new Error(`LM Studio HTTP ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const tokens = data.usage?.total_tokens || Math.ceil(text.length / 4);
  return { text, tokens };
}

export default { callOllama, callLMStudio };
