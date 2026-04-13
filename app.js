// =====================================================
// CORREDOR VERDE GUATEMALA - APP PRINCIPAL
// Con gráfica Plotly histórica + marcador rewind
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
        this.plotlyChart = null;
        this.chartTimestamps = [];
        this.chartValues = [];
    }

    async init() {
        console.log("🌿 Iniciando Corredor Verde Monitor...");
        this.initMap();
        await this.loadHistoricalData();
        this.drawCorridor();
        this.setupControls();
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
        L.tileLayer(MAP_CONFIG.tileLayer, {
            attribution: MAP_CONFIG.attribution
        }).addTo(this.map);
        L.control.zoom({ position: 'topright' }).addTo(this.map);
    }

    async drawCorridor() {
        if (this.corridorLayer) this.map.removeLayer(this.corridorLayer);
        try {
            const response = await fetch('eje_corredor_verde.geojson');
            const geojsonData = await response.json();
            this.corridorLayer = L.geoJSON(geojsonData, {
                style: function(feature) {
                    if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
                        return { color: '#10b981', weight: 6, opacity: 0.9, dashArray: '10, 5', lineCap: 'round' };
                    } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                        return { color: '#10b981', weight: 2, opacity: 0.6, fillColor: '#10b981', fillOpacity: 0.15 };
                    }
                },
                onEachFeature: function(feature, layer) {
                    if (feature.properties && feature.properties.name) {
                        layer.bindPopup(`<b>${feature.properties.name}</b>`);
                    }
                }
            }).addTo(this.map);
        } catch (error) {
            console.warn("⚠️ Usando geometría de respaldo");
            this.corridorLayer = L.geoJSON(CORREDOR_VERDE_GEOJSON, {
                style: { color: '#10b981', weight: 6, opacity: 0.9, dashArray: '10, 5', lineCap: 'round' }
            }).addTo(this.map);
        }
    }

    async loadHistoricalData() {
        const loadingEl = document.getElementById('loading-overlay');
        const controlsEl = document.getElementById('controls-area');
        const chartEl = document.getElementById('chart-section');
        try {
            const url = `${API_CONFIG.baseUrl}?action=${API_CONFIG.action}&deviceID=${API_CONFIG.deviceID}&days=${this.currentPeriod}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            const result = await response.json();
            if (result && result.data && Array.isArray(result.data)) {
                this.historicalData = result.data.sort((a, b) => a.hour_timestamp_utc - b.hour_timestamp_utc);
                this.setupSlider();
                if (loadingEl) loadingEl.style.display = 'none';
                if (controlsEl) controlsEl.style.display = 'block';
                if (chartEl) chartEl.style.display = 'block';
                this.updateLastSync();
                this.buildChart();
            } else {
                throw new Error("Formato de datos inválido");
            }
        } catch (error) {
            console.error("❌ Error cargando datos:", error);
            if (loadingEl) {
                loadingEl.innerHTML = `<div style="color:#ef4444;">❌ Error al cargar datos<br><small>${error.message}</small></div>`;
            }
        }
    }

    // ==================================================
    // PLOTLY CHART — histórico completo + marcador
    // ==================================================
    buildChart() {
        const container = document.getElementById('plotly-chart');
        if (!container || this.historicalData.length === 0) return;

        const varConfig = VARIABLES[this.currentVariable];

        // Prepare arrays
        this.chartTimestamps = [];
        this.chartValues = [];
        const colors = [];

        this.historicalData.forEach(d => {
            const gt = this.convertToGuatemalaTime(d.hour_timestamp_utc);
            this.chartTimestamps.push(gt);
            const val = d[this.currentVariable] ?? 0;
            this.chartValues.push(val);
            colors.push(getColorForValue(this.currentVariable, val));
        });

        // Build color-segmented line via gradient trick:
        // We use a scatter with line colored by segment
        const trace = {
            x: this.chartTimestamps,
            y: this.chartValues,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#10b981', width: 1.5, shape: 'spline' },
            fill: 'tozeroy',
            fillcolor: 'rgba(16,185,129,0.08)',
            hovertemplate:
                `<b>${varConfig.icon} %{y:.1f} ${varConfig.unit}</b><br>` +
                '%{x|%d %b %Y  %H:%M}<br>' +
                '<extra></extra>',
            name: varConfig.label
        };

        // Vertical marker line (current position)
        const currentTs = this.chartTimestamps[this.currentDataIndex];
        const markerLine = {
            type: 'line',
            x0: currentTs, x1: currentTs,
            y0: 0, y1: 1,
            yref: 'paper',
            line: { color: '#38bdf8', width: 2, dash: 'dot' }
        };

        // Marker dot at intersection
        const markerDot = {
            x: [currentTs],
            y: [this.chartValues[this.currentDataIndex]],
            type: 'scatter',
            mode: 'markers',
            marker: {
                color: '#38bdf8',
                size: 8,
                line: { color: '#fff', width: 1.5 },
                symbol: 'circle'
            },
            hoverinfo: 'skip',
            showlegend: false
        };

        const layout = {
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { t: 8, r: 10, b: 36, l: 38 },
            font: { family: 'Segoe UI, sans-serif', size: 10, color: '#94a3b8' },
            xaxis: {
                type: 'date',
                gridcolor: 'rgba(45,55,72,0.4)',
                linecolor: 'rgba(45,55,72,0.6)',
                tickformat: '%d %b\n%H:%M',
                tickfont: { size: 9, color: '#64748b' },
                zeroline: false,
                showgrid: true,
                nticks: 6,
                hoverformat: '%d %b %Y %H:%M'
            },
            yaxis: {
                gridcolor: 'rgba(45,55,72,0.4)',
                linecolor: 'rgba(45,55,72,0.6)',
                tickfont: { size: 9, color: '#64748b' },
                zeroline: false,
                showgrid: true,
                title: { text: varConfig.unit, font: { size: 9, color: '#64748b' } }
            },
            shapes: [markerLine],
            hoverlabel: {
                bgcolor: 'rgba(15,20,25,0.95)',
                bordercolor: '#38bdf8',
                font: { color: '#e2e8f0', size: 11 }
            },
            dragmode: false
        };

        const config = {
            displayModeBar: false,
            responsive: true,
            staticPlot: false
        };

        Plotly.newPlot(container, [trace, markerDot], layout, config);
        this.plotlyChart = container;

        // Click on chart to jump to that time
        container.on('plotly_click', (eventData) => {
            if (eventData.points && eventData.points[0]) {
                const clickedIndex = eventData.points[0].pointIndex;
                if (clickedIndex !== undefined && clickedIndex < this.historicalData.length) {
                    this.updateVisualization(clickedIndex);
                }
            }
        });

        this.updateChartTitle();
    }

    updateChartMarker(index) {
        if (!this.plotlyChart || this.chartTimestamps.length === 0) return;

        const ts = this.chartTimestamps[index];
        const val = this.chartValues[index];

        // Update vertical line
        const layoutUpdate = {
            'shapes[0].x0': ts,
            'shapes[0].x1': ts
        };
        Plotly.relayout(this.plotlyChart, layoutUpdate);

        // Update marker dot position
        Plotly.restyle(this.plotlyChart, {
            x: [[ts]],
            y: [[val]]
        }, [1]); // trace index 1 = marker dot

        // Update tooltip
        const tooltip = document.getElementById('chart-tooltip');
        if (tooltip) {
            const varConfig = VARIABLES[this.currentVariable];
            const color = getColorForValue(this.currentVariable, val);
            const dateStr = this.formatFullDate(ts);
            tooltip.innerHTML =
                `<span style="color:${color};font-weight:700;">${varConfig.icon} ${val.toFixed(1)} ${varConfig.unit}</span>` +
                `<span style="color:#64748b;margin-left:8px;">${dateStr}</span>`;
            tooltip.classList.add('visible');
        }
    }

    updateChartTitle() {
        const titleEl = document.getElementById('chart-title');
        if (titleEl) {
            const varConfig = VARIABLES[this.currentVariable];
            titleEl.textContent = `📈 ${varConfig.label} — Últimos ${this.currentPeriod} días`;
        }
    }

    // ==================================================
    // SLIDER
    // ==================================================
    setupSlider() {
        const slider = document.getElementById('time-slider');
        const startLabel = document.getElementById('slider-start');
        const endLabel = document.getElementById('slider-end');
        if (!slider || this.historicalData.length === 0) return;

        slider.min = 0;
        slider.max = this.historicalData.length - 1;
        slider.value = this.historicalData.length - 1;

        const firstDate = this.convertToGuatemalaTime(this.historicalData[0].hour_timestamp_utc);
        const lastDate = this.convertToGuatemalaTime(this.historicalData[this.historicalData.length - 1].hour_timestamp_utc);
        if (startLabel) startLabel.textContent = this.formatShortDate(firstDate);
        if (endLabel) endLabel.textContent = this.formatShortDate(lastDate);

        slider.addEventListener('input', (e) => {
            this.updateVisualization(parseInt(e.target.value));
        });
    }

    setupControls() {
        const varSelect = document.getElementById('variable-selector');
        if (varSelect) {
            varSelect.addEventListener('change', (e) => {
                this.currentVariable = e.target.value;
                this.buildChart(); // rebuild chart for new variable
                this.updateVisualization(this.currentDataIndex);
            });
        }

        const periodSelect = document.getElementById('period-selector');
        if (periodSelect) {
            periodSelect.addEventListener('change', async (e) => {
                this.currentPeriod = parseInt(e.target.value);
                await this.loadHistoricalData();
                this.updateVisualization(this.historicalData.length - 1);
            });
        }

        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', () => this.togglePlay());
        }

        const menuBtn = document.getElementById('menu-toggle');
        const infoPanel = document.getElementById('info-panel');
        if (menuBtn && infoPanel) {
            menuBtn.addEventListener('click', () => {
                infoPanel.classList.toggle('collapsed');
                setTimeout(() => { this.map.invalidateSize(); }, 300);
            });
        }
    }

    // ==================================================
    // VISUALIZATION UPDATE — mapa + panel + chart marker
    // ==================================================
    updateVisualization(index) {
        if (!this.historicalData || index < 0 || index >= this.historicalData.length) return;
        this.currentDataIndex = index;
        const data = this.historicalData[index];

        this.updateMarker(data);
        this.updateInfoPanel(data);
        this.updateChartMarker(index);

        const slider = document.getElementById('time-slider');
        if (slider) slider.value = index;
    }

    updateMarker(data) {
        const value = data[this.currentVariable];
        const color = getColorForValue(this.currentVariable, value);
        const radius = getRadiusForValue(this.currentVariable, value);

        if (this.marker) this.map.removeLayer(this.marker);

        this.marker = L.circleMarker([SENSOR_LOCATION.lat, SENSOR_LOCATION.lon], {
            radius, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.8
        }).addTo(this.map);

        const varConfig = VARIABLES[this.currentVariable];
        const guatemalaTime = this.convertToGuatemalaTime(data.hour_timestamp_utc);

        this.marker.bindPopup(`
            <div style="font-family:sans-serif;min-width:180px;">
                <h4 style="margin:0 0 8px;color:#10b981;">${SENSOR_LOCATION.name}</h4>
                <div style="font-size:0.85rem;color:#94a3b8;margin-bottom:8px;">${this.formatFullDate(guatemalaTime)}</div>
                <div style="font-size:1.3rem;font-weight:bold;color:${color};margin-bottom:8px;">
                    ${varConfig.icon} ${value} ${varConfig.unit}
                </div>
                <div style="font-size:0.8rem;background:rgba(0,0,0,0.2);padding:6px;border-radius:6px;">
                    <b>AQI:</b> ${data.aqi} (${data.aqi_category})<br>
                    <b>Contaminante:</b> ${data.aqi_pollutant}<br>
                    <b>Temp:</b> ${data.temperature_avg}°C
                </div>
            </div>
        `);
    }

    updateInfoPanel(data) {
        const guatemalaTime = this.convertToGuatemalaTime(data.hour_timestamp_utc);
        const datetimeEl = document.getElementById('current-datetime');
        if (datetimeEl) datetimeEl.textContent = this.formatFullDate(guatemalaTime);

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
                hour: '2-digit', minute: '2-digit', timeZone: 'America/Guatemala'
            })}`;
        }
    }

    // ==================================================
    // PLAY / REWIND — va hacia atrás (rewind)
    // ==================================================
    togglePlay() {
        const playBtn = document.getElementById('play-btn');
        if (this.isPlaying) {
            clearInterval(this.playInterval);
            this.isPlaying = false;
            if (playBtn) playBtn.textContent = '⏪';
        } else {
            this.isPlaying = true;
            if (playBtn) playBtn.textContent = '⏸';

            this.playInterval = setInterval(() => {
                let nextIndex = this.currentDataIndex - 1;
                if (nextIndex < 0) {
                    // Reached the beginning — stop and reset
                    clearInterval(this.playInterval);
                    this.isPlaying = false;
                    if (playBtn) playBtn.textContent = '⏪';
                    nextIndex = this.historicalData.length - 1;
                }
                this.updateVisualization(nextIndex);
            }, 200); // 5x speed
        }
    }

    // ==================================================
    // UTILIDADES
    // ==================================================
    convertToGuatemalaTime(utcTimestamp) {
        const utcDate = new Date(utcTimestamp * 1000);
        const guatemalaOffset = TIMEZONE_OFFSET * 60 * 60 * 1000;
        return new Date(utcDate.getTime() + guatemalaOffset);
    }

    formatFullDate(date) {
        return date.toLocaleString('es-GT', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    }

    formatShortDate(date) {
        return date.toLocaleDateString('es-GT', {
            month: 'short', day: 'numeric', hour: '2-digit'
        });
    }
}

// Inicializar
const app = new CorredorVerdeApp();
document.addEventListener('DOMContentLoaded', () => app.init());
