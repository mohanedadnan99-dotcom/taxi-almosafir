module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const lang = String(req.query.lang || 'ar').toLowerCase() === 'en' ? 'en' : 'ar';
  const fallback = lang === 'en' ? 'Selected location in Baghdad' : 'موقع محدد داخل بغداد';

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', lang);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TaxiAlmosafir/1.0 (booking website)',
        'Accept': 'application/json'
      }
    });
    if (!response.ok) throw new Error(`Reverse geocoding failed: ${response.status}`);

    const data = await response.json();
    const a = data.address || {};
    const parts = [
      a.house_number,
      a.road || a.pedestrian || a.residential,
      a.neighbourhood || a.suburb || a.quarter,
      a.city_district,
      a.city || a.town || a.village,
      a.state
    ].filter(Boolean);

    const separator = lang === 'en' ? ', ' : '، ';
    const detailed = parts.length ? [...new Set(parts)].join(separator) : data.display_name;
    return res.status(200).json({ address: detailed || data.display_name || fallback });
  } catch (error) {
    console.error('reverse geocoding error', error);
    return res.status(200).json({ address: fallback });
  }
};