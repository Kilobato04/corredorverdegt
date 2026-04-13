// =====================================================
// CORREDOR VERDE GUATEMALA - APP PRINCIPAL
// =====================================================

class CorredorVerdeApp {
    constructor() {
        this.map = null;
        this.marker = null;
        this.corridorLayer = null;
        this.historicalData = [];
        this.currentDataIndex = 0;
        this.isPlaying = false;
        this.playInterval = null;
        this.currentVariable = 'noise_avg';
        this.currentPeriod = 10;
    }

    async init() {
        console.log("🌿 Iniciando Corredor Verde Monitor...");
        
        // 1. Inicializar Mapa
        this.initMap();
        
        // 2. Cargar datos históricos
        await this.loadHistoricalData();
        
        // 3. Dibujar corredor verde
        this.drawCorridor();
        
        // 4. Setup UI controls
        this.setupControls();
        
        // 5. Mostrar primer punto de datos
        this.updateVisualization(this.historicalData.length - 1);
        
        console.log("✅ Aplicación inicializada correctamente");
    }

    initMap() {
        this.map = L.map('map-container', {
            center: MAP_CONFIG.center,
            zoom: MAP_CONFIG.zoom,
            zoomControl: false,
            preferCanvas: true,
            minZoom: MAP_CONFIG.minZoom,
            maxZoom: MAP_CONFIG.maxZoom
        });
        
        // Tile layer Carto Dark
        L.tileLayer(MAP_CONFIG.tileLayer, {
            attribution: MAP_CONFIG.attribution
        }).addTo(this.map);
        
        // Zoom control en la derecha
        L.control.zoom({ position: 'topright' }).addTo(this.map);
        
        console.log("🗺️ Mapa inicializado");
    }

    drawCorridor() {
        if (this.corridorLayer) {
            this.map.removeLayer(this.corridorLayer);
        }
        
        this.corridorLayer = L.geoJSON(CORREDOR_VERDE_GEOJSON, {
            style: {
                color: '#10b981',
                weight: 5,
                opacity: 0.8,
                dashArray: '10, 5'
            }
        }).addTo(this.map);
        
        console.log("🛣️ Corredor Verde dibujado");
    }

    async loadHistoricalData() {
        const loadingEl = document.getElementById('loading-overlay');
        const controlsEl = document.getElementById('controls-area');
        
        try {
            const url = `${API_CONFIG.baseUrl}?action=${API_CONFIG.action}&deviceID=${API_CONFIG.deviceID}&days=${this.currentPeriod}`;
            
            console.log(`📡 Cargando datos de: ${url}`);
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            
            const result = await response.json();
            
            if (result && result.data && Array.isArray(result.data)) {
                this.historicalData = result.data.sort((a, b) => a.hour_timestamp_utc - b.hour_timestamp_utc);
                
                console.log(`✅ Datos cargados: ${this.historicalData.length} registros`);
                
                // Configurar slider
                this.setupSlider();
                
                // Ocultar loading, mostrar controles
                if (loadingEl) loadingEl.style.display = 'none';
                if (controlsEl) controlsEl.style.display = 'block';
                
                // Actualizar info
                this.updateLastSync();
                
            } else {
                throw new Error("Formato de datos inválido");
            }
        } catch (error) {
            console.error("❌ Error cargando datos:", error);
            if (loadingEl) {
                loadingEl.innerHTML = `
                    <div style="color: #ef4444;">
                        ❌ Error al cargar datos<br>
                        <small>${error.message}</small>
                    </div>
                `;
            }
        }
    }

    setupSlider() {
        const slider = document.getElementById('time-slider');
        const startLabel = document.getElementById('slider-start');
        const endLabel = document.getElementById('slider-end');
        
        if (!slider || this.historicalData.length === 0) return;
        
        slider.min = 0;
        slider.max = this.historicalData.length - 1;
        slider.value = this.historicalData.length - 1; // Empezar en el más reciente
        
        // Labels
        const firstDate = this.convertToGuatemalaTime(this.historicalData[0].hour_timestamp_utc);
        const lastDate = this.convertToGuatemalaTime(this.historicalData[this.historicalData.length - 1].hour_timestamp_utc);
        
        if (startLabel) startLabel.textContent = this.formatShortDate(firstDate);
        if (endLabel) endLabel.textContent = this.formatShortDate(lastDate);
        
        slider.addEventListener('input', (e) => {
            this.updateVisualization(parseInt(e.target.value));
        });
    }

