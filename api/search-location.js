module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const lang = String(req.query.lang || 'ar').toLowerCase() === 'en' ? 'en' : 'ar';
  const query = String(req.query.q || '').trim().slice(0, 160);
  const messages = lang === 'en'
    ? {
        short: 'Enter an area or address.',
        notFound: 'We could not find this address. Try a clearer area or street name.',
        failed: 'Address search is currently unavailable. Please try again.'
      }
    : {
        short: 'اكتب اسم المنطقة أو العنوان.',
        notFound: 'لم نعثر على هذا العنوان. جرّب اسم منطقة أو شارع أوضح.',
        failed: 'تعذر البحث عن العنوان حالياً. جرّب مرة أخرى.'
      };

  if (query.length < 2) return res.status(400).json({ error: messages.short });

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '5');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', lang);
    url.searchParams.set('countrycodes', 'iq');
    // Bias results toward Baghdad without blocking valid Iraqi addresses.
    url.searchParams.set('viewbox', '43.85,33.65,44.75,32.95');
    url.searchParams.set('bounded', '0');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TaxiAlmosafir/1.0 (booking website)',
        'Accept': 'application/json'
      }
    });
    if (!response.ok) throw new Error(`Location search failed: ${response.status}`);

    const data = await response.json();
    const results = Array.isArray(data) ? data.map((item) => ({
      lat: Number(item.lat),
      lng: Number(item.lon),
      address: item.display_name || query,
      importance: Number(item.importance || 0)
    })).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)) : [];

    if (!results.length) return res.status(404).json({ error: messages.notFound });
    return res.status(200).json({ results });
  } catch (error) {
    console.error('location search error', error);
    return res.status(502).json({ error: messages.failed });
  }
};
