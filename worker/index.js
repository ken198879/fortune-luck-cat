// Cloudflare Worker: プロンプト/画像から画像を生成する管理者専用API
// POST /  { prompt: string, image?: dataURL(PNG/JPEG), strength?: 0-1 }
// Header: Authorization: Bearer <ADMIN_TOKEN>
// 返り値: { image: "data:image/png;base64,...", model, prompt_en }

const T2I = '@cf/black-forest-labs/flux-1-schnell';
const I2I = '@cf/runwayml/stable-diffusion-v1-5-img2img';
const TRANSLATE = '@cf/meta/m2m100-1.2b';
const MAX_IMAGE_BYTES = 1_500_000;

const cors = (env) => ({
  'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});
const json = (env, obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(env) } });

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromDataUrl(url) {
  const b64 = url.split(',')[1] || '';
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(env) });
    if (req.method !== 'POST') return json(env, { error: 'POST only' }, 405);

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!env.ADMIN_TOKEN || !safeEqual(token, env.ADMIN_TOKEN)) return json(env, { error: 'unauthorized' }, 401);

    let body;
    try { body = await req.json(); } catch { return json(env, { error: 'invalid JSON' }, 400); }
    const prompt = String(body.prompt || '').trim().slice(0, 1000);
    if (!prompt) return json(env, { error: 'prompt is required' }, 400);

    try {
      // 日本語など非ASCIIが含まれる場合は英訳する(モデルは英語が得意)
      let promptEn = prompt;
      if (/[^\x00-\x7F]/.test(prompt)) {
        const t = await env.AI.run(TRANSLATE, { text: prompt, source_lang: 'japanese', target_lang: 'english' });
        promptEn = t.translated_text || prompt;
      }

      if (!body.image) {
        const r = await env.AI.run(T2I, { prompt: promptEn, steps: 4 });
        return json(env, { image: `data:image/jpeg;base64,${r.image}`, model: T2I, prompt_en: promptEn });
      }

      const bytes = fromDataUrl(String(body.image));
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return json(env, { error: 'image too large or empty' }, 413);
      const strength = Math.min(1, Math.max(0.1, Number(body.strength) || 0.6));
      const out = await env.AI.run(I2I, { prompt: promptEn, image: [...bytes], strength, num_steps: 20 });
      const buf = await new Response(out).arrayBuffer();
      return json(env, { image: `data:image/png;base64,${toBase64(buf)}`, model: I2I, prompt_en: promptEn });
    } catch (e) {
      return json(env, { error: 'generation failed', detail: String(e && e.message || e) }, 502);
    }
  },
};
