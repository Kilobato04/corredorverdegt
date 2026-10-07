// =====================================================
// CORREDOR VERDE GUATEMALA - APP PRINCIPAL
// Calendario de disponibilidad + gráfica Plotly + marcador rewind
// =====================================================

const DAY_MS = 86400000;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

class CorredorVerdeApp {
    constructor() {
        this.map = null;
        this.marker = null;
        this.corridorLayer = null;

        this.allData = [];          // todo el historial que entregó la API
        this.historicalData = [];   // horas de los días seleccionados (lo que se grafica)
        this.days = new Map();      // 'YYYY-MM-DD' (hora Guatemala) -> nº de horas con datos
        this.selectedDays = new Set();
        this.lookbackDays = null;   // periodo que respondió la API
        this.calMonth = null;       // { y, m } mes visible en el calendario

        this.currentDataIndex = 0;
        this.isPlaying = false;
        this.playInterval = null;
        this.currentVariable = 'noise_avg';
        this.plotlyChart = null;
        this.chartTimestamps = [];
        this.chartValues = [];
    }

    async init() {
        console.log("🌿 Iniciando Corredor Verde Monitor...");
        this.initMap();
        this.drawCorridor();
        this.setupControls();
        await this.loadAllData();
        console.log("✅ Aplicación inicializada correctamente");
    }

