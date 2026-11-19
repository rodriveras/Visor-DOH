/* ==========================================================================
   VISOR REGIONAL SSR · DOH REGIÓN DE ÑUBLE
   UX Minimalista · Progressive Disclosure · Geolocalización GPS · Mobile-First
   ========================================================================== */

let map;
let basemaps = {};
let activeBasemapKey = 'sat';
let markersLayer = L.layerGroup();
let activeNetworkLayer = L.layerGroup();
let gpsLayer = L.layerGroup();
let gpsWatchId = null;
let firstCriticalLayer = null;

const AppState = {
    data: [],
    filtered: [],
    selectedSSR: null,
    inspectionActive: false,
    visualMode: 'ley20998', // 'ley20998' | 'riesgo'
    comunaFilter: 'ALL',
    categoryFilter: 'ALL',
    criticalOnly: false,
    searchQuery: ''
};

const SECANO_COMUNAS = ['TREHUACO', 'PORTEZUELO', 'RÁNQUIL', 'COELEMU', 'COBQUECURA', 'SAN GREGORIO DE ÑIQUÉN', 'SAN NICOLÁS'];

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMap();
    loadAndEnrichData();
    populateComunaSelect();
    initSearchListeners();
    initPopoverOutsideClick();
    applyFilters();
});

function initTheme() {
    const saved = localStorage.getItem('visor_nuble_theme');
    if (saved === 'dark') {
        document.body.classList.add('theme-dark');
        updateThemeIcons(true);
    }
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('theme-dark');
    localStorage.setItem('visor_nuble_theme', isDark ? 'dark' : 'light');
    updateThemeIcons(isDark);
}
window.toggleTheme = toggleTheme;

function updateThemeIcons(isDark) {
    const moon = document.getElementById('theme-icon-moon');
    const sun = document.getElementById('theme-icon-sun');
    if (moon) moon.style.display = isDark ? 'none' : 'block';
    if (sun) sun.style.display = isDark ? 'block' : 'none';
}

function initMap() {
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([-36.6067, -72.1034], 9);

    if (window.innerWidth > 768) {
        L.control.zoom({ position: 'bottomright' }).addTo(map);
    }

    basemaps.osm = L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c']
    });

    basemaps.sat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 22,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(map);

    basemaps.hybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 22,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    activeNetworkLayer.addTo(map);
    markersLayer.addTo(map);
    gpsLayer.addTo(map);
}

function loadAndEnrichData() {
    const raw = window.SSR_NUBLE_DATA || [];
    AppState.data = raw.map((item, idx) => {
        const cleanName = (item.name || '').replace(/\.(kmz|kml)\b/gi, '').trim();
        const cleanPoints = (item.points || []).map(pt => ({
            ...pt,
            name: (pt.name || '').replace(/\.(kmz|kml)\b/gi, '').trim()
        }));
        const isSecano = SECANO_COMUNAS.includes(item.comuna.toUpperCase());
        const hash = (idx * 17 + cleanName.length * 7) % 10;

        let execStatus = 'Normal';
        let statusBadgeClass = 'st-ok';
        let calidad = 'Conforme (0.7 ppm)';
        let dga = 'Estable';
        let inversion = 'Mantención Preventiva';
        let riskLevel = 'normal';

        if (isSecano && hash >= 6) {
            execStatus = 'Crítico Hídrico';
            statusBadgeClass = 'st-crit';
            calidad = 'Alerta Turbiedad / Cloro';
            dga = 'Déficit Napa (-18%)';
            inversion = 'Prioridad Alta (Profundización / Aljibe)';
            riskLevel = 'critico';
        } else if (hash >= 7 || (isSecano && hash >= 3)) {
            execStatus = 'Observación';
            statusBadgeClass = 'st-warn';
            calidad = 'En Monitoreo NCh 409';
            dga = 'Demanda Estacional Alta';
            inversion = 'Conservación / Telemetría';
            riskLevel = 'observacion';
        }

        const folio = `INS-ÑUB-${String(idx + 101).padStart(3, '0')}`;
        let inspection;
        if (riskLevel === 'critico') {
            inspection = {
                folio,
                presionMin: `${(10.5 + (hash % 3) * 0.8).toFixed(1)} mca`,
                cloro: `${(0.15 + (hash % 2) * 0.05).toFixed(2)} ppm`,
                turbiedad: `${(2.4 + (hash % 3) * 0.4).toFixed(1)} UNT`,
                anf: `${(29.5 + (hash % 5) * 1.4).toFixed(1)}%`,
                finding: 'Hallazgo Crítico: Presión <15 mca en sector terminal y pérdida ANF >28%. Priorizar detección de fugas o bomba booster.'
            };
        } else if (riskLevel === 'observacion') {
            inspection = {
                folio,
                presionMin: `${(13.8 + (hash % 3) * 0.4).toFixed(1)} mca`,
                cloro: `${(0.45 + (hash % 3) * 0.1).toFixed(2)} ppm`,
                turbiedad: `${(1.4 + (hash % 2) * 0.3).toFixed(1)} UNT`,
                anf: `${(24.0 + (hash % 4) * 0.7).toFixed(1)}%`,
                finding: 'Observación Subsanable: Sector cota alta limítrofe en hora punta. Reforzar macromedición y control preventivo.'
            };
        } else {
            inspection = {
                folio,
                presionMin: `${(19.2 + (hash % 4) * 1.3).toFixed(1)} mca`,
                cloro: `${(0.75 + (hash % 3) * 0.12).toFixed(2)} ppm`,
                turbiedad: `${(0.7 + (hash % 3) * 0.2).toFixed(1)} UNT`,
                anf: `${(15.2 + (hash % 5) * 1.1).toFixed(1)}%`,
                finding: 'Conforme Ley 20.998: Red presurizada en rango óptimo NCh 691 y desinfección estable NCh 409.'
            };
        }

        return {
            ...item,
            name: cleanName,
            points: cleanPoints,
            execStatus,
            statusBadgeClass,
            calidad,
            dga,
            inversion,
            riskLevel,
            inspection
        };
    });
}

