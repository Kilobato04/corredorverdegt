// =====================================================
// CONSTANTES - CORREDOR VERDE GUATEMALA
// =====================================================

// Ubicación del dispositivo (deviceID SMAA_002 en la API)
const SENSOR_LOCATION = {
    id: 'SMAA_002',
    displayName: 'Dispositivo SMAA 02',   // nombre legible que se muestra en pantalla
    name: 'Estación Corredor Verde',
    lat: 14.615641,
    lon: -90.556407,
    city: 'Ciudad de Guatemala'
};

// Endpoint de la API
const API_CONFIG = {
    baseUrl: 'https://jciiy1ok97.execute-api.us-east-1.amazonaws.com/default/getData',
    deviceID: 'SMAA_002',
    action: 'hourly_history'
};

// Zona horaria de Guatemala (UTC-6)
const TIMEZONE_OFFSET = -6;

// Mapbox (mismo token que la presentación ejecutiva).
// IMPORTANTE: si el token tiene restricción de URLs en account.mapbox.com,
// agregar también la URL de este visor (https://<sitio>.netlify.app/*).
const MAPBOX_TOKEN = 'pk.eyJ1Ijoia2lsb2JhdG8iLCJhIjoiY21jd2g2b3RzMDJiNDJxcTA0cTFhZmE4OCJ9.u5zPxYCxqEaF2jnj32l4ng';

// Configuración del mapa
const MAP_CONFIG = {
    center: [14.615641, -90.556407],
    zoom: 14,
    minZoom: 12,
    maxZoom: 18,
    // Mapas base (Mapbox)
    basemaps: {
        dark: {
            label: 'Mapa oscuro',
            url: `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`,
            attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Smability',
            tileSize: 512, zoomOffset: -1
        },
        satellite: {
            label: 'Satélite',
            url: `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`,
            attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; Maxar | Smability',
            tileSize: 512, zoomOffset: -1
        }
    }
};

// Vista 3D (Mapbox GL JS)
const VIEW3D = {
    style: 'mapbox://styles/mapbox/dark-v11',
    zoom: 16.2, pitch: 62, bearing: -25,
    // Domo de ruido: escala VISUAL (no es un modelo de propagación)
    noiseMin: 40, noiseMax: 90,     // dBA que corresponden al radio mínimo y máximo
    domeMin: 30, domeMax: 150,      // radio del domo en metros
    // Columna para las demás variables
    colRadius: 12, colMin: 15, colMax: 180   // metros
};

// Historial: la API sólo acepta "?days=N" (N días hacia atrás desde hoy).
// El visor pide el periodo más largo que la API responda, en este orden, y con eso arma el calendario.
const HISTORY_CONFIG = {
    lookbackSteps: [365, 180, 120, 90, 60, 40, 20],
    fullDayHours: 18,        // un día con ≥18 h de datos se marca como "completo"
    peakManyHours: 3,        // ≥3 h sobre el umbral en un día = varios picos (rojo); 1–2 h = pico aislado (naranja)
    defaultSelectionDays: 7, // al abrir, se seleccionan los últimos 7 días con datos
    minCompleteness: 50      // horas con data_completeness < 50% no cuentan para picos ni estadística
};

// Antigüedad del último dato (horas) para el indicador de estado
const FRESHNESS = { liveHours: 2, recentHours: 24 };

// Orden de las tarjetas de variables
const VARIABLE_ORDER = ['noise_avg', 'aqi', 'pm25_avg', 'pm10_avg', 'o3_avg', 'co_avg', 'temperature_avg', 'humidity_avg'];

