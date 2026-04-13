// =====================================================
// CONSTANTES - CORREDOR VERDE GUATEMALA
// =====================================================

// Ubicación del sensor SMAA_002
const SENSOR_LOCATION = {
    id: 'SMAA_002',
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

// Configuración del mapa
const MAP_CONFIG = {
    center: [14.615641, -90.556407],
    zoom: 14,
    minZoom: 12,
    maxZoom: 17,
    tileLayer: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> | Smability'
};

// Variables disponibles para visualización
const VARIABLES = {
    'noise_avg': {
        label: 'Ruido',
        unit: 'dB',
        icon: '🔊',
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
        unit: 'µg/m³',
        icon: '💨',
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
        unit: 'µg/m³',
        icon: '💨',
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
        unit: 'ppb',
        icon: '🌫️',
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
        label: 'Monóxido de Carbono',
        unit: 'ppb',
        icon: '⚠️',
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
        unit: '°C',
        icon: '🌡️',
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
        unit: '%',
        icon: '💧',
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
        unit: '',
        icon: '📈',
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