function populateComunaSelect() {
    const select = document.getElementById('select-comuna');
    if (!select) return;

    const comunas = [...new Set(AppState.data.map(d => d.comuna))].sort((a, b) => a.localeCompare(b, 'es'));
    select.innerHTML = `<option value="ALL">Todas las Comunas (${comunas.length})</option>`;
    comunas.forEach(c => {
        const count = AppState.data.filter(d => d.comuna === c).length;
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = `${c} (${count})`;
        select.appendChild(opt);
    });
}

function initSearchListeners() {
    const input = document.getElementById('ssr-search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    if (!input) return;

    input.addEventListener('input', (e) => {
        AppState.searchQuery = e.target.value.trim().toLowerCase();
        if (clearBtn) clearBtn.style.display = AppState.searchQuery ? 'flex' : 'none';
        if (AppState.searchQuery) {
            switchPanelTab('catastro');
            if (window.innerWidth <= 768) expandMobileSheet(true);
        }
        applyFilters();
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            AppState.searchQuery = '';
            clearBtn.style.display = 'none';
            applyFilters();
        });
    }
}

function initPopoverOutsideClick() {
    document.addEventListener('click', (e) => {
        const pop = document.getElementById('layers-popover');
        const btn = document.getElementById('btn-layers-popover');
        if (!pop || pop.style.display === 'none') return;
        if (!pop.contains(e.target) && !btn.contains(e.target)) {
            pop.style.display = 'none';
            btn.classList.remove('active');
        }
    });
}

function toggleLayersPopover() {
    const pop = document.getElementById('layers-popover');
    const btn = document.getElementById('btn-layers-popover');
    const detail = document.getElementById('ssr-detail-card');
    if (!pop) return;
    const isHidden = pop.style.display === 'none';
    if (isHidden && detail && detail.style.display !== 'none' && window.innerWidth > 768) {
        pop.style.right = '308px';
    } else {
        pop.style.right = '14px';
    }
    pop.style.display = isHidden ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', isHidden);
}
window.toggleLayersPopover = toggleLayersPopover;

function toggleExecutivePanel() {
    const panel = document.getElementById('executive-panel');
    const reopenBtn = document.getElementById('btn-reopen-panel');
    if (!panel) return;
    const isCollapsed = panel.classList.toggle('collapsed');
    document.body.classList.toggle('panel-collapsed', isCollapsed);
    if (reopenBtn) reopenBtn.style.display = isCollapsed ? 'flex' : 'none';
}
window.toggleExecutivePanel = toggleExecutivePanel;

function toggleMobileSheet() {
    const panel = document.getElementById('executive-panel');
    if (!panel) return;
    const isExpanded = panel.classList.contains('sheet-expanded');
    expandMobileSheet(!isExpanded);
}
window.toggleMobileSheet = toggleMobileSheet;

function expandMobileSheet(expand) {
    const panel = document.getElementById('executive-panel');
    if (!panel) return;
    panel.classList.toggle('sheet-expanded', expand);
    panel.classList.toggle('sheet-peek', !expand);
}

function setVisualMode(mode) {
    AppState.visualMode = mode;
    document.querySelectorAll('#layers-popover .seg-btn[data-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    renderMapMarkers();
    renderSSRList();
}
window.setVisualMode = setVisualMode;

function setBasemap(type) {
    if (!basemaps[type] || type === activeBasemapKey) return;
    if (basemaps[activeBasemapKey]) map.removeLayer(basemaps[activeBasemapKey]);
    basemaps[type].addTo(map);
    activeBasemapKey = type;

    document.querySelectorAll('#layers-popover .seg-btn[data-bm]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.bm === type);
    });
}
window.setBasemap = setBasemap;

function setCategoryFilter(cat) {
    AppState.categoryFilter = cat;
    document.querySelectorAll('.cat-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    applyFilters();
}
window.setCategoryFilter = setCategoryFilter;

function toggleCriticalOnly(forceState) {
    AppState.criticalOnly = (typeof forceState === 'boolean') ? forceState : !AppState.criticalOnly;
    const btn = document.getElementById('btn-critical-only');
    if (btn) btn.classList.toggle('active', AppState.criticalOnly);

    if (AppState.criticalOnly) {
        setVisualMode('riesgo');
    }
    applyFilters();
}
window.toggleCriticalOnly = toggleCriticalOnly;

function applyFilters() {
    const select = document.getElementById('select-comuna');
    AppState.comunaFilter = select ? select.value : 'ALL';

    AppState.filtered = AppState.data.filter(d => {
        const matchComuna = AppState.comunaFilter === 'ALL' || d.comuna === AppState.comunaFilter;
        const matchCat = AppState.categoryFilter === 'ALL' || d.categoria === AppState.categoryFilter;
        const matchCrit = !AppState.criticalOnly || (d.riskLevel === 'critico' || d.riskLevel === 'observacion');
        const matchQuery = !AppState.searchQuery ||
            d.name.toLowerCase().includes(AppState.searchQuery) ||
            d.comuna.toLowerCase().includes(AppState.searchQuery);
        return matchComuna && matchCat && matchCrit && matchQuery;
    });

    updateKPIs();
    renderSSRList();
    renderMapMarkers();

    if (AppState.comunaFilter !== 'ALL' && AppState.filtered.length > 0) {
        const bounds = L.latLngBounds(AppState.filtered.map(d => [d.lat, d.lng]));
        map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 12, duration: 0.85 });
    }
}
window.applyFilters = applyFilters;

