export const prerender = false;
import type { APIRoute } from 'astro';
import scheduleData from '../../data/schedule.json';

export const GET: APIRoute = async () => {
  const months = scheduleData as any[];
  const month = months[0];
  if (!month) return new Response(JSON.stringify({ text: 'KARBON TV — 7/24 Yayın' }));

  const showMap: Record<string, any> = {};
  for (const s of month.shows) showMap[s.id] = s;

  const TYPE_ICONS: Record<string, string> = {
    OYUN: '🎮', MÜZİK: '🎵', YEMEK: '🍜', MEKAN: '📍', HABER: '📰', ÖZEL: '⭐',
  };

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentHour = now.getHours() * 60 + now.getMinutes();

  const todaySchedule = month.days.find((d: any) => d.date === todayStr);
  const slots = todaySchedule?.slots || [];

  // Find current and next show
  function timeToMin(t: string) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  let current: any = null;
  let next: any = null;

  for (let i = 0; i < slots.length; i++) {
    const slotMin = timeToMin(slots[i].time);
    const nextMin = slots[i + 1] ? timeToMin(slots[i + 1].time) : 1440;
    if (currentHour >= slotMin && currentHour < nextMin) {
      current = slots[i];
      next = slots[i + 1] || null;
      break;
    }
  }
  if (!current && slots.length > 0) {
    next = slots[0];
  }

  const parts: string[] = [];

  if (current) {
    const show = showMap[current.show];
    const icon = TYPE_ICONS[show?.type] || '▶';
    parts.push(`${icon} ŞU AN  ${show?.title || ''} — ${current.episode}  ·  ${current.time}`);
  }

  if (next) {
    const show = showMap[next.show];
    const icon = TYPE_ICONS[show?.type] || '▶';
    parts.push(`SONRAKI  ${show?.title || ''} — ${next.episode}  ·  ${next.time}`);
  }

  // Add all today's shows
  for (const slot of slots) {
    if (slot === current || slot === next) continue;
    const show = showMap[slot.show];
    const icon = TYPE_ICONS[show?.type] || '·';
    parts.push(`${icon} ${slot.time}  ${show?.title || ''} — ${slot.episode}`);
  }

  if (parts.length === 0) {
    parts.push('KARBON TV — 7/24 Yayın  ·  Temmuz 2026  ·  GTA Öncesi Sezon');
  }

  const text = parts.join('          ');
  return new Response(JSON.stringify({ text }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=60' }
  });
};
