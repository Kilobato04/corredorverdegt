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
        this.currentPeriod = (typeof DEFAULT_PERIOD !== 'undefined') ? DEFAULT_PERIOD : 20;
        this.fetchController = null;
        this.loadedPeriod = null;
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

        // Mapas base (ver MAP_CONFIG.basemaps en constants.js)
        const bm = MAP_CONFIG.basemaps;
        const makeLayer = (cfg) => L.tileLayer(cfg.url, {
            attribution: cfg.attribution,
            tileSize: cfg.tileSize || 256,
            zoomOffset: cfg.zoomOffset || 0,
            maxZoom: MAP_CONFIG.maxZoom
        });
        const darkLayer = makeLayer(bm.dark);
        const satelliteLayer = makeLayer(bm.satellite);
        const fallbackLayer = makeLayer(bm.fallback);

        darkLayer.addTo(this.map);

        const baseMaps = {
            [bm.dark.label]: darkLayer,
            [bm.satellite.label]: satelliteLayer,
            [bm.fallback.label]: fallbackLayer
        };
        L.control.layers(baseMaps, null, {
            position: 'topright',
            collapsed: true
        }).addTo(this.map);

        // Respaldo: si Mapbox rechaza el token (401/403, URL no autorizada), cambiar a CARTO
        let loaded = 0, errors = 0;
        darkLayer.on('tileload', () => { loaded++; });
        darkLayer.on('tileerror', () => {
            errors++;
            if (errors >= 4 && loaded === 0 && this.map.hasLayer(darkLayer)) {
                console.warn('⚠️ Mapbox no autorizó el token para este dominio; usando CARTO como respaldo.');
                this.map.removeLayer(darkLayer);
                fallbackLayer.addTo(this.map);
            }
        });

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
        const periodSelect = document.getElementById('period-selector');
        const days = this.currentPeriod;

        // Cancelar una consulta anterior si el usuario cambió de periodo rápido
        if (this.fetchController) this.fetchController.abort();
        this.fetchController = new AbortController();

        this.stopPlay();
        if (periodSelect) periodSelect.disabled = true;
        this.setCoverage(`Consultando ${days} días…`);
        if (loadingEl && this.historicalData.length === 0) loadingEl.style.display = 'block';

        try {
            const url = `${API_CONFIG.baseUrl}?action=${API_CONFIG.action}&deviceID=${API_CONFIG.deviceID}&days=${days}`;
            const response = await fetch(url, { signal: this.fetchController.signal });
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            const result = await response.json();
            if (!(result && result.data && Array.isArray(result.data))) throw new Error("Formato de datos inválido");
            if (result.data.length === 0) throw new Error(`La API no devolvió datos para ${days} días`);

            this.historicalData = result.data.sort((a, b) => a.hour_timestamp_utc - b.hour_timestamp_utc);
            this.loadedPeriod = days;
            this.setupSlider();
            if (loadingEl) loadingEl.style.display = 'none';
            if (controlsEl) controlsEl.style.display = 'block';
            if (chartEl) chartEl.style.display = 'block';
            this.updateLastSync();
            this.buildChart();
            this.reportCoverage(days);
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error("❌ Error cargando datos:", error);
            if (this.historicalData.length === 0 && loadingEl) {
                loadingEl.innerHTML = `<div style="color:#ef4444;">❌ Error al cargar datos<br><small>${error.message}</small></div>`;
            } else {
                // Conservar los datos que ya se mostraban y avisar
                this.setCoverage(`No se pudo cargar ${days} días (${error.message}). Se muestran ${this.loadedPeriod} días.`, true);
                if (periodSelect && this.loadedPeriod) periodSelect.value = String(this.loadedPeriod);
                this.currentPeriod = this.loadedPeriod || this.currentPeriod;
            }
        } finally {
            if (periodSelect) periodSelect.disabled = false;
        }
    }

    // Compara lo solicitado contra lo que realmente devolvió la API
    reportCoverage(requestedDays) {
        const n = this.historicalData.length;
        const first = this.historicalData[0].hour_timestamp_utc;
        const last = this.historicalData[n - 1].hour_timestamp_utc;
        const spanDays = (last - first) / 86400;
        const expectedHours = requestedDays * 24;
        const pct = Math.min(100, Math.round((n / expectedHours) * 100));
        const spanTxt = spanDays >= 1 ? `${spanDays.toFixed(1)} días` : `${Math.round(spanDays * 24)} h`;
        const short = spanDays < requestedDays - 1.5;
        this.setCoverage(
            `${n.toLocaleString('es-GT')} horas con datos · cubren ${spanTxt} (${pct}% de ${requestedDays} días)` +
            (short ? `<br>La API devolvió menos historial del solicitado.` : ''),
            short
        );
    }

    setCoverage(html, warn = false) {
        const el = document.getElementById('data-coverage');
        if (!el) return;
        el.innerHTML = html;
        el.classList.toggle('warn', warn);
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
            line: { color: '#10b981', width: 1.5, shape: this.historicalData.length > 1000 ? 'linear' : 'spline' },
            fill: 'tozeroy',
            fillcolor: 'rgba(16,185,129,0.08)',
            hovertemplate:
                `<b>${varConfig.icon} %{y:.1f} ${varConfig.unit}</b><br>` +
                '%{x|%d %b %Y  %H:%M}<br>' +
                '<extra></extra>',
            name: varConfig.label,
            showlegend: false
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
            margin: { t: 8, r: 8, b: 48, l: 36 },
            showlegend: false,
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
                hoverformat: '%d %b %Y %H:%M',
                title: { text: `${varConfig.icon} ${varConfig.label} (${varConfig.unit})`, font: { size: 9, color: '#64748b' }, standoff: 6 }
            },
            yaxis: {
                gridcolor: 'rgba(45,55,72,0.4)',
                linecolor: 'rgba(45,55,72,0.6)',
                tickfont: { size: 9, color: '#64748b' },
                zeroline: false,
                showgrid: true
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
        const val = Number(this.chartValues[index]) || 0;

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
            titleEl.textContent = `📈 ${varConfig.label} — Últimos ${this.loadedPeriod || this.currentPeriod} días`;
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

        if (!slider.dataset.bound) {
            slider.addEventListener('input', (e) => {
                this.updateVisualization(parseInt(e.target.value));
            });
            slider.dataset.bound = '1';
        }
    }

    setupControls() {
        const periodSel = document.getElementById('period-selector');
        if (periodSel) periodSel.value = String(this.currentPeriod);

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
                if (this.historicalData.length) this.updateVisualization(this.historicalData.length - 1);
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
        if (this.isPlaying) { this.stopPlay(); return; }
        const playBtn = document.getElementById('play-btn');
        this.isPlaying = true;
        if (playBtn) playBtn.textContent = '⏸';

        // Con 80 días hay ~1,900 horas: avanzar varias horas por paso para que el recorrido dure ~90 s
        const step = Math.max(1, Math.round(this.historicalData.length / 450));
        this.playInterval = setInterval(() => {
            let nextIndex = this.currentDataIndex - step;
            if (nextIndex < 0) {
                this.stopPlay();
                nextIndex = this.historicalData.length - 1;
            }
            this.updateVisualization(nextIndex);
        }, 200);
    }

    stopPlay() {
        if (this.playInterval) clearInterval(this.playInterval);
        this.playInterval = null;
        this.isPlaying = false;
        const playBtn = document.getElementById('play-btn');
        if (playBtn) playBtn.textContent = '⏪';
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