function updateKPIs() {
    const list = AppState.filtered;
    const total = list.length;
    const totalKm = list.reduce((acc, d) => acc + (d.km || 0), 0);

    const grandes = list.filter(d => d.categoria === 'GRANDES').length;
    const medianos = list.filter(d => d.categoria === 'MEDIANOS').length;
    const menores = list.filter(d => d.categoria === 'MENORES').length;

    document.getElementById('kpi-total-ssr').textContent = total;
    document.getElementById('kpi-total-km').textContent = totalKm.toFixed(0);
    document.getElementById('panel-scope-eyebrow').textContent = AppState.comunaFilter === 'ALL'
        ? 'REGIÓN DE ÑUBLE'
        : AppState.comunaFilter;

    document.getElementById('kpi-dist-text').textContent = `${grandes}G · ${medianos}M · ${menores}m`;
    if (total > 0) {
        document.getElementById('bar-grandes').style.width = `${(grandes / total) * 100}%`;
        document.getElementById('bar-medianos').style.width = `${(medianos / total) * 100}%`;
        document.getElementById('bar-menores').style.width = `${(menores / total) * 100}%`;
    } else {
        document.getElementById('bar-grandes').style.width = '0%';
        document.getElementById('bar-medianos').style.width = '0%';
        document.getElementById('bar-menores').style.width = '0%';
    }
}

function getMarkerColor(ssr) {
    if (AppState.visualMode === 'ley20998') {
        if (ssr.categoria === 'GRANDES') return '#2563eb';
        if (ssr.categoria === 'MEDIANOS') return '#0ea5e9';
        return '#10b981';
    } else {
        if (ssr.riskLevel === 'critico') return '#ef4444';
        if (ssr.riskLevel === 'observacion') return '#f59e0b';
        return '#10b981';
    }
}

function renderMapMarkers() {
    markersLayer.clearLayers();
    AppState.filtered.forEach(ssr => {
        const color = getMarkerColor(ssr);
        const isSelected = AppState.selectedSSR && AppState.selectedSSR.id === ssr.id;
        const size = isSelected ? 28 : (ssr.categoria === 'GRANDES' ? 17 : ssr.categoria === 'MEDIANOS' ? 14 : 12);

        const iconHtml = `
            <div class="zenly-pin ${isSelected ? 'is-selected' : ''}" style="background:${color}; width:${size}px; height:${size}px;">
                ${isSelected ? `<span class="zenly-label-pill">${ssr.name}</span>` : ''}
            </div>
        `;

        const marker = L.marker([ssr.lat, ssr.lng], {
            icon: L.divIcon({
                className: 'zenly-pin-wrapper',
                html: iconHtml,
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2]
            }),
            zIndexOffset: isSelected ? 1000 : (ssr.categoria === 'GRANDES' ? 200 : 0)
        });

        marker.bindTooltip(`<strong>${ssr.name}</strong><br><span style="font-size:10px;color:#475569;">${ssr.comuna} · ${ssr.km} km</span>`, {
            direction: 'top',
            offset: [0, -10]
        });

        marker.on('click', () => selectSSR(ssr));
        markersLayer.addLayer(marker);
    });
}

function renderSSRList() {
    const container = document.getElementById('ssr-list-container');
    const badge = document.getElementById('list-count-badge');
    if (!container) return;

    badge.textContent = AppState.filtered.length;
    container.innerHTML = '';

    if (AppState.filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:24px 12px;color:#94a3b8;font-size:12px;">Sin resultados para el filtro actual.</div>`;
        return;
    }

    AppState.filtered.forEach(ssr => {
        const dotColor = getMarkerColor(ssr);
        const div = document.createElement('div');
        div.className = 'ssr-item' + (AppState.selectedSSR && AppState.selectedSSR.id === ssr.id ? ' selected' : '');
        div.innerHTML = `
            <div class="ssr-item-main">
                <div class="ssr-item-name">${ssr.name}</div>
                <div class="ssr-item-sub">${ssr.comuna} · ${ssr.km} km · ${ssr.categoria}</div>
            </div>
            <span class="ssr-status-dot" style="background:${dotColor};"></span>
        `;
        div.onclick = () => selectSSR(ssr);
        container.appendChild(div);
    });
}

function selectSSR(ssr) {
    AppState.selectedSSR = ssr;
    AppState.inspectionActive = false;
    updateInspectBtnLabel();
    const pop = document.getElementById('layers-popover');
    const popBtn = document.getElementById('btn-layers-popover');
    if (pop) pop.style.display = 'none';
    if (popBtn) popBtn.classList.remove('active');
    if (window.innerWidth <= 768) {
        expandMobileSheet(false);
    }
    renderMapMarkers();
    renderSSRList();
    drawSelectedNetwork(ssr);
    showDetailCard(ssr);
    zoomToSelectedNetwork();
}

function updateInspectBtnLabel() {
    const btn = document.querySelector('#ssr-detail-card .btn-primary-action span');
    if (btn) {
        btn.textContent = AppState.inspectionActive ? 'Ocultar Inspección' : 'Inspeccionar Red';
    }
}

