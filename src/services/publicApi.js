class PublicApiClient {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000;
  }

  async get(url, options = {}) {
    const cacheKey = url;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.cacheExpiry) return cached.data;

    const { headers = {}, params = {} } = options;
    const queryString = Object.keys(params).length ? `?${new URLSearchParams(params)}` : '';
    const res = await fetch(`${url}${queryString}`, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Public API ${res.status}`);
    const data = await res.json();
    this.cache.set(cacheKey, { data, ts: Date.now() });
    return data;
  }

  clearCache() { this.cache.clear(); }

  async weather(city) {
    try {
      const geoRes = await this.get('https://geocoding-api.open-meteo.com/v1/search', { params: { name: city, count: 1 } });
      const geo = geoRes.results?.[0];
      if (!geo) return { error: 'City not found' };
      const weather = await this.get('https://api.open-meteo.com/v1/forecast', {
        params: { latitude: geo.latitude, longitude: geo.longitude, current_weather: true, hourly: 'temperature_2m,relativehumidity_2m' },
      });
      return { city: geo.name, country: geo.country, temp: weather.current_weather?.temperature, condition: weather.current_weather?.weathercode, humidity: weather.hourly?.relativehumidity_2m?.[0] };
    } catch (e) { return { error: e.message }; }
  }

  async cep(cep) {
    try {
      const data = await this.get(`https://viacep.com.br/ws/${cep.replace(/\D/g, '')}/json/`);
      return data.erro ? { error: 'CEP not found' } : data;
    } catch (e) { return { error: e.message }; }
  }

  async geocode(address) {
    try {
      const data = await this.get('https://nominatim.openstreetmap.org/search', { params: { q: address, format: 'json', limit: 1 }, headers: { 'User-Agent': 'MetaPersonaAI/1.0' } });
      if (!data.length) return { error: 'Address not found' };
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name };
    } catch (e) { return { error: e.message }; }
  }

  async reverseGeocode(lat, lon) {
    try {
      const data = await this.get('https://nominatim.openstreetmap.org/reverse', { params: { lat, lon, format: 'json' }, headers: { 'User-Agent': 'MetaPersonaAI/1.0' } });
      return { display: data.display_name, city: data.address?.city, state: data.address?.state, country: data.address?.country };
    } catch (e) { return { error: e.message }; }
  }

  async catFact() {
    try {
      const data = await this.get('https://catfact.ninja/fact');
      return { fact: data.fact };
    } catch (e) { return { error: e.message }; }
  }

  async dogFact() {
    try {
      const data = await this.get('https://dog-api.dog/facts');
      return { fact: data.facts?.[0] || '' };
    } catch (e) { return { error: e.message }; }
  }

  async joke(category = '') {
    try {
      const params = category ? { category } : {};
      const data = await this.get('https://v2.jokeapi.dev/joke/Any', { params: { 'safe-mode': true, ...params } });
      return data.type === 'twopart' ? { setup: data.setup, delivery: data.delivery } : { joke: data.joke };
    } catch (e) { return { error: e.message }; }
  }

  async advice() {
    try {
      const data = await this.get('https://api.adviceslip.com/advice');
      return { advice: data.slip?.advice || '' };
    } catch (e) { return { error: e.message }; }
  }

  async randomUser() {
    try {
      const data = await this.get('https://randomuser.me/api/');
      const u = data.results?.[0];
      return { name: `${u.name.first} ${u.name.last}`, email: u.email, phone: u.phone, location: `${u.location.city}, ${u.location.country}`, avatar: u.picture?.large };
    } catch (e) { return { error: e.message }; }
  }

  async numberFact(num, type = 'trivia') {
    try {
      const data = await this.get(`http://numbersapi.com/${num}/${type}`, { headers: { 'Accept': 'application/json' } });
      return { fact: data };
    } catch (e) { return { error: e.message }; }
  }

  async wordDefinition(word) {
    try {
      const data = await this.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      const def = data[0]?.meanings?.[0]?.definitions?.[0];
      return { word, definition: def?.definition || '', example: def?.example || '', partOfSpeech: data[0]?.meanings?.[0]?.partOfSpeech };
    } catch (e) { return { error: e.message }; }
  }

  async exchangeRates(base = 'BRL') {
    try {
      const data = await this.get('https://api.exchangerate-api.com/v4/latest/BRL');
      const rates = data.rates || {};
      return { base: 'BRL', date: data.date, rates: { USD: rates.USD, EUR: rates.EUR, GBP: rates.GBP, ARS: rates.ARS, USD_BRL: rates.USD } };
    } catch (e) { return { error: e.message }; }
  }

  async wikiSearch(query) {
    try {
      const data = await this.get('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(query));
      return { title: data.title, extract: data.extract, url: data.content_urls?.desktop?.page };
    } catch (e) { return { error: e.message }; }
  }

  async emojiSearch(query) {
    try {
      const data = await this.get('https://emoji-api.com/emojis', { params: { search: query } });
      return { emojis: (data.data || []).slice(0, 10).map(e => ({ char: e.character, name: e.slug })) };
    } catch (e) { return { error: e.message }; }
  }

  async qrCode(text, size = 200) {
    return { url: `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}` };
  }

  async urlMetadata(url) {
    try {
      const data = await this.get('https://api.microlink.io', { params: { url } });
      return { title: data.data?.title, description: data.data?.description, image: data.data?.image?.url, publisher: data.data?.publisher };
    } catch (e) { return { error: e.message }; }
  }

  async ibgeCity(search) {
    try {
      const data = await this.get('https://servicodados.ibge.gov.br/api/v1/localidades/municipios', { params: { nome: search } });
      return (data || []).slice(0, 5).map(c => ({ name: c.nome, state: c.microrregiao?.mesorregiao?.UF?.sigla || '' }));
    } catch (e) { return { error: e.message }; }
  }

  async horoscope(sign) {
    try {
      const data = await this.get('https://horoscope-app-api.vercel.app/api/v1/horoscope/daily', { params: { sign, day: 'today' } });
      return { sign, date: data.data?.date, horoscope: data.data?.horoscope };
    } catch (e) { return { error: e.message }; }
  }

  async cryptoPrice(coin = 'bitcoin') {
    try {
      const data = await this.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd,brl&include_24hr_change=true`);
      const info = data[coin];
      if (!info) return { error: 'Coin not found' };
      return { coin, usd: info.usd, brl: info.brl, change24h: info.usd_24h_change?.toFixed(2) };
    } catch (e) { return { error: e.message }; }
  }

  async ibgePopulation(cityId) {
    try {
      const data = await this.get(`https://servicodados.ibge.gov.br/api/v1/estimativas/populacao/brazil/{year}/municipio/${cityId}`);
      return data;
    } catch (e) { return { error: e.message }; }
  }

  async news(topic = '') {
    try {
      const params = topic ? { q: topic } : {};
      const data = await this.get('https://saurav.tech/NewsAPI/top-headlines/country/br.json', { params });
      return { articles: (data.articles || []).slice(0, 10).map(a => ({ title: a.title, description: a.description, url: a.url, source: a.source?.name })) };
    } catch (e) { return { error: e.message }; }
  }

  async dogImage() {
    try {
      const data = await this.get('https://dog.ceo/api/breeds/image/random');
      return { image: data.message };
    } catch (e) { return { error: e.message }; }
  }

  async catImage() {
    try {
      const data = await this.get('https://api.thecatapi.com/v1/images/search');
      return { image: data[0]?.url || '' };
    } catch (e) { return { error: e.message }; }
  }

  async gitHubUser(username) {
    try {
      const data = await this.get(`https://api.github.com/users/${username}`);
      return { name: data.name, bio: data.bio, followers: data.followers, repos: data.public_repos, url: data.html_url };
    } catch (e) { return { error: e.message }; }
  }

  async openLibrarySearch(query) {
    try {
      const data = await this.get('https://openlibrary.org/search.json', { params: { q: query, limit: 5 } });
      return { books: (data.docs || []).map(b => ({ title: b.title, author: b.author_name?.[0] || '', year: b.first_publish_year, url: `https://openlibrary.org${b.key}` })) };
    } catch (e) { return { error: e.message }; }
  }

  async bikeIndex(serial) {
    try {
      const data = await this.get('https://bikeindex.org/api/v3/vehicles', { params: { serial, stolen: false } });
      return { bikes: (data.bikes || []).slice(0, 5).map(b => ({ title: b.title, manufacturer: b.manufacturer, serial, url: b.url })) };
    } catch (e) { return { error: e.message }; }
  }

  async genderize(name) {
    try {
      const data = await this.get(`https://api.genderize.io`, { params: { name } });
      return { name: data.name, gender: data.gender, probability: data.probability };
    } catch (e) { return { error: e.message }; }
  }

  async agegify(name) {
    try {
      const data = await this.get(`https://api.agify.io`, { params: { name } });
      return { name: data.name, age: data.age };
    } catch (e) { return { error: e.message }; }
  }

  async uniswap(pair = '0x...') {
    try {
      const data = await this.get(`https://api.llama.fi/protocol/uniswap`);
      return { tvl: data.tvl, volume24h: data.volume24h };
    } catch (e) { return { error: e.message }; }
  }
}

const apiClient = new PublicApiClient();

module.exports = apiClient;