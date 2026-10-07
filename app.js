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
        this.dayStats = new Map();   // 'YYYY-MM-DD' -> { max, maxTs, peakHours } de la variable actual
        this.threshold = null;       // umbral de alerta vigente
        this.markerTrace = 1;        // índice del trace del punto marcador en Plotly
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
        console.log("Iniciando Corredor Verde Monitor...");
        this.initMap();
        this.drawCorridor();
        this.setupControls();
        await this.loadAllData();
        console.log("Aplicación inicializada");
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
        darkLayer.addTo(this.map);

        L.control.layers({
            [bm.dark.label]: darkLayer,
            [bm.satellite.label]: satelliteLayer
        }, null, { position: 'topright', collapsed: true }).addTo(this.map);

        // Si Mapbox rechaza el token (URL no autorizada), mostrar aviso en el mapa
        let loaded = 0, errors = 0;
        const errEl = document.getElementById('map-error');
        [darkLayer, satelliteLayer].forEach(layer => {
            layer.on('tileload', () => { loaded++; if (errEl) errEl.hidden = true; });
            layer.on('tileerror', () => {
                errors++;
                if (errors >= 4 && loaded === 0 && errEl) {
                    errEl.hidden = false;
                    console.warn('Mapbox no autorizó el token para este dominio.');
                }
            });
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
            console.warn("Usando geometría de respaldo del corredor");
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
                console.warn(`La API no respondió para ${days} días:`, e.message);
            }
        }

        if (loadingEl) loadingEl.style.display = 'none';
        if (controlsEl) controlsEl.style.display = 'block';

        if (used === null) {
            this.setCoverage(`No se pudo consultar la API (${lastError ? lastError.message : 'sin respuesta'}).`, true);
            this.renderStatus();
            this.renderCalendar();
            return;
        }

        this.lookbackDays = used;
        this.allData = data
            .filter(d => d && Number.isFinite(d.hour_timestamp_utc))
            .sort((a, b) => a.hour_timestamp_utc - b.hour_timestamp_utc);
        this.indexDays();
        this.computeDayStats();
        this.renderStatus();
        this.renderVarCards(this.allData[this.allData.length - 1]);

        if (this.allData.length === 0) {
            this.calMonth = this.monthOf(new Date(Date.now() + TIMEZONE_OFFSET * 3600000));
            this.renderCalendar();
            this.setCoverage(`Sin datos del ${SENSOR_LOCATION.displayName} en los últimos ${steps[0]} días consultados.`, true);
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

    // Una hora cuenta para picos/estadística si su completitud es ≥ minCompleteness (o si la API no la reporta)
    isValidHour(d) {
        const c = d.data_completeness;
        return c == null || !Number.isFinite(+c) || +c >= HISTORY_CONFIG.minCompleteness;
    }

    valueOf(d, v = this.currentVariable) {
        const x = d[v];
        return x == null || !Number.isFinite(+x) ? null : +x;
    }

    // Umbral y picos por día para la variable actual (sobre todo el historial, no sólo la selección)
    computeDayStats() {
        const v = this.currentVariable;
        const alert = VARIABLES[v].alert || {};
        const values = this.allData.filter(d => this.isValidHour(d)).map(d => this.valueOf(d, v)).filter(x => x !== null);

        if (alert.value != null) {
            this.threshold = { value: alert.value, text: alert.text || String(alert.value), relative: false };
        } else if (alert.percentile && values.length) {
            const sorted = [...values].sort((a, b) => a - b);
            const p = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * alert.percentile / 100))];
            this.threshold = { value: p, text: `${p.toFixed(1)} ${VARIABLES[v].unit}`, relative: true, percentile: alert.percentile };
        } else {
            this.threshold = null;
        }

        this.dayStats.clear();
        this.allData.forEach(d => {
            const val = this.valueOf(d, v);
            if (val === null || !this.isValidHour(d)) return;
            const key = this.dayKey(d.hour_timestamp_utc);
            const st = this.dayStats.get(key) || { max: -Infinity, maxTs: null, peakHours: 0 };
            if (val > st.max) { st.max = val; st.maxTs = d.hour_timestamp_utc; }
            if (this.threshold && val > this.threshold.value) st.peakHours++;
            this.dayStats.set(key, st);
        });
        this.renderStats();
    }

    // Estadística de un conjunto de horas para la variable actual
    scopeStats(rows) {
        const v = this.currentVariable;
        const keys = [...new Set(rows.map(d => this.dayKey(d.hour_timestamp_utc)))].sort();
        const valid = rows.filter(d => this.isValidHour(d) && this.valueOf(d, v) !== null);
        const excluded = rows.filter(d => !this.isValidHour(d) && this.valueOf(d, v) !== null).length;
        const thr = this.threshold ? this.threshold.value : Infinity;
        const over = valid.filter(d => this.valueOf(d, v) > thr);
        const overDays = new Set(over.map(d => this.dayKey(d.hour_timestamp_utc)));
        let max = null, maxTs = null, sum = 0;
        valid.forEach(d => {
            const x = this.valueOf(d, v);
            sum += x;
            if (max === null || x > max) { max = x; maxTs = d.hour_timestamp_utc; }
        });
        const span = keys.length
            ? Math.round((this.keyToDate(keys[keys.length - 1]) - this.keyToDate(keys[0])) / DAY_MS) + 1 : 0;
        return {
            first: keys[0], last: keys[keys.length - 1], daysWithData: keys.length, calendarDays: span,
            validHours: valid.length, excluded, overHours: over.length, overDays: overDays.size,
            max, maxTs, mean: valid.length ? sum / valid.length : null
        };
    }

    // Resumen: historial completo + selección, con periodo y base explícitos
    renderStats() {
        const el = document.getElementById('peak-summary');
        const titleEl = document.getElementById('stats-title');
        if (!el) return;
        const vc = VARIABLES[this.currentVariable];
        if (titleEl) titleEl.innerHTML = `${icon(vc.icon)}Resumen · ${vc.label}`;
        if (this.allData.length === 0) { el.innerHTML = '<div class="empty-state">Sin datos para calcular</div>'; return; }

        const dec = vc.decimals ?? 1;
        const fmt = x => x === null ? '--' : Number(x).toLocaleString('es-GT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : '--';
        const rel = this.threshold && this.threshold.relative;
        const thrTxt = this.threshold ? this.threshold.text : '--';
        const dayLbl = rel ? 'Días con valores altos' : `Días con horas &gt; ${thrTxt}`;
        const hourLbl = rel ? 'Horas con valores altos' : `Horas &gt; ${thrTxt}`;

        const block = (label, st) => {
            if (!st.daysWithData) return '';
            const range = st.first === st.last
                ? this.keyToLabel(st.first, true)
                : `${this.keyToLabel(st.first, true)} – ${this.keyToLabel(st.last, true)}`;
            return `<div class="stat-block">
                <div class="stat-label">${label}</div>
                <div><span class="stat-range">${range}</span> · ${st.daysWithData} ${st.daysWithData === 1 ? 'día' : 'días'} con datos de ${st.calendarDays} calendario</div>
                <div class="stat-grid">
                    <div class="stat${st.overDays ? ' alert' : ''}"><b>${st.overDays} <small>(${pct(st.overDays, st.daysWithData)})</small></b><span>${dayLbl}</span></div>
                    <div class="stat${st.overHours ? ' alert' : ''}"><b>${st.overHours.toLocaleString('es-GT')} h <small>(${pct(st.overHours, st.validHours)})</small></b><span>${hourLbl}</span></div>
                    <div class="stat"><b>${fmt(st.max)} ${vc.unit}</b><span>Máximo horario${st.maxTs ? ` · ${this.keyToLabel(this.dayKey(st.maxTs))}, ${this.hourLabel(st.maxTs)}` : ''}</span></div>
                    <div class="stat"><b>${fmt(st.mean)} ${vc.unit}</b><span>Promedio del periodo</span></div>
                </div>
            </div>`;
        };

        const all = this.scopeStats(this.allData);
        const sel = this.historicalData.length ? this.scopeStats(this.historicalData) : null;
        const thrNote = rel
            ? `Valores altos: horas por encima del percentil ${this.threshold.percentile} del historial (${thrTxt}); ${vc.label.toLowerCase()} no tiene umbral de salud.`
            : `Umbral de referencia: ${thrTxt}.`;
        el.innerHTML = block('Historial completo', all) + (sel ? block('Selección', sel) : '') +
            `<div class="stat-note">${thrNote} Porcentajes sobre días y horas con datos. Valores promedio por hora; ` +
            `se excluyen horas con completitud &lt; ${HISTORY_CONFIG.minCompleteness}%` +
            `${all.excluded ? ` (${all.excluded} h en el historial)` : ''}.</div>`;
    }

    // Indicador de antigüedad del último dato
    renderStatus() {
        const pill = document.getElementById('status-pill');
        const last = document.getElementById('last-data');
        if (!pill) return;
        if (!this.allData.length) {
            pill.className = 'status-pill stale';
            pill.textContent = 'Sin datos';
            if (last) last.textContent = '';
            return;
        }
        const ts = this.allData[this.allData.length - 1].hour_timestamp_utc;
        const ageH = (Date.now() / 1000 - ts) / 3600;
        const [cls, txt] = ageH <= FRESHNESS.liveHours ? ['live', 'En vivo']
            : ageH <= FRESHNESS.recentHours ? ['recent', 'Reciente'] : ['stale', 'Sin transmisión'];
        pill.className = `status-pill ${cls}`;
        pill.textContent = txt;
        if (last) last.textContent = `Último dato: ${this.formatFullDate(this.convertToGuatemalaTime(ts))}`;
    }

    // Tarjetas de variables con el valor de la hora mostrada; clic = elegir variable
    renderVarCards(data) {
        const wrap = document.getElementById('var-cards');
        if (!wrap) return;
        wrap.innerHTML = VARIABLE_ORDER.filter(v => VARIABLES[v]).map(v => {
            const vc = VARIABLES[v];
            const x = data ? this.valueOf(data, v) : null;
            const dec = vc.decimals ?? 1;
            const val = x === null ? '--' : x.toLocaleString('es-GT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
            const color = x === null ? '#64748b' : getColorForValue(v, x);
            const cat = x === null ? 'Sin dato' : getCategoryForValue(v, x);
            return `<button type="button" class="var-card${v === this.currentVariable ? ' active' : ''}" data-var="${v}" title="${vc.label}: ${cat}">
                ${icon(vc.icon)}
                <span class="vc-name"><i class="vc-dot" style="background:${color}"></i>${vc.short || vc.label}</span>
                <span class="vc-value">${val}<small>${vc.unit}</small></span>
            </button>`;
        }).join('');
        const t = document.getElementById('cards-time');
        if (t) t.textContent = data ? this.formatFullDate(this.convertToGuatemalaTime(data.hour_timestamp_utc)) : '--';
    }

    setVariable(v) {
        if (!VARIABLES[v] || v === this.currentVariable) return;
        this.currentVariable = v;
        this.computeDayStats();
        this.renderCalendar();
        if (this.historicalData.length === 0) {
            this.renderVarCards(this.allData[this.allData.length - 1]);
            return;
        }
        this.buildChart();
        this.updateVisualization(this.currentDataIndex);
    }

    applySelection() {
        this.stopPlay();
        this.historicalData = this.allData.filter(d => this.selectedDays.has(this.dayKey(d.hour_timestamp_utc)));
        this.renderCalendar();
        this.reportSelection();
        this.renderStats();

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
            const st = this.dayStats.get(key);
            const vc = VARIABLES[this.currentVariable];
            let title = hours ? `${this.keyToLabel(key)} · ${hours} h con datos` : `${this.keyToLabel(key)} · sin datos`;
            let badge = '';
            if (st && st.maxTs != null) {
                title += `\nMáx ${vc.label}: ${st.max.toFixed(1)} ${vc.unit} a las ${this.hourLabel(st.maxTs)}`;
                if (st.peakHours > 0) {
                    title += `\n${st.peakHours} h sobre ${this.threshold.text}`;
                    const many = st.peakHours >= HISTORY_CONFIG.peakManyHours;
                    badge = `<b class="pk${many ? ' many' : ''}">${st.peakHours}</b>`;
                }
            }
            html += `<button type="button" class="${cls.join(' ')}" data-key="${key}" title="${title}" ${hours ? '' : 'tabindex="-1"'}>${d}${badge}</button>`;
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

        // Un trace por tramo continuo: así ni la línea ni el relleno cruzan los huecos sin datos
        const base = {
            type: 'scatter',
            mode: 'lines',
            line: { color: '#10b981', width: 1.5, shape: this.historicalData.length > 1000 ? 'linear' : 'spline' },
            fill: 'tozeroy',
            fillcolor: 'rgba(16,185,129,0.10)',
            hovertemplate: `<b>%{y:.1f} ${varConfig.unit}</b><br>%{x|%d %b %Y  %H:%M}<br><extra></extra>`,
            showlegend: false
        };
        const segments = [];
        let seg = null;
        this.historicalData.forEach((d, i) => {
            const prev = this.historicalData[i - 1];
            if (!seg || d.hour_timestamp_utc - prev.hour_timestamp_utc > 3 * 3600) {
                seg = { x: [], y: [] };
                segments.push(seg);
            }
            seg.x.push(this.chartTimestamps[i]);
            seg.y.push(this.chartValues[i]);
        });
        const traces = segments.map(sg => ({ ...base, x: sg.x, y: sg.y }));

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
        this.markerTrace = traces.length;
        traces.push(markerDot);

        const shapes = [{
            type: 'line', x0: currentTs, x1: currentTs, y0: 0, y1: 1, yref: 'paper',
            line: { color: '#38bdf8', width: 2, dash: 'dot' }
        }];
        if (this.threshold) {
            shapes.push({
                type: 'line', xref: 'paper', x0: 0, x1: 1, y0: this.threshold.value, y1: this.threshold.value,
                line: { color: 'rgba(239,68,68,0.7)', width: 1, dash: 'dash' }
            });
        }

        const layout = {
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { t: 8, r: 8, b: 48, l: 36 },
            showlegend: false,
            font: { family: 'Arial, Helvetica, sans-serif', size: 10, color: '#94a3b8' },
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
                title: { text: `${varConfig.label} (${varConfig.unit})`, font: { size: 9, color: '#64748b' }, standoff: 6 }
            },
            yaxis: {
                gridcolor: 'rgba(45,55,72,0.4)',
                linecolor: 'rgba(45,55,72,0.6)',
                tickfont: { size: 9, color: '#64748b' },
                zeroline: false,
                showgrid: true
            },
            shapes,
            hoverlabel: { bgcolor: '#1c2a40', bordercolor: '#38bdf8', font: { family: 'Arial, Helvetica, sans-serif', color: '#e2e8f0', size: 11 } },
            dragmode: false
        };

        Plotly.newPlot(container, traces, layout, { displayModeBar: false, responsive: true });
        this.plotlyChart = container;

        // Clic en la gráfica: saltar a esa hora
        container.on('plotly_click', (eventData) => {
            const pt = eventData.points && eventData.points[0];
            if (!pt || pt.curveNumber >= this.markerTrace) return;
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
        if (titleEl) titleEl.innerHTML = `${icon('chart')}Histórico`;
        const tooltip = document.getElementById('chart-tooltip');
        if (tooltip) tooltip.classList.remove('visible');
    }

    updateChartMarker(index) {
        if (!this.plotlyChart || this.chartTimestamps.length === 0) return;
        const ts = this.chartTimestamps[index];
        const raw = this.chartValues[index];
        const val = Number(raw) || 0;

        Plotly.relayout(this.plotlyChart, { 'shapes[0].x0': ts, 'shapes[0].x1': ts });
        Plotly.restyle(this.plotlyChart, { x: [[ts]], y: [[raw]] }, [this.markerTrace]);

        const tooltip = document.getElementById('chart-tooltip');
        if (tooltip) {
            const varConfig = VARIABLES[this.currentVariable];
            const color = getColorForValue(this.currentVariable, val);
            const dateStr = this.formatFullDate(this.convertToGuatemalaTime(this.historicalData[index].hour_timestamp_utc));
            tooltip.innerHTML =
                `<span style="color:${color};display:inline-flex;align-items:center;gap:5px;font-weight:700;">${icon(varConfig.icon)}${raw == null ? '--' : val.toFixed(varConfig.decimals ?? 1)} ${varConfig.unit}</span>` +
                `<span style="color:#94a3b8;">${dateStr}</span>`;
            tooltip.classList.add('visible');
        }
    }

    updateChartTitle() {
        const titleEl = document.getElementById('chart-title');
        if (!titleEl) return;
        const varConfig = VARIABLES[this.currentVariable];
        const n = this.selectedDays.size;
        titleEl.innerHTML = `${icon('chart')}${varConfig.label} · ${n} ${n === 1 ? 'día seleccionado' : 'días seleccionados'}`;
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

        const cards = document.getElementById('var-cards');
        if (cards) {
            cards.addEventListener('click', (e) => {
                const btn = e.target.closest('.var-card');
                if (btn) this.setVariable(btn.dataset.var);
            });
        }
        const deviceEl = document.getElementById('device-name');
        if (deviceEl) deviceEl.textContent = SENSOR_LOCATION.displayName;
        const calIcon = document.getElementById('cal-icon');
        if (calIcon) calIcon.outerHTML = icon('calendar');
        const playBtn = document.getElementById('play-btn');
        if (playBtn) playBtn.innerHTML = icon('rewind');
        this.renderVarCards(null);

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
        this.renderVarCards(data);
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
        const fmt = (x, d = 1) => x == null || !Number.isFinite(+x) ? '--' : Number(x).toFixed(d);
        this.marker.bindPopup(`
            <div class="popup">
                <h4>${SENSOR_LOCATION.name}</h4>
                <div class="p-sub">${SENSOR_LOCATION.displayName} · ${this.formatFullDate(guatemalaTime)}</div>
                <div class="p-val" style="color:${color};">${icon(varConfig.icon)}${fmt(value, varConfig.decimals ?? 1)} ${varConfig.unit}</div>
                <div class="p-extra">
                    <b>AQI:</b> ${data.aqi ?? '--'} (${data.aqi_category ?? '--'})<br>
                    <b>Contaminante principal:</b> ${data.aqi_pollutant ?? '--'}<br>
                    <b>Temperatura:</b> ${fmt(data.temperature_avg)} °C · <b>Humedad:</b> ${fmt(data.humidity_avg, 0)} %
                </div>
            </div>
        `);
    }

    updateInfoPanel(data) {
        const datetimeEl = document.getElementById('current-datetime');
        if (datetimeEl) datetimeEl.textContent = this.formatFullDate(this.convertToGuatemalaTime(data.hour_timestamp_utc));
    }

    // ==================================================
    // PLAY / REWIND — recorre la selección hacia atrás en ~90 s
    // ==================================================
    togglePlay() {
        if (this.isPlaying) { this.stopPlay(); return; }
        if (this.historicalData.length === 0) return;
        const playBtn = document.getElementById('play-btn');
        this.isPlaying = true;
        if (playBtn) playBtn.innerHTML = icon('pause');

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
        if (playBtn) playBtn.innerHTML = icon('rewind');
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

    hourLabel(utcTimestamp) {
        return this.convertToGuatemalaTime(utcTimestamp).toISOString().slice(11, 16);
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