    // ==================================================
    // MAPA
    // ==================================================
    initMap() {
        this.map = L.map('map-container', {
            center: MAP_CONFIG.center,
            zoom: MAP_CONFIG.zoom,
            zoomControl: false,
            preferCanvas: true,
            minZoom: MAP_CONFIG.minZoom,
            maxZoom: MAP_CONFIG.maxZoom
        });

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

        L.control.layers({
            [bm.dark.label]: darkLayer,
            [bm.satellite.label]: satelliteLayer,
            [bm.fallback.label]: fallbackLayer
        }, null, { position: 'topright', collapsed: true }).addTo(this.map);

        // Respaldo: si Mapbox rechaza el token (URL no autorizada), cambiar a CARTO
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

    // ==================================================
    // DATOS: pedir el historial más largo que acepte la API
    // ==================================================
    async fetchDays(days) {
        const url = `${API_CONFIG.baseUrl}?action=${API_CONFIG.action}&deviceID=${API_CONFIG.deviceID}&days=${days}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (!(result && Array.isArray(result.data))) throw new Error('Formato de datos inválido');
        return result.data;
    }

    async loadAllData() {
        const loadingEl = document.getElementById('loading-overlay');
        const controlsEl = document.getElementById('controls-area');
        const steps = HISTORY_CONFIG.lookbackSteps;
        let data = [], used = null, lastError = null;

        for (const days of steps) {
            this.setCoverage(`Consultando historial de ${days} días…`);
            try {
                const rows = await this.fetchDays(days);
                if (rows.length > 0) { data = rows; used = days; break; }
                if (used === null) used = days;   // respondió, pero vacío: probar periodos más cortos
            } catch (e) {
                lastError = e;
                console.warn(`⚠️ La API no respondió para ${days} días:`, e.message);
            }
        }

        if (loadingEl) loadingEl.style.display = 'none';
        if (controlsEl) controlsEl.style.display = 'block';

        if (used === null) {
            this.setCoverage(`❌ No se pudo consultar la API (${lastError ? lastError.message : 'sin respuesta'}).`, true);
            this.renderCalendar();
            return;
        }

        this.lookbackDays = used;
        this.allData = data
            .filter(d => d && Number.isFinite(d.hour_timestamp_utc))
            .sort((a, b) => a.hour_timestamp_utc - b.hour_timestamp_utc);
        this.indexDays();
        this.updateLastSync();

        if (this.allData.length === 0) {
            this.calMonth = this.monthOf(new Date(Date.now() + TIMEZONE_OFFSET * 3600000));
            this.renderCalendar();
            this.setCoverage(`Sin datos de ${API_CONFIG.deviceID} en los últimos ${steps[0]} días consultados.`, true);
            this.showEmptyChart('Sin datos en el periodo consultado');
            return;
        }

        // Selección inicial: últimos N días con datos, y calendario en el mes más reciente con datos
        const keys = [...this.days.keys()];
        this.calMonth = this.monthOf(this.keyToDate(keys[keys.length - 1]));
        keys.slice(-HISTORY_CONFIG.defaultSelectionDays).forEach(k => this.selectedDays.add(k));
        this.applySelection();
    }

    // Agrupa las horas por día (hora de Guatemala)
    indexDays() {
        this.days.clear();
        this.allData.forEach(d => {
            const key = this.dayKey(d.hour_timestamp_utc);
            this.days.set(key, (this.days.get(key) || 0) + 1);
        });
    }

    applySelection() {
        this.stopPlay();
        this.historicalData = this.allData.filter(d => this.selectedDays.has(this.dayKey(d.hour_timestamp_utc)));
        this.renderCalendar();
        this.reportSelection();

        const chartEl = document.getElementById('chart-section');
        const timeEl = document.querySelector('.time-control');
        if (this.historicalData.length === 0) {
            if (timeEl) timeEl.style.display = 'none';
            this.showEmptyChart('Selecciona en el calendario uno o más días en verde');
            return;
        }
        if (timeEl) timeEl.style.display = '';
        if (chartEl) chartEl.style.display = 'block';
        this.setupSlider();
        this.buildChart();
        this.updateVisualization(this.historicalData.length - 1);
    }

    reportSelection() {
        const total = this.days.size;
        const first = total ? this.keyToLabel([...this.days.keys()][0], true) : '--';
        const sel = [...this.selectedDays].sort();
        const hours = this.historicalData.length;
        let html = `<b>${total}</b> días con datos desde ${first} (consulta de ${this.lookbackDays} días)`;
        if (sel.length) {
            const range = sel.length === 1 ? this.keyToLabel(sel[0]) :
                `${this.keyToLabel(sel[0])} – ${this.keyToLabel(sel[sel.length - 1])}`;
            html += `<br>Selección: <b>${sel.length}</b> ${sel.length === 1 ? 'día' : 'días'} · ${hours} h · ${range}`;
        }
        this.setCoverage(html);
    }

    setCoverage(html, warn = false) {
        const el = document.getElementById('data-coverage');
        if (!el) return;
        el.innerHTML = html;
        el.classList.toggle('warn', warn);
    }

    // ==================================================
    // CALENDARIO
    // ==================================================
    renderCalendar() {
        const grid = document.getElementById('cal-grid');
        if (!grid) return;
        if (!this.calMonth) this.calMonth = this.monthOf(new Date(Date.now() + TIMEZONE_OFFSET * 3600000));
        const { y, m } = this.calMonth;

        document.getElementById('cal-month').textContent = `${MONTHS[m]} ${y}`;
        const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
        const monthDays = [...this.days.keys()].filter(k => k.startsWith(prefix));
        const monthHours = monthDays.reduce((t, k) => t + this.days.get(k), 0);
        document.getElementById('cal-month-summary').textContent =
            monthDays.length ? `${monthDays.length} días con datos · ${monthHours} h` : 'Sin datos este mes';

        const firstDow = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;   // lunes = 0
        const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const todayKey = this.dayKey(Date.now() / 1000);
        let html = '';
        for (let i = 0; i < firstDow; i++) html += '<span class="cal-day empty"></span>';
        for (let d = 1; d <= daysInMonth; d++) {
            const key = `${prefix}-${String(d).padStart(2, '0')}`;
            const hours = this.days.get(key) || 0;
            const cls = ['cal-day'];
            if (hours >= HISTORY_CONFIG.fullDayHours) cls.push('full', 'has');
            else if (hours > 0) cls.push('partial', 'has');
            else cls.push('none');
            if (this.selectedDays.has(key)) cls.push('selected');
            if (key === todayKey) cls.push('today');
            if (key > todayKey) cls.push('future');
            const title = hours ? `${this.keyToLabel(key)} · ${hours} h con datos` : `${this.keyToLabel(key)} · sin datos`;
            html += `<button type="button" class="${cls.join(' ')}" data-key="${key}" title="${title}" ${hours ? '' : 'tabindex="-1"'}>${d}</button>`;
        }
        grid.innerHTML = html;

        // Navegación limitada al rango consultado
        const keys = [...this.days.keys()];
        const minMonth = keys.length ? this.monthOf(this.keyToDate(keys[0])) : this.calMonth;
        const maxMonth = this.monthOf(new Date(Date.now() + TIMEZONE_OFFSET * 3600000));
        const idx = mo => mo.y * 12 + mo.m;
        document.getElementById('cal-prev').disabled = idx(this.calMonth) <= idx(minMonth);
        document.getElementById('cal-next').disabled = idx(this.calMonth) >= idx(maxMonth);
    }

    onDayClick(key, shiftKey) {
        if (!this.days.has(key)) return;
        if (shiftKey && this.lastClickedKey) {
            // Shift + clic: seleccionar el rango completo
            const [a, b] = [this.lastClickedKey, key].sort();
            [...this.days.keys()].filter(k => k >= a && k <= b).forEach(k => this.selectedDays.add(k));
        } else if (this.selectedDays.has(key)) {
            this.selectedDays.delete(key);
        } else {
            this.selectedDays.add(key);
        }
        this.lastClickedKey = key;
        this.applySelection();
    }

    shiftMonth(delta) {
        let { y, m } = this.calMonth;
        m += delta;
        if (m < 0) { m = 11; y--; }
        if (m > 11) { m = 0; y++; }
        this.calMonth = { y, m };
        this.renderCalendar();
    }

    selectMonth() {
        const prefix = `${this.calMonth.y}-${String(this.calMonth.m + 1).padStart(2, '0')}`;
        this.selectedDays = new Set([...this.days.keys()].filter(k => k.startsWith(prefix)));
        this.applySelection();
    }

    selectLast(n) {
        this.selectedDays = new Set([...this.days.keys()].slice(-n));
        const keys = [...this.selectedDays];
        if (keys.length) this.calMonth = this.monthOf(this.keyToDate(keys[keys.length - 1]));
        this.applySelection();
    }

    // ==================================================
    // PLOTLY CHART — selección + marcador
    // ==================================================
    buildChart() {
        const container = document.getElementById('plotly-chart');
        if (!container || this.historicalData.length === 0) return;

        const varConfig = VARIABLES[this.currentVariable];
        this.chartTimestamps = [];
        this.chartValues = [];

        this.historicalData.forEach(d => {
            // Cadena en hora de Guatemala: Plotly la muestra tal cual (sin conversión de zona)
            this.chartTimestamps.push(this.plotTime(d.hour_timestamp_utc));
            this.chartValues.push(d[this.currentVariable] ?? null);
        });

        const trace = {
            x: this.chartTimestamps,
            y: this.chartValues,
            type: 'scatter',
            mode: 'lines',
            connectgaps: false,   // los huecos entre días no seleccionados se ven como cortes
            line: { color: '#10b981', width: 1.5, shape: this.historicalData.length > 1000 ? 'linear' : 'spline' },
            fill: 'tozeroy',
            fillcolor: 'rgba(16,185,129,0.08)',
            hovertemplate: `<b>${varConfig.icon} %{y:.1f} ${varConfig.unit}</b><br>%{x|%d %b %Y  %H:%M}<br><extra></extra>`,
            name: varConfig.label,
            showlegend: false
        };

        // Insertar un null entre horas no consecutivas para cortar la línea en los huecos
        const xs = [], ys = [];
        this.historicalData.forEach((d, i) => {
            if (i > 0 && d.hour_timestamp_utc - this.historicalData[i - 1].hour_timestamp_utc > 3 * 3600) {
                xs.push(this.plotTime(d.hour_timestamp_utc - 1800)); ys.push(null);
            }
            xs.push(this.chartTimestamps[i]); ys.push(this.chartValues[i]);
        });
        trace.x = xs; trace.y = ys;

        const currentTs = this.chartTimestamps[this.currentDataIndex] || this.chartTimestamps[this.chartTimestamps.length - 1];
        const markerDot = {
            x: [currentTs],
            y: [this.chartValues[this.currentDataIndex]],
            type: 'scatter',
            mode: 'markers',
            marker: { color: '#38bdf8', size: 8, line: { color: '#fff', width: 1.5 }, symbol: 'circle' },
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
            shapes: [{
                type: 'line', x0: currentTs, x1: currentTs, y0: 0, y1: 1, yref: 'paper',
                line: { color: '#38bdf8', width: 2, dash: 'dot' }
            }],
            hoverlabel: { bgcolor: 'rgba(15,20,25,0.95)', bordercolor: '#38bdf8', font: { color: '#e2e8f0', size: 11 } },
            dragmode: false
        };

        Plotly.newPlot(container, [trace, markerDot], layout, { displayModeBar: false, responsive: true });
        this.plotlyChart = container;

        // Clic en la gráfica: saltar a esa hora
        container.on('plotly_click', (eventData) => {
            const pt = eventData.points && eventData.points[0];
            if (!pt || pt.curveNumber !== 0) return;
            let idx = this.chartTimestamps.indexOf(pt.x);
            if (idx < 0) {   // por si Plotly devuelve la fecha en otro formato: buscar la hora más cercana
                const t = Date.parse(String(pt.x).replace(' ', 'T').slice(0, 16) + ':00Z');
                let best = Infinity;
                this.chartTimestamps.forEach((s, i) => {
                    const d = Math.abs(Date.parse(s.replace(' ', 'T') + ':00Z') - t);
                    if (d < best) { best = d; idx = i; }
                });
            }
            if (idx >= 0) this.updateVisualization(idx);
        });

        this.updateChartTitle();
    }

    showEmptyChart(message) {
        const chartEl = document.getElementById('chart-section');
        const container = document.getElementById('plotly-chart');
        if (chartEl) chartEl.style.display = 'block';
        if (container) {
            if (window.Plotly && Plotly.purge) Plotly.purge(container);
            container.innerHTML = `<div class="empty-state">${message}</div>`;
        }
        this.plotlyChart = null;
        const titleEl = document.getElementById('chart-title');
        if (titleEl) titleEl.textContent = '📈 Histórico';
        const tooltip = document.getElementById('chart-tooltip');
        if (tooltip) tooltip.classList.remove('visible');
    }

    updateChartMarker(index) {
        if (!this.plotlyChart || this.chartTimestamps.length === 0) return;
        const ts = this.chartTimestamps[index];
        const raw = this.chartValues[index];
        const val = Number(raw) || 0;

        Plotly.relayout(this.plotlyChart, { 'shapes[0].x0': ts, 'shapes[0].x1': ts });
        Plotly.restyle(this.plotlyChart, { x: [[ts]], y: [[raw]] }, [1]);

        const tooltip = document.getElementById('chart-tooltip');
        if (tooltip) {
            const varConfig = VARIABLES[this.currentVariable];
            const color = getColorForValue(this.currentVariable, val);
            const dateStr = this.formatFullDate(this.convertToGuatemalaTime(this.historicalData[index].hour_timestamp_utc));
            tooltip.innerHTML =
                `<span style="color:${color};font-weight:700;">${varConfig.icon} ${raw == null ? '--' : val.toFixed(1)} ${varConfig.unit}</span>` +
                `<span style="color:#64748b;margin-left:8px;">${dateStr}</span>`;
            tooltip.classList.add('visible');
        }
    }

    updateChartTitle() {
        const titleEl = document.getElementById('chart-title');
        if (!titleEl) return;
        const varConfig = VARIABLES[this.currentVariable];
        const n = this.selectedDays.size;
        titleEl.textContent = `📈 ${varConfig.label} — ${n} ${n === 1 ? 'día seleccionado' : 'días seleccionados'}`;
    }

    // ==================================================
    // SLIDER Y CONTROLES
    // ==================================================
    setupSlider() {
        const slider = document.getElementById('time-slider');
        const startLabel = document.getElementById('slider-start');
        const endLabel = document.getElementById('slider-end');
        if (!slider || this.historicalData.length === 0) return;

        slider.min = 0;
        slider.max = this.historicalData.length - 1;
        slider.value = this.historicalData.length - 1;

        const n = this.historicalData.length;
        if (startLabel) startLabel.textContent = this.formatShortDate(this.convertToGuatemalaTime(this.historicalData[0].hour_timestamp_utc));
        if (endLabel) endLabel.textContent = this.formatShortDate(this.convertToGuatemalaTime(this.historicalData[n - 1].hour_timestamp_utc));
    }

    setupControls() {
        const slider = document.getElementById('time-slider');
        if (slider) slider.addEventListener('input', (e) => this.updateVisualization(parseInt(e.target.value)));

        const varSelect = document.getElementById('variable-selector');
        if (varSelect) {
            varSelect.addEventListener('change', (e) => {
                this.currentVariable = e.target.value;
                if (this.historicalData.length === 0) return;
                this.buildChart();
                this.updateVisualization(this.currentDataIndex);
            });
        }

        const grid = document.getElementById('cal-grid');
        if (grid) {
            grid.addEventListener('click', (e) => {
                const btn = e.target.closest('.cal-day.has');
                if (btn) this.onDayClick(btn.dataset.key, e.shiftKey);
            });
        }
        const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
        on('cal-prev', () => this.shiftMonth(-1));
        on('cal-next', () => this.shiftMonth(1));
        on('sel-last7', () => this.selectLast(7));
        on('sel-month', () => this.selectMonth());
        on('sel-clear', () => { this.selectedDays.clear(); this.applySelection(); });

        on('play-btn', () => this.togglePlay());

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
    // VISUALIZACIÓN — mapa + panel + marcador de la gráfica
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
                    ${varConfig.icon} ${value != null ? Number(value).toFixed(1) : '--'} ${varConfig.unit}
                </div>
                <div style="font-size:0.8rem;background:rgba(0,0,0,0.2);padding:6px;border-radius:6px;">
                    <b>AQI:</b> ${data.aqi ?? '--'} (${data.aqi_category ?? '--'})<br>
                    <b>Contaminante:</b> ${data.aqi_pollutant ?? '--'}<br>
                    <b>Temp:</b> ${data.temperature_avg ?? '--'}°C
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

        if (aqiEl) aqiEl.textContent = data.aqi ?? '--';
        if (categoryEl) {
            categoryEl.textContent = data.aqi_category || '--';
            categoryEl.style.color = getColorForValue('aqi', data.aqi);
        }
        if (noiseEl) noiseEl.textContent = data.noise_avg != null ? `${Number(data.noise_avg).toFixed(1)} dB` : '--';
        if (tempEl) tempEl.textContent = data.temperature_avg != null ? `${Number(data.temperature_avg).toFixed(1)}°C` : '--';
    }

    updateLastSync() {
        const updateEl = document.getElementById('last-update');
        if (updateEl) {
            updateEl.textContent = `Actualizado: ${new Date().toLocaleTimeString('es-GT', {
                hour: '2-digit', minute: '2-digit', timeZone: 'America/Guatemala'
            })}`;
        }
    }

    // ==================================================
    // PLAY / REWIND — recorre la selección hacia atrás en ~90 s
    // ==================================================
    togglePlay() {
        if (this.isPlaying) { this.stopPlay(); return; }
        if (this.historicalData.length === 0) return;
        const playBtn = document.getElementById('play-btn');
        this.isPlaying = true;
        if (playBtn) playBtn.textContent = '⏸';

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
    // UTILIDADES DE FECHA
    // Las fechas se "desplazan" a hora de Guatemala y se leen/formatean siempre en UTC,
    // así se ven igual sin importar la zona horaria del navegador.
    // ==================================================
    convertToGuatemalaTime(utcTimestamp) {
        return new Date(utcTimestamp * 1000 + TIMEZONE_OFFSET * 3600000);
    }

    dayKey(utcTimestamp) {
        return this.convertToGuatemalaTime(utcTimestamp).toISOString().slice(0, 10);
    }

    plotTime(utcTimestamp) {
        return this.convertToGuatemalaTime(utcTimestamp).toISOString().slice(0, 16).replace('T', ' ');
    }

    keyToDate(key) {
        const [y, m, d] = key.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d));
    }

    keyToLabel(key, withYear = false) {
        return this.keyToDate(key).toLocaleDateString('es-GT', {
            day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC'
        });
    }

    monthOf(date) {
        return { y: date.getUTCFullYear(), m: date.getUTCMonth() };
    }

    formatFullDate(date) {
        return date.toLocaleString('es-GT', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC'
        });
    }

    formatShortDate(date) {
        return date.toLocaleDateString('es-GT', {
            month: 'short', day: 'numeric', hour: '2-digit', timeZone: 'UTC'
        });
    }
}

// Inicializar
const app = new CorredorVerdeApp();
document.addEventListener('DOMContentLoaded', () => app.init());
