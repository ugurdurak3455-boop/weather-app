'use strict';

/* =========================================================================
 * Погода — приложение с виджетами погоды и картой.
 * Чистый JavaScript без библиотек и фреймворков.
 * Данные о погоде: Open-Meteo, поиск города: Open-Meteo Geocoding,
 * название места по координатам: Nominatim (OpenStreetMap),
 * карта: встраиваемая карта OpenStreetMap.
 * ========================================================================= */

/* ----------------------------- Настройки ------------------------------ */

const API_URLS = {
  forecast: 'https://api.open-meteo.com/v1/forecast',
  geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
  reverseGeocoding: 'https://nominatim.openstreetmap.org/reverse',
  mapEmbed: 'https://www.openstreetmap.org/export/embed.html',
  mapPage: 'https://www.openstreetmap.org/',
};

const STORAGE_KEY = 'weather-app:locations';
const MAX_WIDGETS = 12;
const DEFAULT_LOCATION = { lat: 56.8389, lon: 60.6057 }; // Екатеринбург
const MAP_DELTA_DEGREES = 0.05;
const COORDINATE_PRECISION = 4;
const CLOCK_INTERVAL_MS = 1000;
const AUTO_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const STATUS_HIDE_DELAY_MS = 5000;
const GEOLOCATION_TIMEOUT_MS = 10000;
const HPA_TO_MMHG = 0.750062;
const COMPASS_POINTS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];

const COORDINATE_RULES = {
  lat: { limit: 90, accusative: 'широту', nominative: 'Широта', example: '56.84' },
  lon: { limit: 180, accusative: 'долготу', nominative: 'Долгота', example: '60.61' },
};

const COORDINATE_PATTERN = /^[-+]?\d{1,3}(\.\d+)?$/;
const LETTER = 'A-Za-z\\u00C0-\\u024F\\u0400-\\u04FF'; // латиница (в т. ч. турецкие буквы) и кириллица
const CITY_NAME_PATTERN = new RegExp(`^[${LETTER}][${LETTER}\\s.'’-]*$`);
const CITY_NAME_LENGTH = { min: 2, max: 80 };

/* ------------------------ Коды погоды Open-Meteo ----------------------- */

const UNKNOWN_WEATHER = { label: 'Нет данных', type: 'cloudy' };

const WEATHER_CODES = {
  0: { label: 'Ясно', type: 'clear' },
  1: { label: 'Преимущественно ясно', type: 'clear' },
  2: { label: 'Переменная облачность', type: 'partly' },
  3: { label: 'Пасмурно', type: 'cloudy' },
  45: { label: 'Туман', type: 'fog' },
  48: { label: 'Туман с изморозью', type: 'fog' },
  51: { label: 'Слабая морось', type: 'rain' },
  53: { label: 'Морось', type: 'rain' },
  55: { label: 'Сильная морось', type: 'rain' },
  56: { label: 'Ледяная морось', type: 'rain' },
  57: { label: 'Сильная ледяная морось', type: 'rain' },
  61: { label: 'Небольшой дождь', type: 'rain' },
  63: { label: 'Дождь', type: 'rain' },
  65: { label: 'Сильный дождь', type: 'rain' },
  66: { label: 'Ледяной дождь', type: 'rain' },
  67: { label: 'Сильный ледяной дождь', type: 'rain' },
  71: { label: 'Небольшой снег', type: 'snow' },
  73: { label: 'Снег', type: 'snow' },
  75: { label: 'Сильный снег', type: 'snow' },
  77: { label: 'Снежная крупа', type: 'snow' },
  80: { label: 'Небольшой ливень', type: 'rain' },
  81: { label: 'Ливень', type: 'rain' },
  82: { label: 'Сильный ливень', type: 'rain' },
  85: { label: 'Снегопад', type: 'snow' },
  86: { label: 'Сильный снегопад', type: 'snow' },
  95: { label: 'Гроза', type: 'storm' },
  96: { label: 'Гроза с градом', type: 'storm' },
  99: { label: 'Сильная гроза с градом', type: 'storm' },
};

/* ------------------------- Иконки погоды (SVG) ------------------------- */

