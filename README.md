# 🌿 Corredor Verde Guatemala - Dashboard Ambiental

Dashboard interactivo para monitorear la calidad del aire, ruido y otras variables ambientales en el proyecto Corredor Verde de Ciudad de Guatemala.

## 📋 Características

- **Visualización histórica** de hasta 20 días de datos ambientales
- **Variables monitoreadas**: 
  - 🔊 Ruido (dB)
  - 💨 PM2.5 y PM10
  - 🌫️ Ozono (O₃)
  - ⚠️ Monóxido de Carbono (CO)
  - 🌡️ Temperatura
  - 💧 Humedad relativa
  - 📈 Índice de Calidad del Aire (AQI)
- **Animación temporal** con slider hora por hora
- **Mapa interactivo** con visualización geográfica del corredor
- **Zona horaria**: UTC-6 (Guatemala)

## 📁 Estructura del Proyecto

```
corredor-verde-gt/
├── index.html              # Estructura HTML principal
├── styles.css              # Estilos CSS
├── app.js                  # Lógica principal de la aplicación
├── constants.js            # Configuración y constantes
├── corredor_verde.geojson  # GeoJSON del eje del corredor
└── README.md               # Este archivo
```

## 🚀 Deployment en Netlify

### Opción 1: Netlify Drop (Más Rápido)

1. Ve a [https://app.netlify.com/drop](https://app.netlify.com/drop)
2. Arrastra la carpeta completa del proyecto
3. ¡Listo! Tu sitio estará en línea en segundos

### Opción 2: GitHub + Netlify (Recomendado para producción)

#### Paso 1: Crear repositorio en GitHub

```bash
# Inicializar repositorio local
cd corredor-verde-gt
git init

# Agregar archivos
git add .
git commit -m "Initial commit: Corredor Verde Dashboard"

# Crear repositorio en GitHub y conectar
git remote add origin https://github.com/TU_USUARIO/corredor-verde-gt.git
git branch -M main
git push -u origin main
```

#### Paso 2: Conectar con Netlify

1. Ve a [https://app.netlify.com](https://app.netlify.com)
2. Click en "Add new site" → "Import an existing project"
3. Selecciona "GitHub" y autoriza
4. Busca tu repositorio `corredor-verde-gt`
5. Configuración de build:
   - **Build command**: (dejar vacío)
   - **Publish directory**: `/` (raíz)
6. Click en "Deploy site"

#### Paso 3: Configurar dominio personalizado (Opcional)

1. En tu sitio de Netlify, ve a "Domain settings"
2. Click en "Add custom domain"
3. Ingresa tu dominio (ej: `corredor-verde.tu-dominio.com`)
4. Sigue las instrucciones para configurar DNS

## 🔧 Configuración

### Cambiar el dispositivo monitoreado

Edita `constants.js`:

```javascript
const API_CONFIG = {
    baseUrl: 'https://jciiy1ok97.execute-api.us-east-1.amazonaws.com/default/getData',
    deviceID: 'SMAA_XXX', // Cambiar por tu ID de dispositivo
    action: 'hourly_history'
};
```

### Ajustar la ubicación del mapa

Edita `constants.js`:

```javascript
const SENSOR_LOCATION = {
    id: 'SMAA_002',
    name: 'Tu Estación',
    lat: 14.XXXXX,  // Tu latitud
    lon: -90.XXXXX, // Tu longitud
    city: 'Tu Ciudad'
};
```

### Personalizar el GeoJSON del corredor

Edita `corredor_verde.geojson` con las coordenadas reales de tu proyecto usando herramientas como:
- [geojson.io](https://geojson.io)
- [QGIS](https://qgis.org)

## 🌐 API Endpoint

El dashboard consume datos de:
```
https://jciiy1ok97.execute-api.us-east-1.amazonaws.com/default/getData
```

**Parámetros requeridos:**
- `action=hourly_history`
- `deviceID=SMAA_002`
- `days=10` (7, 10 o 20)

**Formato de respuesta esperado:**
```json
{
  "deviceID": "SMAA_002",
  "days": 10,
  "hours": 240,
  "data": [
    {
      "hour_timestamp_utc": 1774371600,
      "noise_avg": 67.34,
      "pm25_avg": 13.8,
      "temperature_avg": 28.32,
      "aqi": 55,
      "aqi_category": "Moderate",
      ...
    }
  ]
}
```

## 🎨 Personalización de Estilos

Los colores principales del dashboard están en `styles.css`:

```css
/* Verde principal del proyecto */
.header {
    background: linear-gradient(135deg, #1e3a8a 0%, #065f46 100%);
}

/* Acento verde */
--color-accent: #10b981;
```

## 📱 Responsive Design

El dashboard está optimizado para:
- 📱 Móviles (< 768px)
- 💻 Tablets (768px - 1024px)
- 🖥️ Desktop (> 1024px)

## 🐛 Troubleshooting

### El mapa no se muestra
- Verifica que Leaflet CSS y JS estén cargando correctamente
- Abre la consola del navegador (F12) y busca errores

### No cargan los datos históricos
- Verifica que la API esté respondiendo correctamente
- Revisa la consola para ver el error específico
- Confirma que el `deviceID` sea correcto

### Error de CORS
- La API debe permitir solicitudes desde tu dominio
- Contacta al administrador de la API para configurar CORS

## 📊 Variables de Calidad del Aire

### Escala AQI (Air Quality Index)

| AQI | Categoría | Color | Descripción |
|-----|-----------|-------|-------------|
| 0-50 | Buena | Verde | Calidad del aire satisfactoria |
| 51-100 | Moderada | Amarillo | Aceptable para la mayoría |
| 101-150 | Insalubre para grupos sensibles | Naranja | Grupos sensibles pueden experimentar efectos |
| 151-200 | Insalubre | Rojo | Todos pueden comenzar a experimentar efectos |
| 201-300 | Muy Insalubre | Púrpura | Alerta sanitaria |
| 301+ | Peligrosa | Marrón | Emergencia sanitaria |

## 🤝 Contribuciones

Este proyecto es parte de una propuesta de Smability para el Corredor Verde de Guatemala.

**Desarrollado por:** Smability  
**Contacto:** info@smability.io

## 📄 Licencia

© 2025 Smability - Todos los derechos reservados

## 🔗 Enlaces

- [Smability](https://smability.io)
- [Twitter/X](https://x.com/SmabilityMX)
- [LinkedIn](https://linkedin.com/company/smability)
