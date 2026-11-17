/** Web Share on touch devices, clipboard elsewhere. Resolves to what happened. */
export async function shareOrCopy(data: { text: string; url?: string; title?: string }): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const text = data.url && !data.text.includes(data.url) ? `${data.text}\n${data.url}` : data.text;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    /* fall through */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.className = 'visually-hidden';
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok ? 'copied' : 'failed';
}