const SVG_SUN = `<g class="icon-sun"><circle cx="32" cy="32" r="11" fill="#FFC83D"/>
<path d="M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4.2 4.2M44.8 44.8L49 49M15 49l4.2-4.2M44.8 19.2L49 15"
stroke="#FFC83D" stroke-width="3.5" stroke-linecap="round"/></g>`;
const SVG_MOON = '<path class="icon-moon" d="M40 12A20 20 0 1 0 52 42A16 16 0 0 1 40 12z" fill="#F4E7B5"/>';
const SVG_CLOUD = `<path class="icon-cloud" d="M20 50h26a10 10 0 0 0 0-20 14 14 0 0 0-27-3A11 11 0 0 0 20 50z"
fill="#EEF3FA"/>`;
const SVG_CLOUD_HIGH = `<g transform="translate(0 -8)">${SVG_CLOUD}</g>`;
const SVG_DROPS = `<path class="icon-drops" d="M22 48l-3 7M32 48l-3 7M42 48l-3 7"
stroke="#7CC4FF" stroke-width="3" stroke-linecap="round"/>`;
const SVG_FLAKES = `<g class="icon-flakes" fill="#FFFFFF"><circle cx="22" cy="51" r="2.6"/>
<circle cx="32" cy="56" r="2.6"/><circle cx="42" cy="51" r="2.6"/></g>`;
const SVG_BOLT = '<path class="icon-bolt" d="M34 40l-9 12h7l-3 10 11-14h-7l4-8z" fill="#FFD23F"/>';
const SVG_FOG = `<path d="M14 49h36M20 56h24" stroke="#DCE3EC" stroke-width="3"
stroke-linecap="round" class="icon-fog"/>`;

const WEATHER_ICONS = {
  'clear-day': SVG_SUN,
  'clear-night': SVG_MOON,
  'partly-day': `<g transform="translate(-4 -6) scale(0.8)">${SVG_SUN}</g>${SVG_CLOUD}`,
  'partly-night': `<g transform="translate(-2 -6) scale(0.8)">${SVG_MOON}</g>${SVG_CLOUD}`,
  cloudy: `<g transform="translate(-6 -10) scale(0.7)" opacity="0.6">${SVG_CLOUD}</g>${SVG_CLOUD}`,
  rain: SVG_CLOUD_HIGH + SVG_DROPS,
  snow: SVG_CLOUD_HIGH + SVG_FLAKES,
  storm: SVG_CLOUD_HIGH + SVG_BOLT,
  fog: SVG_CLOUD_HIGH + SVG_FOG,
};

/* ------------------------------ Состояние ------------------------------ */

const state = {
  locations: new Array(),
  statusTimerId: 0,
};

// Ссылки на элементы страницы, заполняются в init()
const dom = Object.create(null);

/* ----------------------------- Валидация ------------------------------- */

function normalizeNumberInput(rawValue) {
  return String(rawValue).trim().replace(',', '.');
}

function validateCoordinate(rawValue, rule) {
  const normalized = normalizeNumberInput(rawValue);
  if (normalized === '') {
    return { error: `Введите ${rule.accusative}` };
  }
  if (!COORDINATE_PATTERN.test(normalized)) {
    return { error: `${rule.nominative} — это число, например ${rule.example}` };
  }
  const value = Number(normalized);
  if (Math.abs(value) > rule.limit) {
    return { error: `${rule.nominative} должна быть от −${rule.limit} до ${rule.limit}` };
  }
  return { value };
}

function validateLocation(rawLat, rawLon) {
  const lat = validateCoordinate(rawLat, COORDINATE_RULES.lat);
  const lon = validateCoordinate(rawLon, COORDINATE_RULES.lon);
  return { lat, lon, isValid: !lat.error && !lon.error };
}

function validateCityName(rawName) {
  const name = rawName.trim();
  if (name === '') {
    return 'Введите название города';
  }
  if (name.length < CITY_NAME_LENGTH.min || name.length > CITY_NAME_LENGTH.max) {
    return `Название должно содержать от ${CITY_NAME_LENGTH.min} до ${CITY_NAME_LENGTH.max} символов`;
  }
  if (!CITY_NAME_PATTERN.test(name)) {
    return 'Название может содержать только буквы, пробелы, точку и дефис';
  }
  return '';
}

/* ------------------------------ Запросы к API -------------------------- */

function buildUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Сервер ответил ошибкой ${response.status}. Попробуйте позже.`);
  }
  return response.json();
}

function fetchWeather({ lat, lon }) {
  return fetchJson(buildUrl(API_URLS.forecast, {
    latitude: lat,
    longitude: lon,
    current: [
      'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'is_day',
      'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'surface_pressure',
    ].join(','),
    daily: 'temperature_2m_max,temperature_2m_min,sunrise,sunset',
    wind_speed_unit: 'ms',
    timezone: 'auto',
    forecast_days: 1,
  }));
}

async function fetchPlaceName({ lat, lon }) {
  try {
    const data = await fetchJson(buildUrl(API_URLS.reverseGeocoding, {
      format: 'jsonv2',
      lat,
      lon,
      zoom: 10,
      'accept-language': 'ru',
    }));
    return extractPlaceName(data);
  } catch {
    return null; // название места — необязательные данные, погода покажется и без него
  }
}

function extractPlaceName(data) {
  const address = data?.address ?? {};
  const locality = address.city || address.town || address.village || address.hamlet
    || address.municipality || address.county || address.state;
  if (!locality) {
    return data?.name || null;
  }
  return [locality, address.country].filter(Boolean).join(', ');
}

async function searchCity(name) {
  const data = await fetchJson(buildUrl(API_URLS.geocoding, {
    name,
    count: 1,
    language: 'ru',
    format: 'json',
  }));
  if (!data.results?.length) {
    throw new Error(`Город «${name}» не найден. Проверьте название.`);
  }
  const [city] = data.results;
  return {
    lat: city.latitude,
    lon: city.longitude,
    name: [city.name, city.country].filter(Boolean).join(', '),
  };
}

/* ----------------------------- Форматирование -------------------------- */

function formatTemperature(celsius) {
  const rounded = Math.round(celsius) || 0;
  return `${rounded > 0 ? '+' : ''}${rounded}°`;
}

function formatCoordinates({ lat, lon }) {
  const latLabel = `${Math.abs(lat).toFixed(COORDINATE_PRECISION)}° ${lat >= 0 ? 'с. ш.' : 'ю. ш.'}`;
  const lonLabel = `${Math.abs(lon).toFixed(COORDINATE_PRECISION)}° ${lon >= 0 ? 'в. д.' : 'з. д.'}`;
  return `${latLabel}, ${lonLabel}`;
}

function toCompassPoint(degrees) {
  const index = Math.round(degrees / 45) % COMPASS_POINTS.length;
  return COMPASS_POINTS[index];
}

function formatClockTime(isoDateTime) {
  return isoDateTime ? isoDateTime.slice(11, 16) : '—';
}

function formatUtcOffset(offsetSeconds) {
  const sign = offsetSeconds >= 0 ? '+' : '−';
  const absSeconds = Math.abs(offsetSeconds);
  const hours = Math.floor(absSeconds / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const minutesPart = minutes ? `:${String(minutes).padStart(2, '0')}` : '';
  return `UTC${sign}${hours}${minutesPart}`;
}

function getLocationDate(offsetSeconds) {
  return new Date(Date.now() + offsetSeconds * 1000);
}

function formatLocalTime(offsetSeconds) {
  return getLocationDate(offsetSeconds).toLocaleTimeString('ru-RU', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatLocalDate(offsetSeconds) {
  return getLocationDate(offsetSeconds).toLocaleDateString('ru-RU', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function resolveIconType(weatherType, isDay) {
  if (weatherType === 'clear' || weatherType === 'partly') {
    return `${weatherType}-${isDay ? 'day' : 'night'}`;
  }
  return weatherType;
}

function buildIconSvg(iconType) {
  const content = WEATHER_ICONS[iconType] ?? WEATHER_ICONS.cloudy;
  return `<svg class="weather-icon" viewBox="0 0 64 64" aria-hidden="true">${content}</svg>`;
}

function toWeatherViewModel(weather, placeName) {
  const { current, daily } = weather;
  const info = WEATHER_CODES[current.weather_code] ?? UNKNOWN_WEATHER;
  const minTemperature = formatTemperature(daily.temperature_2m_min[0]);
  const maxTemperature = formatTemperature(daily.temperature_2m_max[0]);
  return {
    placeName: placeName || 'Точка на карте',
    description: info.label,
    iconType: resolveIconType(info.type, current.is_day === 1),
    temperature: formatTemperature(current.temperature_2m),
    feelsLike: formatTemperature(current.apparent_temperature),
    minMax: `${minTemperature} / ${maxTemperature}`,
    wind: `${current.wind_speed_10m.toFixed(1)} м/с, ${toCompassPoint(current.wind_direction_10m)}`,
    windDirection: current.wind_direction_10m,
    humidity: `${current.relative_humidity_2m}%`,
    pressure: `${Math.round(current.surface_pressure * HPA_TO_MMHG)} мм рт. ст.`,
    sun: `${formatClockTime(daily.sunrise?.[0])} / ${formatClockTime(daily.sunset?.[0])}`,
    timezone: `${weather.timezone} (${formatUtcOffset(weather.utc_offset_seconds)})`,
    utcOffset: weather.utc_offset_seconds,
  };
}

function getErrorMessage(error) {
  if (error instanceof TypeError) {
    return 'Не удалось связаться с сервером. Проверьте интернет и попробуйте снова.';
  }
  return error?.message || 'Что-то пошло не так. Попробуйте ещё раз.';
}

/* -------------------------------- Карта -------------------------------- */

function buildMapEmbedUrl({ lat, lon }) {
  const bbox = [
    lon - MAP_DELTA_DEGREES,
    Math.max(lat - MAP_DELTA_DEGREES, -90),
    lon + MAP_DELTA_DEGREES,
    Math.min(lat + MAP_DELTA_DEGREES, 90),
  ].map((value) => value.toFixed(COORDINATE_PRECISION)).join(',');
  return buildUrl(API_URLS.mapEmbed, { bbox, layer: 'mapnik', marker: `${lat},${lon}` });
}

function buildMapPageUrl({ lat, lon }) {
  return `${API_URLS.mapPage}?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}`;
}

/* ------------------------- Хранилище (localStorage) -------------------- */

function isValidSavedLocation(item) {
  return Boolean(item)
    && typeof item.id === 'string'
    && Number.isFinite(item.lat) && Math.abs(item.lat) <= COORDINATE_RULES.lat.limit
    && Number.isFinite(item.lon) && Math.abs(item.lon) <= COORDINATE_RULES.lon.limit;
}

function loadSavedLocations() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return Array.isArray(parsed) ? parsed.filter(isValidSavedLocation).slice(0, MAX_WIDGETS) : null;
  } catch {
    return null;
  }
}

function saveLocations(locations) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
  } catch {
    // Хранилище недоступно (например, приватный режим) — работаем без сохранения
  }
}

/* --------------------------- Управление виджетами ---------------------- */

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function roundCoordinate(value) {
  return Number(value.toFixed(COORDINATE_PRECISION));
}

function createLocation({ lat, lon }) {
  return { id: createId(), lat: roundCoordinate(lat), lon: roundCoordinate(lon) };
}

function hasLocation({ lat, lon }) {
  return state.locations.some((item) => item.lat === lat && item.lon === lon);
}

function getAddLocationError(location) {
  if (state.locations.length >= MAX_WIDGETS) {
    return `Можно добавить не больше ${MAX_WIDGETS} виджетов. Удалите один из существующих.`;
  }
  if (hasLocation(location)) {
    return 'Виджет для этой точки уже есть на странице.';
  }
  return '';
}

function addLocation(coordinates) {
  const location = createLocation(coordinates);
  const error = getAddLocationError(location);
  if (error) {
    showStatus(error, 'error');
    return false;
  }
  state.locations.unshift(location);
  saveLocations(state.locations);
  const widget = renderWidget(location, { prepend: true });
  widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  updateWidgetCounter();
  return true;
}

function removeLocation(locationId, widget) {
  state.locations = state.locations.filter((item) => item.id !== locationId);
  saveLocations(state.locations);
  widget.classList.add('widget--leaving');
  widget.addEventListener('animationend', () => widget.remove(), { once: true });
  updateWidgetCounter();
  showStatus('Виджет удалён', 'info');
}

function findLocationById(locationId) {
  return state.locations.find((item) => item.id === locationId);
}

/* ------------------------------ Отрисовка ------------------------------ */

const TEXT_FIELDS = [
  'placeName', 'description', 'temperature', 'feelsLike', 'minMax',
  'wind', 'humidity', 'pressure', 'sun', 'timezone',
];

function setField(widget, fieldName, text) {
  widget.querySelector(`[data-field="${fieldName}"]`).textContent = text;
}

function createWidgetElement(location) {
  const widget = dom.widgetTemplate.content.firstElementChild.cloneNode(true);
  widget.dataset.id = location.id;
  setField(widget, 'coords', formatCoordinates(location));
  setWidgetMap(widget, location);
  return widget;
}

function setWidgetMap(widget, location) {
  const frame = widget.querySelector('.widget__map-frame');
  frame.src = buildMapEmbedUrl(location);
  frame.title = `Карта: ${formatCoordinates(location)}`;
  widget.querySelector('.widget__map-link').href = buildMapPageUrl(location);
}

function renderWidget(location, { prepend = false } = {}) {
  const widget = createWidgetElement(location);
  if (prepend) {
    dom.widgetList.prepend(widget);
  } else {
    dom.widgetList.append(widget);
  }
  loadWidgetWeather(widget, location);
  return widget;
}

function setWidgetState(widget, widgetState) {
  widget.dataset.state = widgetState;
  widget.setAttribute('aria-busy', String(widgetState === 'loading'));
}

async function loadWidgetWeather(widget, location) {
  setWidgetState(widget, 'loading');
  try {
    const [weather, placeName] = await Promise.all([
      fetchWeather(location),
      fetchPlaceName(location),
    ]);
    if (!widget.isConnected) {
      return;
    }
    fillWidget(widget, toWeatherViewModel(weather, placeName));
    setWidgetState(widget, 'ready');
  } catch (error) {
    setField(widget, 'error', getErrorMessage(error));
    setWidgetState(widget, 'error');
  }
}

function fillWidget(widget, model) {
  TEXT_FIELDS.forEach((field) => setField(widget, field, model[field]));
  widget.querySelector('[data-field="icon"]').innerHTML = buildIconSvg(model.iconType);
  // Метеорологическое направление — откуда дует ветер, стрелка показывает куда
  widget.querySelector('.wind-arrow').style.transform = `rotate(${model.windDirection + 180}deg)`;
  widget.dataset.weather = model.iconType;
  widget.dataset.utcOffset = String(model.utcOffset);
  updateWidgetClock(widget);
}

function updateWidgetClock(widget) {
  const offsetSeconds = Number(widget.dataset.utcOffset);
  if (!Number.isFinite(offsetSeconds)) {
    return;
  }
  widget.querySelector('[data-clock="time"]').textContent = formatLocalTime(offsetSeconds);
  widget.querySelector('[data-clock="date"]').textContent = formatLocalDate(offsetSeconds);
}

function updateAllClocks() {
  dom.widgetList.querySelectorAll('.widget[data-utc-offset]').forEach(updateWidgetClock);
}

function refreshAllWidgets() {
  dom.widgetList.querySelectorAll('.widget').forEach((widget) => {
    const location = findLocationById(widget.dataset.id);
    if (location) {
      loadWidgetWeather(widget, location);
    }
  });
}

function updateWidgetCounter() {
  const count = state.locations.length;
  dom.widgetCounter.textContent = `${count} из ${MAX_WIDGETS}`;
  dom.emptyState.hidden = count > 0;
}

/* ------------------------- Сообщения и формы --------------------------- */

function showStatus(message, type = 'info') {
  window.clearTimeout(state.statusTimerId);
  dom.status.textContent = message;
  dom.status.dataset.type = type;
  dom.status.hidden = false;
  state.statusTimerId = window.setTimeout(() => {
    dom.status.hidden = true;
  }, STATUS_HIDE_DELAY_MS);
}

function showFieldError(input, errorElement, message = '') {
  errorElement.textContent = message;
  input.setAttribute('aria-invalid', String(Boolean(message)));
}

function clearFieldError(input, errorElement) {
  showFieldError(input, errorElement, '');
}

function setButtonBusy(button, isBusy) {
  button.disabled = isBusy;
  button.classList.toggle('button--busy', isBusy);
}

function fillCoordinateInputs({ lat, lon }) {
  dom.latInput.value = String(roundCoordinate(lat));
  dom.lonInput.value = String(roundCoordinate(lon));
  clearFieldError(dom.latInput, dom.latError);
  clearFieldError(dom.lonInput, dom.lonError);
}

/* ------------------------------ Обработчики ---------------------------- */

function handleLocationSubmit(event) {
  event.preventDefault();
  const result = validateLocation(dom.latInput.value, dom.lonInput.value);
  showFieldError(dom.latInput, dom.latError, result.lat.error);
  showFieldError(dom.lonInput, dom.lonError, result.lon.error);
  if (!result.isValid) {
    (result.lat.error ? dom.latInput : dom.lonInput).focus();
    return;
  }
  if (addLocation({ lat: result.lat.value, lon: result.lon.value })) {
    dom.locationForm.reset();
    showStatus('Виджет добавлен', 'success');
  }
}

async function handleCitySubmit(event) {
  event.preventDefault();
  const error = validateCityName(dom.cityInput.value);
  showFieldError(dom.cityInput, dom.cityError, error);
  if (error) {
    return;
  }
  setButtonBusy(dom.citySubmit, true);
  try {
    const city = await searchCity(dom.cityInput.value.trim());
    if (addLocation(city)) {
      dom.cityForm.reset();
      showStatus(`Добавлен виджет: ${city.name}`, 'success');
    }
  } catch (searchError) {
    showFieldError(dom.cityInput, dom.cityError, getErrorMessage(searchError));
  } finally {
    setButtonBusy(dom.citySubmit, false);
  }
}

function handleGeolocationClick() {
  if (!('geolocation' in navigator)) {
    showStatus('Ваш браузер не поддерживает определение местоположения', 'error');
    return;
  }
  setButtonBusy(dom.geoButton, true);
  navigator.geolocation.getCurrentPosition(
    handlePositionSuccess,
    handlePositionError,
    { timeout: GEOLOCATION_TIMEOUT_MS },
  );
}

function handlePositionSuccess({ coords }) {
  setButtonBusy(dom.geoButton, false);
  fillCoordinateInputs({ lat: coords.latitude, lon: coords.longitude });
  showStatus('Координаты определены. Нажмите «Добавить виджет».', 'success');
}

function handlePositionError(error) {
  setButtonBusy(dom.geoButton, false);
  const message = error.code === error.PERMISSION_DENIED
    ? 'Доступ к местоположению запрещён в настройках браузера'
    : 'Не удалось определить местоположение. Введите координаты вручную.';
  showStatus(message, 'error');
}

function handleWidgetListClick(event) {
  const button = event.target.closest('[data-action]');
  const widget = button?.closest('.widget');
  const location = widget && findLocationById(widget.dataset.id);
  if (!location) {
    return;
  }
  if (button.dataset.action === 'remove') {
    removeLocation(location.id, widget);
  } else if (button.dataset.action === 'refresh') {
    loadWidgetWeather(widget, location);
  }
}

/* ------------------------------ Инициализация -------------------------- */

function getDomElements() {
  return {
    locationForm: document.querySelector('#location-form'),
    latInput: document.querySelector('#lat-input'),
    lonInput: document.querySelector('#lon-input'),
    latError: document.querySelector('#lat-error'),
    lonError: document.querySelector('#lon-error'),
    geoButton: document.querySelector('#geo-button'),
    cityForm: document.querySelector('#city-form'),
    cityInput: document.querySelector('#city-input'),
    cityError: document.querySelector('#city-error'),
    citySubmit: document.querySelector('#city-submit'),
    status: document.querySelector('#status'),
    widgetList: document.querySelector('#widget-list'),
    widgetTemplate: document.querySelector('#widget-template'),
    widgetCounter: document.querySelector('#widget-counter'),
    emptyState: document.querySelector('#empty-state'),
  };
}

function bindEvents() {
  dom.locationForm.addEventListener('submit', handleLocationSubmit);
  dom.cityForm.addEventListener('submit', handleCitySubmit);
  dom.geoButton.addEventListener('click', handleGeolocationClick);
  dom.widgetList.addEventListener('click', handleWidgetListClick);
  dom.latInput.addEventListener('input', () => clearFieldError(dom.latInput, dom.latError));
  dom.lonInput.addEventListener('input', () => clearFieldError(dom.lonInput, dom.lonError));
  dom.cityInput.addEventListener('input', () => clearFieldError(dom.cityInput, dom.cityError));
}

function restoreLocations() {
  const savedLocations = loadSavedLocations();
  state.locations = savedLocations ?? [createLocation(DEFAULT_LOCATION)];
  saveLocations(state.locations);
  state.locations.forEach((location) => renderWidget(location));
  updateWidgetCounter();
}

function init() {
  Object.assign(dom, getDomElements());
  bindEvents();
  restoreLocations();
  setInterval(updateAllClocks, CLOCK_INTERVAL_MS);
  setInterval(refreshAllWidgets, AUTO_REFRESH_INTERVAL_MS);
}

// Запускаем приложение только в браузере: в Node.js (например, в автотестах) DOM нет
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
