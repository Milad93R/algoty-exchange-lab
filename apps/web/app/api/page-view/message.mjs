import {isIP} from 'node:net';
function escapeHtml(value, maxLength = 200) {
  return String(value ?? '')
    .slice(0, maxLength)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function getLocationInfo(clientIp) {
  const fallback = { ip: clientIp, city: 'Unknown', country: 'Unknown' };
  if (!isIP(clientIp)) return fallback;

  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(clientIp)}/json/`, {
      headers: { 'User-Agent': 'AlgoTy-Tracker/1.0' },
      signal: AbortSignal.timeout(3_000),
      cache: 'no-store',
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    return {
      ip: isIP(data.ip || '') ? data.ip : clientIp,
      city: data.city || 'Unknown',
      country: data.country_name || 'Unknown',
    };
  } catch {
    return fallback;
  }
}

function getDeviceInfo(userAgent) {
  const ua = userAgent.toLowerCase();
  let os = 'Unknown OS';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';

  let browser = 'Unknown Browser';
  if (ua.includes('edg')) browser = 'Edge';
  else if ((ua.includes('chrome') || ua.includes('crios'))) browser = 'Chrome';
  else if ((ua.includes('firefox') || ua.includes('fxios'))) browser = 'Firefox';
  else if (ua.includes('safari')) browser = 'Safari';

  let deviceType = 'Desktop';
  if (ua.includes('ipad') || ua.includes('tablet') || (ua.includes('android') && !ua.includes('mobile'))) deviceType = 'Tablet';
  else if (ua.includes('mobile') || ua.includes('iphone')) deviceType = 'Mobile';
  return { os, browser, deviceType };
}


export async function visitMessage(ip,userAgent,page){
  const location=await getLocationInfo(ip);
  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Tehran',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const device = getDeviceInfo(userAgent);
  const lines = [
    `<b>${escapeHtml('AlgoTy Platform Visit', 40)}</b>`,
    `<b>Time:</b> ${escapeHtml(timestamp, 50)} (Tehran)`,
    `<b>Page:</b> ${escapeHtml(page || 'Unknown', 120)}`,
    `<b>Location:</b> ${escapeHtml(location.city)}, ${escapeHtml(location.country)}`,
    `<b>IP:</b> ${escapeHtml(location.ip, 64)}`,
    `<b>OS:</b> ${escapeHtml(device.os, 40)}`,
    `<b>Browser:</b> ${escapeHtml(device.browser, 40)}`,
    `<b>Device:</b> ${escapeHtml(device.deviceType, 40)}`,
    `<b>User Agent:</b> ${escapeHtml(userAgent, 200)}`,
  ];

  return lines.join('\n');
}