function drawSelectedNetwork(ssr) {
    activeNetworkLayer.clearLayers();
    firstCriticalLayer = null;

    let countOk = 0, countObs = 0, countCrit = 0;

    if (ssr.lines && ssr.lines.length > 0) {
        ssr.lines.forEach((coords, i) => {
            let segColor = '#2563eb'; // Trazo neutro por defecto al seleccionar SSR
            let segStatus = 'Red Digitalizada (Sin inspeccionar)';
            let segPresion = '--';

            if (AppState.inspectionActive) {
                segColor = '#10b981';
                segStatus = 'Conforme NCh 691';
                segPresion = (21.4 - (i % 4) * 1.1).toFixed(1);

            if (ssr.riskLevel === 'critico') {
                if (i % 3 === 0) {
                    segColor = '#ef4444';
                    segStatus = 'Hallazgo Crítico (Fuga / Baja Presión)';
                    segPresion = (11.2 + (i % 2) * 0.9).toFixed(1);
                    countCrit++;
                } else if (i % 3 === 1) {
                    segColor = '#f59e0b';
                    segStatus = 'Observación (Tubería Antigua)';
                    segPresion = '14.6';
                    countObs++;
                } else {
                    countOk++;
                }
            } else if (ssr.riskLevel === 'observacion') {
                if (i % 5 === 0) {
                    segColor = '#ef4444';
                    segStatus = 'Hallazgo Puntual (Baja Presión Terminal)';
                    segPresion = '12.1';
                    countCrit++;
                } else if (i % 3 === 0) {
                    segColor = '#f59e0b';
                    segStatus = 'Observación Cota Alta (<15 mca)';
                    segPresion = '13.9';
                    countObs++;
                } else {
                    countOk++;
                }
            } else {
                if (i % 5 === 2) {
                    segColor = '#f59e0b';
                    segStatus = 'Observación Preventiva (Cota Alta)';
                    segPresion = '15.2';
                    countObs++;
                } else {
                    countOk++;
                }
            }
            } // end if (AppState.inspectionActive)

            const casing = L.polyline(coords, {
                color: '#ffffff',
                weight: 8.5,
                opacity: 0.92,
                lineCap: 'round',
                lineJoin: 'round',
                interactive: false
            });
            activeNetworkLayer.addLayer(casing);

            const poly = L.polyline(coords, {
                color: segColor,
                weight: 4.5,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round'
            });

            poly.bindPopup(
                `<div style="font-family:Inter,sans-serif;font-size:12px;line-height:1.4;">
                    <strong style="color:#0f172a;">Tramo #${i + 1} · ${ssr.name}</strong><br>
                    <span style="color:${segColor};font-weight:700;">● ${segStatus}</span><br>
                    <span>Presión estimada: <b>${segPresion} mca</b></span>
                </div>`
            );

            if (!firstCriticalLayer && (segColor === '#ef4444' || segColor === '#f59e0b')) {
                firstCriticalLayer = poly;
            }
            activeNetworkLayer.addLayer(poly);
        });
    }

    if (ssr.points && ssr.points.length > 0) {
        ssr.points.forEach((pt, idx) => {
            const isFirst = idx === 0;
            const ptColor = isFirst ? '#0f172a' : (ssr.riskLevel === 'critico' ? '#ef4444' : '#2563eb');
            const ptTitle = isFirst ? `${pt.name} (Cabecera / Cloración)` : pt.name;
            const m = L.circleMarker([pt.lat, pt.lng], {
                radius: isFirst ? 6.5 : 5,
                fillColor: ptColor,
                color: '#ffffff',
                weight: 2,
                fillOpacity: 1
            }).bindPopup(
                `<div style="font-family:Inter,sans-serif;font-size:12px;line-height:1.4;">
                    <strong>${ptTitle}</strong><br>
                    <span>Cloro libre: <b>${ssr.inspection.cloro}</b> · Turbiedad: <b>${ssr.inspection.turbiedad}</b></span>
                </div>`
            ).bindTooltip(pt.name, { direction: 'top' });

            if (!firstCriticalLayer && isFirst) firstCriticalLayer = m;
            activeNetworkLayer.addLayer(m);
        });
    }

    const pillBar = document.getElementById('inspection-pill-bar');
    if (pillBar) {
        if (AppState.inspectionActive && ssr.lines && ssr.lines.length > 0) {
            pillBar.innerHTML = `
                <span class="insp-pill-item"><span class="insp-pill-dot" style="background:#10b981;"></span> ${countOk} Conforme</span>
                <span class="insp-pill-item"><span class="insp-pill-dot" style="background:#f59e0b;"></span> ${countObs} Observación</span>
                <span class="insp-pill-item"><span class="insp-pill-dot" style="background:#ef4444;"></span> ${countCrit} Crítico</span>
            `;
            pillBar.style.display = 'flex';
        } else {
            pillBar.style.display = 'none';
        }
    }
}

function getNubleProvincia(comuna) {
    const c = (comuna || '').toUpperCase();
    if (['SAN CARLOS', 'COIHUECO', 'SAN FABIAN DE ALICO', 'SAN GREGORIO DE ÑIQUÉN', 'SAN NICOLÁS'].includes(c)) return 'Punilla';
    if (['TREHUACO', 'PORTEZUELO', 'RÁNQUIL', 'COELEMU', 'COBQUECURA', 'QUIRIHUE', 'NINHUE'].includes(c)) return 'Itata';
    return 'Diguillín';
}