// Iconos SVG (línea, 24×24, heredan el color del texto)
const ICONS = {
    noise: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
    particles: '<circle cx="6" cy="7" r="1.6"/><circle cx="13" cy="5" r="1.1"/><circle cx="18" cy="9" r="1.8"/><circle cx="9" cy="13" r="2.2"/><circle cx="16" cy="16" r="1.3"/><circle cx="6" cy="19" r="1.2"/><circle cx="12" cy="20" r="0.9"/>',
    ozone: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4.75 4.75 0 0 1-.5 9.5H7z"/>',
    co: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    thermometer: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/><path d="M11.5 10v7"/>',
    droplet: '<path d="M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0z"/>',
    gauge: '<path d="M4.9 19a9 9 0 1 1 14.2 0"/><path d="m12 14 4-5"/><circle cx="12" cy="14" r="1.2"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
    rewind: '<path d="M11 19 2 12l9-7v14z"/><path d="M22 19l-9-7 9-7v14z"/>',
    pause: '<rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
function icon(name, cls = 'ic') {
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// Variables disponibles para visualización
const VARIABLES = {
    'noise_avg': {
        label: 'Ruido',
        alert: { value: 70, text: '70 dBA' },          // categoría 'Muy ruidoso' (ajustable a la norma aplicable)
        unit: 'dBA',
        icon: 'noise',
        short: 'Ruido',
        decimals: 1,
        colorScale: [
            { max: 50, color: '#00e400', label: 'Silencioso' },
            { max: 60, color: '#ffff00', label: 'Moderado' },
            { max: 70, color: '#ff7e00', label: 'Ruidoso' },
            { max: 80, color: '#ff0000', label: 'Muy Ruidoso' },
            { max: Infinity, color: '#8f3f97', label: 'Extremo' }
        ]
    },
    'pm25_avg': {
        label: 'PM2.5',
        alert: { value: 35.4, text: '35.4 µg/m³' },     // 'Insalubre para grupos sensibles' (EPA, 24 h)
        unit: 'µg/m³',
        icon: 'particles',
        short: 'PM2.5',
        decimals: 1,
        colorScale: [
            { max: 12, color: '#00e400', label: 'Buena' },
            { max: 35.4, color: '#ffff00', label: 'Moderada' },
            { max: 55.4, color: '#ff7e00', label: 'Insalubre SG' },
            { max: 150.4, color: '#ff0000', label: 'Insalubre' },
            { max: 250.4, color: '#8f3f97', label: 'Muy Insalubre' },
            { max: Infinity, color: '#7e0023', label: 'Peligrosa' }
        ]
    },
    'pm10_avg': {
        label: 'PM10',
        alert: { value: 154, text: '154 µg/m³' },
        unit: 'µg/m³',
        icon: 'particles',
        short: 'PM10',
        decimals: 1,
        colorScale: [
            { max: 54, color: '#00e400', label: 'Buena' },
            { max: 154, color: '#ffff00', label: 'Moderada' },
            { max: 254, color: '#ff7e00', label: 'Insalubre SG' },
            { max: 354, color: '#ff0000', label: 'Insalubre' },
            { max: 424, color: '#8f3f97', label: 'Muy Insalubre' },
            { max: Infinity, color: '#7e0023', label: 'Peligrosa' }
        ]
    },
    'o3_avg': {
        label: 'Ozono',
        alert: { value: 70, text: '70 ppb' },
        unit: 'ppb',
        icon: 'ozone',
        short: 'Ozono',
        decimals: 1,
        colorScale: [
            { max: 54, color: '#00e400', label: 'Buena' },
            { max: 70, color: '#ffff00', label: 'Moderada' },
            { max: 85, color: '#ff7e00', label: 'Insalubre SG' },
            { max: 105, color: '#ff0000', label: 'Insalubre' },
            { max: 200, color: '#8f3f97', label: 'Muy Insalubre' },
            { max: Infinity, color: '#7e0023', label: 'Peligrosa' }
        ]
    },
    'co_avg': {
        label: 'Monóxido de carbono',
        alert: { value: 9400, text: '9,400 ppb' },
        unit: 'ppb',
        icon: 'co',
        short: 'CO',
        decimals: 0,
        colorScale: [
            { max: 4400, color: '#00e400', label: 'Buena' },
            { max: 9400, color: '#ffff00', label: 'Moderada' },
            { max: 12400, color: '#ff7e00', label: 'Insalubre SG' },
            { max: 15400, color: '#ff0000', label: 'Insalubre' },
            { max: 30400, color: '#8f3f97', label: 'Muy Insalubre' },
            { max: Infinity, color: '#7e0023', label: 'Peligrosa' }
        ]
    },
    'temperature_avg': {
        label: 'Temperatura',
        alert: { percentile: 95 },                        // sin umbral de salud: 5% de horas más cálidas del historial
        unit: '°C',
        icon: 'thermometer',
        short: 'Temperatura',
        decimals: 1,
        colorScale: [
            { max: 10, color: '#1e3a8a', label: 'Muy Frío' },
            { max: 15, color: '#3b82f6', label: 'Frío' },
            { max: 20, color: '#22c55e', label: 'Fresco' },
            { max: 25, color: '#eab308', label: 'Templado' },
            { max: 30, color: '#f97316', label: 'Cálido' },
            { max: 35, color: '#ef4444', label: 'Caliente' },
            { max: Infinity, color: '#7f1d1d', label: 'Muy Caliente' }
        ]
    },
    'humidity_avg': {
        label: 'Humedad',
        alert: { percentile: 95 },
        unit: '%',
        icon: 'droplet',
        short: 'Humedad',
        decimals: 0,
        colorScale: [
            { max: 30, color: '#fef08a', label: 'Seco' },
            { max: 50, color: '#bae6fd', label: 'Confortable' },
            { max: 70, color: '#38bdf8', label: 'Húmedo' },
            { max: 85, color: '#2563eb', label: 'Muy Húmedo' },
            { max: Infinity, color: '#1e3a8a', label: 'Extremo' }
        ]
    },
    'aqi': {
        label: 'AQI',
        alert: { value: 100, text: 'AQI 100' },
        unit: '',
        icon: 'gauge',
        short: 'AQI',
        decimals: 0,
        colorScale: [
            { max: 50, color: '#00e400', label: 'Buena' },
            { max: 100, color: '#ffff00', label: 'Moderada' },
            { max: 150, color: '#ff7e00', label: 'Insalubre SG' },
            { max: 200, color: '#ff0000', label: 'Insalubre' },
            { max: 300, color: '#8f3f97', label: 'Muy Insalubre' },
            { max: Infinity, color: '#7e0023', label: 'Peligrosa' }
        ]
    }
};

// Función auxiliar para obtener color según valor
function getColorForValue(variable, value) {
    const varConfig = VARIABLES[variable];
    if (!varConfig) return '#94a3b8';
    
    for (let scale of varConfig.colorScale) {
        if (value <= scale.max) {
            return scale.color;
        }
    }
    return varConfig.colorScale[varConfig.colorScale.length - 1].color;
}

// Categoría (texto) según valor
function getCategoryForValue(variable, value) {
    const varConfig = VARIABLES[variable];
    if (!varConfig) return '';
    const scale = varConfig.colorScale.find(s => value <= s.max) || varConfig.colorScale[varConfig.colorScale.length - 1];
    return scale.label;
}

// Función para obtener el radio del marcador según intensidad
function getRadiusForValue(variable, value) {
    const varConfig = VARIABLES[variable];
    if (!varConfig) return 10;
    
    // CASO ESPECIAL: Ruido necesita rango más amplio y visible
    if (variable === 'noise_avg') {
        if (value < 45) return 6;
        if (value < 55) return 10;
        if (value < 65) return 16;
        if (value < 75) return 24;
        if (value < 85) return 30;
        return 35;
    }
    
    const scales = varConfig.colorScale;
    const maxValue = scales[scales.length - 2].max;
    const normalized = Math.min(value / maxValue, 1);
    return 8 + (normalized * 17);
}

// GeoJSON del Corredor Verde (será cargado dinámicamente)
const CORREDOR_VERDE_GEOJSON = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "name": "Corredor Verde",
                "description": "Eje principal del Corredor Verde Guatemala"
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [-90.560, 14.610],
                    [-90.558, 14.612],
                    [-90.556, 14.615],
                    [-90.554, 14.618],
                    [-90.552, 14.620]
                ]
            }
        }
    ]
};