    setupControls() {
        // Variable selector
        const varSelect = document.getElementById('variable-selector');
        if (varSelect) {
            varSelect.addEventListener('change', (e) => {
                this.currentVariable = e.target.value;
                this.updateVisualization(this.currentDataIndex);
            });
        }
        
        // Period selector
        const periodSelect = document.getElementById('period-selector');
        if (periodSelect) {
            periodSelect.addEventListener('change', async (e) => {
                this.currentPeriod = parseInt(e.target.value);
                await this.loadHistoricalData();
                this.updateVisualization(this.historicalData.length - 1);
            });
        }
        
        // Play button
        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.togglePlay();
            });
        }
        
        // Menu toggle
        const menuBtn = document.getElementById('menu-toggle');
        const infoPanel = document.getElementById('info-panel');
        
        if (menuBtn && infoPanel) {
            menuBtn.addEventListener('click', () => {
                infoPanel.classList.toggle('collapsed');
                setTimeout(() => { this.map.invalidateSize(); }, 300);
            });
        }
    }

    updateVisualization(index) {
        if (!this.historicalData || index < 0 || index >= this.historicalData.length) return;
        
        this.currentDataIndex = index;
        const data = this.historicalData[index];
        
        // Actualizar marcador
        this.updateMarker(data);
        
        // Actualizar panel de información
        this.updateInfoPanel(data);
        
        // Actualizar slider
        const slider = document.getElementById('time-slider');
        if (slider) slider.value = index;
    }

    updateMarker(data) {
        const value = data[this.currentVariable];
        const color = getColorForValue(this.currentVariable, value);
        const radius = getRadiusForValue(this.currentVariable, value);
        
        if (this.marker) {
            this.map.removeLayer(this.marker);
        }
        
        this.marker = L.circleMarker([SENSOR_LOCATION.lat, SENSOR_LOCATION.lon], {
            radius: radius,
            fillColor: color,
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(this.map);
        
        const varConfig = VARIABLES[this.currentVariable];
        const guatemalaTime = this.convertToGuatemalaTime(data.hour_timestamp_utc);
        
        this.marker.bindPopup(`
            <div style="font-family: sans-serif; min-width: 180px;">
                <h4 style="margin: 0 0 8px 0; color: #10b981;">${SENSOR_LOCATION.name}</h4>
                <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 8px;">
                    ${this.formatFullDate(guatemalaTime)}
                </div>
                <div style="font-size: 1.3rem; font-weight: bold; color: ${color}; margin-bottom: 8px;">
                    ${varConfig.icon} ${value} ${varConfig.unit}
                </div>
                <div style="font-size: 0.8rem; background: rgba(0,0,0,0.2); padding: 6px; border-radius: 6px;">
                    <b>AQI:</b> ${data.aqi} (${data.aqi_category})<br>
                    <b>Contaminante:</b> ${data.aqi_pollutant}<br>
                    <b>Temp:</b> ${data.temperature_avg}°C
                </div>
            </div>
        `);
    }

    updateInfoPanel(data) {
        const guatemalaTime = this.convertToGuatemalaTime(data.hour_timestamp_utc);
        
        // Datetime display
        const datetimeEl = document.getElementById('current-datetime');
        if (datetimeEl) {
            datetimeEl.textContent = this.formatFullDate(guatemalaTime);
        }
        
        // Current stats
        const aqiEl = document.getElementById('current-aqi');
        const categoryEl = document.getElementById('current-category');
        const noiseEl = document.getElementById('current-noise');
        const tempEl = document.getElementById('current-temp');
        
        if (aqiEl) aqiEl.textContent = data.aqi || '--';
        if (categoryEl) {
            categoryEl.textContent = data.aqi_category || '--';
            categoryEl.style.color = getColorForValue('aqi', data.aqi);
        }
        if (noiseEl) noiseEl.textContent = `${data.noise_avg} dB`;
        if (tempEl) tempEl.textContent = `${data.temperature_avg}°C`;
    }

    updateLastSync() {
        const updateEl = document.getElementById('last-update');
        if (updateEl) {
            const now = new Date();
            updateEl.textContent = `Actualizado: ${now.toLocaleTimeString('es-GT', { 
                hour: '2-digit', 
                minute: '2-digit',
                timeZone: 'America/Guatemala'
            })}`;
        }
    }

    togglePlay() {
        const playBtn = document.getElementById('play-btn');
        
        if (this.isPlaying) {
            clearInterval(this.playInterval);
            this.isPlaying = false;
            if (playBtn) playBtn.textContent = '▶';
        } else {
            this.isPlaying = true;
            if (playBtn) playBtn.textContent = '⏸';
            
            this.playInterval = setInterval(() => {
                let nextIndex = this.currentDataIndex - 1;
                
                if (nextIndex < 0) {
                    nextIndex = this.historicalData.length - 1; // Loop
                }
                
                this.updateVisualization(nextIndex);
            }, 1000); // 1 segundo por frame
        }
    }

    convertToGuatemalaTime(utcTimestamp) {
        const utcDate = new Date(utcTimestamp * 1000);
        const guatemalaOffset = TIMEZONE_OFFSET * 60 * 60 * 1000;
        return new Date(utcDate.getTime() + guatemalaOffset);
    }

    formatFullDate(date) {
        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        return date.toLocaleString('es-GT', options);
    }

    formatShortDate(date) {
        return date.toLocaleDateString('es-GT', { 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit'
        });
    }
}

// Inicializar al cargar el DOM
const app = new CorredorVerdeApp();
document.addEventListener('DOMContentLoaded', () => app.init());