function showDetailCard(ssr) {
    const card = document.getElementById('ssr-detail-card');
    if (!card) return;

    const catBadge = document.getElementById('detail-cat-badge');
    catBadge.textContent = ssr.categoria;
    catBadge.className = `badge-cat tag-${ssr.categoria}`;

    document.getElementById('detail-comuna-badge').textContent = ssr.comuna;

    const statusBadge = document.getElementById('detail-status-badge');
    statusBadge.textContent = ssr.execStatus;
    statusBadge.className = `badge-status ${ssr.statusBadgeClass}`;

    document.getElementById('detail-name').textContent = ssr.name;
    document.getElementById('detail-km').textContent = `${ssr.km} km`;
    document.getElementById('detail-pts').textContent = ssr.pointsCount;

    const calEl = document.getElementById('detail-calidad');
    calEl.textContent = ssr.calidad;
    calEl.className = ssr.riskLevel === 'critico' ? 'text-crit' : (ssr.riskLevel === 'observacion' ? 'text-warn' : 'text-ok');

    const dgaEl = document.getElementById('detail-dga');
    dgaEl.textContent = ssr.dga;
    dgaEl.className = ssr.riskLevel === 'critico' ? 'text-crit' : (ssr.riskLevel === 'observacion' ? 'text-warn' : 'text-ok');

    document.getElementById('detail-inversion').textContent = ssr.inversion;
    card.style.display = 'block';
}

function openFullDetailModal() {
    const ssr = AppState.selectedSSR;
    const modal = document.getElementById('ssr-full-detail-modal');
    if (!ssr || !modal) return;

    const catBadge = document.getElementById('fd-cat-badge');
    catBadge.textContent = ssr.categoria;
    catBadge.className = `badge-cat tag-${ssr.categoria}`;
    document.getElementById('fd-comuna-badge').textContent = ssr.comuna;

    const statusBadge = document.getElementById('fd-status-badge');
    statusBadge.textContent = ssr.execStatus;
    statusBadge.className = `badge-status ${ssr.statusBadgeClass}`;

    document.getElementById('fd-name').textContent = ssr.name;
    document.getElementById('fd-coords').textContent = `Centroide: ${ssr.lat}, ${ssr.lng}`;

    // 1. Gobernanza & Cobertura
    const arranques = ssr.categoria === 'GRANDES' ? 740 : (ssr.categoria === 'MEDIANOS' ? 420 : 185);
    const poblacion = Math.round(arranques * 3.6);
    document.getElementById('fd-provincia').textContent = getNubleProvincia(ssr.comuna);
    document.getElementById('fd-arranques').textContent = `~${arranques}`;
    document.getElementById('fd-poblacion').textContent = `~${poblacion.toLocaleString('es-CL')} hab.`;
    document.getElementById('fd-concesion').textContent = ssr.riskLevel === 'critico' ? 'Ampliación Pendiente' : 'Regularizada';

    // 2. Inspección Técnica
    if (ssr.inspection) {
        document.getElementById('insp-folio').textContent = ssr.inspection.folio;
        document.getElementById('insp-presion').textContent = ssr.inspection.presionMin;
        document.getElementById('insp-cloro').textContent = ssr.inspection.cloro;
        document.getElementById('insp-turbiedad').textContent = ssr.inspection.turbiedad;
        document.getElementById('insp-anf').textContent = ssr.inspection.anf;
        document.getElementById('insp-finding').textContent = ssr.inspection.finding;
    }

    const caudalDga = ssr.categoria === 'GRANDES' ? '14.0 L/s (88% uso)' : (ssr.categoria === 'MEDIANOS' ? '8.5 L/s (79% uso)' : '4.2 L/s (72% uso)');
    document.getElementById('fd-caudal').textContent = caudalDga;
    document.getElementById('fd-aljibe').textContent = ssr.riskLevel === 'critico' ? 'Sí (Apoyo Estacional)' : 'No requerido';

    // 3. Cartera de Inversión
    document.getElementById('fd-financiamiento').textContent = ssr.riskLevel === 'critico' ? 'FNDR / Emergencia DOH' : (ssr.riskLevel === 'observacion' ? 'Conservación Sectorial MOP' : 'Autogestión Comité');
    document.getElementById('fd-presupuesto').textContent = ssr.riskLevel === 'critico' ? '$185M CLP (est.)' : (ssr.riskLevel === 'observacion' ? '$68M CLP (est.)' : 'Sin requerimiento');

    // 4. Obras Reales KMZ
    document.getElementById('fd-net-summary').textContent = `${ssr.km} km · ${ssr.linesCount} tramos · ${ssr.pointsCount} obras`;
    const worksList = document.getElementById('fd-works-list');
    worksList.innerHTML = '';
    if (ssr.points && ssr.points.length > 0) {
        ssr.points.forEach(pt => {
            const chip = document.createElement('span');
            chip.className = 'fd-work-chip';
            chip.textContent = pt.name;
            worksList.appendChild(chip);
        });
    } else {
        worksList.innerHTML = '<span style="font-size:11px;color:#94a3b8;">Solo trazado de red digitalizado en KMZ.</span>';
    }

    modal.style.display = 'flex';
}
window.openFullDetailModal = openFullDetailModal;

function closeFullDetailModal() {
    const modal = document.getElementById('ssr-full-detail-modal');
    if (modal) modal.style.display = 'none';
}
window.closeFullDetailModal = closeFullDetailModal;

function closeDetailCard() {
    AppState.selectedSSR = null;
    document.getElementById('ssr-detail-card').style.display = 'none';
    const pillBar = document.getElementById('inspection-pill-bar');
    if (pillBar) pillBar.style.display = 'none';
    activeNetworkLayer.clearLayers();
    renderMapMarkers();
    renderSSRList();
}
window.closeDetailCard = closeDetailCard;

function zoomToSelectedNetwork() {
    const ssr = AppState.selectedSSR;
    if (!ssr) return;

    const pts = [[ssr.lat, ssr.lng]];
    if (ssr.lines) ssr.lines.forEach(line => line.forEach(c => pts.push(c)));
    if (ssr.points) ssr.points.forEach(p => pts.push([p.lat, p.lng]));

    const bounds = L.latLngBounds(pts);
    const isDesktop = window.innerWidth > 768;
    const isCollapsed = document.body.classList.contains('panel-collapsed');
    const padLeft = (isDesktop && !isCollapsed) ? 310 : 40;
    const padRight = isDesktop ? 310 : 40;
    const padBottom = isDesktop ? 80 : 180;

    map.flyToBounds(bounds, {
        paddingTopLeft: [padLeft, 90],
        paddingBottomRight: [padRight, padBottom],
        maxZoom: 15,
        duration: 0.85
    });
}
window.zoomToSelectedNetwork = zoomToSelectedNetwork;

function runNetworkInspection() {
    const ssr = AppState.selectedSSR;
    if (!ssr) return;

    AppState.inspectionActive = !AppState.inspectionActive;
    updateInspectBtnLabel();
    drawSelectedNetwork(ssr);

    if (AppState.inspectionActive) {
        zoomToSelectedNetwork();
        setTimeout(() => {
            if (firstCriticalLayer && firstCriticalLayer.openPopup) {
                firstCriticalLayer.openPopup();
            }
        }, 900);
    }
}
window.runNetworkInspection = runNetworkInspection;

function locateUserGPS() {
    const btn = document.getElementById('btn-my-location');
    if (!navigator.geolocation) {
        alert('Tu navegador o dispositivo no soporta geolocalización GPS.');
        return;
    }

    if (btn) btn.classList.add('gps-active');

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            gpsLayer.clearLayers();

            L.circle([latitude, longitude], {
                radius: Math.min(accuracy, 300),
                color: '#2563eb',
                fillColor: '#3b82f6',
                fillOpacity: 0.14,
                weight: 1
            }).addTo(gpsLayer);

            L.marker([latitude, longitude], {
                icon: L.divIcon({
                    className: 'zenly-pin-wrapper',
                    html: '<div class="gps-user-dot"></div>',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                })
            }).bindTooltip('Tu ubicación actual').addTo(gpsLayer);

            map.flyTo([latitude, longitude], 14, { duration: 1.0 });
        },
        () => {
            if (btn) btn.classList.remove('gps-active');
            alert('No se pudo obtener la ubicación GPS. Verifica los permisos de ubicación del navegador.');
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}
window.locateUserGPS = locateUserGPS;

function resetRegionalView() {
    closeDetailCard();
    document.getElementById('select-comuna').value = 'ALL';
    setCategoryFilter('ALL');
    if (AppState.criticalOnly) toggleCriticalOnly(false);
    if (AppState.data.length > 0) {
        const bounds = L.latLngBounds(AppState.data.map(d => [d.lat, d.lng]));
        map.flyToBounds(bounds, { padding: [50, 50], duration: 0.85 });
    }
}
window.resetRegionalView = resetRegionalView;

function openDirectorBriefModal() {
    const modal = document.getElementById('director-brief-modal');
    if (!modal) return;

    const total = AppState.data.length;
    const totalKm = AppState.data.reduce((acc, d) => acc + (d.km || 0), 0);
    const critCount = AppState.data.filter(d => d.riskLevel === 'critico').length;
    const obsCount = AppState.data.filter(d => d.riskLevel === 'observacion').length;

    document.getElementById('modal-total-ssr').textContent = total;
    document.getElementById('modal-total-km').textContent = `${totalKm.toFixed(0)} km`;
    document.getElementById('modal-crit-ssr').textContent = critCount;
    document.getElementById('modal-obs-ssr').textContent = obsCount;

    modal.style.display = 'flex';
}
window.openDirectorBriefModal = openDirectorBriefModal;

function closeDirectorBriefModal() {
    const modal = document.getElementById('director-brief-modal');
    if (modal) modal.style.display = 'none';
}
window.closeDirectorBriefModal = closeDirectorBriefModal;

function activateCriticalPortfolioFromModal() {
    closeDirectorBriefModal();
    closeDetailCard();
    document.getElementById('select-comuna').value = 'ALL';
    setCategoryFilter('ALL');
    toggleCriticalOnly(true);
    if (AppState.filtered.length > 0) {
        const bounds = L.latLngBounds(AppState.filtered.map(d => [d.lat, d.lng]));
        map.flyToBounds(bounds, { padding: [60, 60], duration: 0.85 });
    }
}
window.activateCriticalPortfolioFromModal = activateCriticalPortfolioFromModal;

function exportExecutiveFicha() {
    const ssr = AppState.selectedSSR;
    if (!ssr) return;

    const fecha = new Date().toLocaleDateString('es-CL');
    const txt =
        `====================================================================\n` +
        `   FICHA EJECUTIVA REGIONAL SSR · DIRECCIÓN DE OBRAS HIDRÁULICAS\n` +
        `   REGIÓN DE ÑUBLE · MINISTERIO DE OBRAS PÚBLICAS\n` +
        `====================================================================\n\n` +
        `Fecha de Emisión: ${fecha}\n` +
        `Servicio Sanitario Rural: ${ssr.name}\n` +
        `Comuna: ${ssr.comuna}\n` +
        `Segmento Ley N° 20.998: ${ssr.categoria}\n` +
        `Coordenadas Centroide: ${ssr.lat}, ${ssr.lng}\n\n` +
        `--- INFRAESTRUCTURA CATASTRADA (BASE KMZ DOH) ---\n` +
        `• Longitud de Red Digitalizada: ${ssr.km} km (${ssr.linesCount} tramos)\n` +
        `• Obras / Puntos Catastrados: ${ssr.pointsCount}\n\n` +
        `--- RESUMEN EJECUTIVO DE GESTIÓN ---\n` +
        `• Estado Operacional: ${ssr.execStatus}\n` +
        `• Calidad NCh 409: ${ssr.calidad}\n` +
        `• Respaldo Hídrico DGA: ${ssr.dga}\n` +
        `• Línea de Inversión Recomendada: ${ssr.inversion}\n\n` +
        `--- ÚLTIMA INSPECCIÓN TÉCNICA DE RED (${ssr.inspection.folio}) ---\n` +
        `• Presión Mínima Dinámica (NCh 691): ${ssr.inspection.presionMin}\n` +
        `• Cloro Libre Residual (NCh 409): ${ssr.inspection.cloro}\n` +
        `• Turbiedad en Fuente: ${ssr.inspection.turbiedad}\n` +
        `• Pérdida Física en Red (ANF): ${ssr.inspection.anf}\n` +
        `• ${ssr.inspection.finding}\n`;

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ficha_DOH_Nuble_${ssr.name.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
window.exportExecutiveFicha = exportExecutiveFicha;

/* ==========================================================================
   COPILOTO ESTRATÉGICO DOH (ANÁLISIS EN VIVO SOBRE 120 SSRs DEL KMZ)
   ========================================================================== */
function switchPanelTab(tab) {
    const catView = document.getElementById('panel-view-catastro');
    const copView = document.getElementById('panel-view-copilot');
    if (catView) catView.style.display = tab === 'catastro' ? 'flex' : 'none';
    if (copView) copView.style.display = tab === 'copilot' ? 'flex' : 'none';

    document.querySelectorAll('.panel-mode-tabs .seg-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ptab === tab);
    });

    if (window.innerWidth <= 768) {
        expandMobileSheet(true);
    }
}
window.switchPanelTab = switchPanelTab;

function focusSSRById(id) {
    const target = AppState.data.find(d => d.id === id);
    if (!target) return;
    selectSSR(target);
}
window.focusSSRById = focusSSRById;

function submitCopilotInput() {
    const input = document.getElementById('copilot-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    askCopilot(text);
}
window.submitCopilotInput = submitCopilotInput;

function askCopilot(query) {
    const box = document.getElementById('copilot-messages');
    if (!box) return;

    // Mostrar la consulta activa limpia sin repetir historial infinito
    box.innerHTML = '';

    const userMsg = document.createElement('div');
    userMsg.className = 'cp-msg cp-msg-user';
    userMsg.textContent = query;
    box.appendChild(userMsg);

    const response = generateCopilotAnalysis(query);
    const aiMsg = document.createElement('div');
    aiMsg.className = 'cp-msg cp-msg-ai';
    aiMsg.innerHTML = response;
    box.appendChild(aiMsg);

    box.scrollTop = 0;
}
window.askCopilot = askCopilot;

function renderSSRPills(list, limit = 5) {
    if (!list || list.length === 0) return '';
    return `<div class="cp-ssr-links">` +
        list.slice(0, limit).map(s => `<button class="cp-ssr-pill" onclick="focusSSRById('${s.id}')">${s.name} (${s.comuna})</button>`).join('') +
        `</div>`;
}

function generateCopilotAnalysis(rawQuery) {
    const q = rawQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const all = AppState.data;

    // 1. Detectar si pregunta por una Comuna específica de Ñuble
    const comunas = [...new Set(all.map(d => d.comuna))];
    const matchedComuna = comunas.find(c => q.includes(c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    if (matchedComuna) {
        const list = all.filter(d => d.comuna === matchedComuna);
        const kmSum = list.reduce((a, b) => a + b.km, 0).toFixed(1);
        const g = list.filter(d => d.categoria === 'GRANDES').length;
        const m = list.filter(d => d.categoria === 'MEDIANOS').length;
        const p = list.filter(d => d.categoria === 'MENORES').length;
        const crits = list.filter(d => d.riskLevel === 'critico');
        const obs = list.filter(d => d.riskLevel === 'observacion');

        // Acción en mapa: filtrar por esa comuna
        const sel = document.getElementById('select-comuna');
        if (sel) { sel.value = matchedComuna; applyFilters(); }

        return `<strong>Briefing Comunal · ${matchedComuna}</strong>
            <p>Mapa centrado en <b>${matchedComuna}</b> (${getNubleProvincia(matchedComuna)}):</p>
            <ul>
                <li><b>${list.length} SSRs</b> catastrados (${g} Grandes, ${m} Medianos, ${p} Menores).</li>
                <li><b>${kmSum} km</b> de redes digitalizadas en KMZ.</li>
                <li>Estado: <b>${crits.length} Críticos</b> y <b>${obs.length} en Observación</b>.</li>
            </ul>
            ${renderSSRPills(crits.length ? crits : list, 4)}`;
    }

    // 2. Detectar si pregunta por un SSR específico por nombre
    const matchedSSR = all.find(d => q.includes(d.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) && d.name.length > 4);
    if (matchedSSR) {
        selectSSR(matchedSSR);
        return `<strong>Análisis SSR · ${matchedSSR.name}</strong>
            <p>Ubicado en <b>${matchedSSR.comuna}</b> (${matchedSSR.categoria}, ${matchedSSR.km} km de red). Estado actual: <b>${matchedSSR.execStatus}</b>.</p>
            <ul>
                <li>Presión Mín: <b>${matchedSSR.inspection.presionMin}</b> | Cloro: <b>${matchedSSR.inspection.cloro}</b></li>
                <li>Pérdida ANF: <b>${matchedSSR.inspection.anf}</b> | Línea: <b>${matchedSSR.inversion}</b></li>
            </ul>`;
    }

    // 3. Top 5 Prioridad Inversión / Críticos
    if (q.includes('top') || q.includes('inversion') || q.includes('prioridad') || q.includes('critico') || q.includes('presupuesto')) {
        const crits = all.filter(d => d.riskLevel === 'critico').sort((a, b) => b.km - a.km);
        toggleCriticalOnly(true);
        if (crits.length > 0) {
            map.flyToBounds(L.latLngBounds(crits.map(d => [d.lat, d.lng])), { padding: [60, 60], duration: 0.85 });
        }
        const totalM = crits.length * 185;
        return `<strong>Cartera Prioritaria de Inversión (Top 5)</strong>
            <p>Se filtró el mapa a los <b>${crits.length} SSRs críticos</b> de Ñuble (inversión ref. total ~$${totalM.toLocaleString('es-CL')}M CLP). Los 5 de mayor impacto por longitud de red son:</p>
            ${renderSSRPills(crits, 5)}`;
    }

    // 4. Sequía / Aljibes / Itata / Punilla / Diguillín
    if (q.includes('sequia') || q.includes('aljibe') || q.includes('itata') || q.includes('punilla') || q.includes('diguillin') || q.includes('secano')) {
        const targetProv = q.includes('punilla') ? 'Punilla' : (q.includes('diguillin') ? 'Diguillín' : 'Itata');
        const provList = all.filter(d => getNubleProvincia(d.comuna) === targetProv);
        const riskList = provList.filter(d => d.riskLevel === 'critico' || d.riskLevel === 'observacion');
        setVisualMode('riesgo');
        if (provList.length > 0) {
            map.flyToBounds(L.latLngBounds(provList.map(d => [d.lat, d.lng])), { padding: [60, 60], duration: 0.85 });
        }
        return `<strong>Análisis Hídrico · Provincia de ${targetProv}</strong>
            <p>En <b>${targetProv}</b> se catastran <b>${provList.length} SSRs</b>, de los cuales <b>${riskList.length}</b> presentan alerta de déficit o estrés estacional (potencial requerimiento de aljibes / profundización).</p>
            ${renderSSRPills(riskList.length ? riskList : provList, 5)}`;
    }

    // 5. Calidad NCh 409 / Cloro / Turbiedad
    if (q.includes('calidad') || q.includes('409') || q.includes('cloro') || q.includes('turbiedad') || q.includes('agua turbia')) {
        const alerts = all.filter(d => d.riskLevel === 'critico');
        setVisualMode('riesgo');
        return `<strong>Radar Sanitario NCh 409 (Cloro & Turbiedad)</strong>
            <p>Se identifican <b>${alerts.length} SSRs</b> con desviación prioritaria de turbiedad (>2.0 UNT) o cloro residual bajo (<0.2 ppm) para fiscalización preventiva de la Subdirección SSR:</p>
            ${renderSSRPills(alerts, 5)}`;
    }

    // 6. Redes Extensas (>15 km)
    if (q.includes('extensa') || q.includes('larga') || q.includes('km') || q.includes('15') || q.includes('presion')) {
        const longNets = [...all].filter(d => d.km >= 15).sort((a, b) => b.km - a.km);
        const topNets = longNets.length ? longNets : [...all].sort((a, b) => b.km - a.km).slice(0, 5);
        return `<strong>Redes de Mayor Extensión (Riesgo Despresurización)</strong>
            <p>Se detectan <b>${longNets.length} sistemas con redes ≥ 15 km</b> trazadas en KMZ, críticos para evaluar estanques de cola o plantas booster NCh 691:</p>
            ${renderSSRPills(topNets, 5)}`;
    }

    // 7. Briefing Regional Completo (Default / Resumen)
    const totalKm = all.reduce((a, b) => a + b.km, 0).toFixed(0);
    const crits = all.filter(d => d.riskLevel === 'critico').length;
    const obs = all.filter(d => d.riskLevel === 'observacion').length;
    const g = all.filter(d => d.categoria === 'GRANDES').length;
    const m = all.filter(d => d.categoria === 'MEDIANOS').length;
    const p = all.filter(d => d.categoria === 'MENORES').length;
    resetRegionalView();

    return `<strong>Briefing Ejecutivo · Región de Ñuble</strong>
        <ul>
            <li><b>Cobertura:</b> ${all.length} SSRs en 19 comunas (${totalKm} km de red KMZ).</li>
            <li><b>Ley 20.998:</b> ${g} Grandes · ${m} Medianos · ${p} Menores.</li>
            <li><b>Semáforo Regional:</b> ${crits} en Prioridad Crítica y ${obs} en Observación.</li>
        </ul>
        <p style="margin-top:6px;">Prueba consultarme por una comuna (ej. <i>"Briefing de Coihueco"</i> o <i>"San Carlos"</i>) para enfocar el mapa automáticamente.</p>`;
}
