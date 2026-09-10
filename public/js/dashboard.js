import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
    getDatabase,
    ref,
    get,
    set,
    update,
    onValue,
    query,
    orderByChild,
    equalTo
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";
import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-analytics.js";

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAzn1em_8w5XsRaJ6mR5gpv93ZtCA-erGE",
    authDomain: "prediapp-81350.firebaseapp.com",
    databaseURL: "https://sisges.firebaseio.com/",
    projectId: "prediapp-81350",
    storageBucket: "gs://prediapp-81350.firebasestorage.app",
    messagingSenderId: "649258621251",
    appId: "1:649258621251:web:54558939330b1e01d777f6",
    measurementId: "G-PBV4WW41D6"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);

let charts = {
    mainChart: null,
    typeChart: null,
    trendChart: null,
    statusChart: null,
    efficiencyChart: null,
    departmentChart: null,
    quarterlyChart: null,
    channelChart: null
};

let tipoActual = '';
let solicitudesSeguimiento = [];
let solicitudesValidadas = [];
let solicitudesVerificacion = [];
const itemsPerPage = 5;
let currentPageSeguimiento = 1;
let currentPageValidadas = 1;
let currentPageVerificacion = 1;

// Módulo de prueba: Unidad Central de Correspondencia
let correspondenciaPrueba = [];
let currentPageCorrespondencia = 1;
const itemsPerPageCorrespondencia = 8;
let listenerCorrespondenciaPruebaIniciado = false;

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

let solicitudesVobo = [];
let currentPageVobo = 1;
let folioReenvioVobo = '';

const MAX_INITIAL_FILE_SIZE_MB = 10;
const MAX_INITIAL_FILE_SIZE_BYTES = MAX_INITIAL_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_INITIAL_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'zip', 'rar'];
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'zip', 'rar'];

const MAX_ACUERDO_SIZE_MB = 10;
const MAX_OFICIO_SIZE_MB = 10;

const navLinks = document.querySelectorAll('.nav-link');
const contentSections = document.querySelectorAll('.content-section');

const CORREO_VINCULACION_CIUDADANA = 'vinculacion.ciudadana@tizayuca.gob.mx';
const CORREO_SECRETARIA_GENERAL = 'secretariamunicipal@tizayuca.gob.mx';
const DEPENDENCIA_SECRETARIA_GENERAL = 'secretaria-general-municipal';

// ── Utilidades de rendimiento ────────────────────────────────────────────────
function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function rafThrottle(fn) {
    let rafId = null;
    return function (...args) {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            fn.apply(this, args);
            rafId = null;
        });
    };
}

function appendRowsToTable(tabla, rows) {
    const frag = document.createDocumentFragment();
    rows.forEach(r => frag.appendChild(r));
    tabla.appendChild(frag);
}

let suppressFileInputEvents = false;

// ── Sistema de sesión ──────────────────────────────────────────────────────
let sessionRenewalInterval = null;
let activityMonitorInterval = null;
const SESSION_TIMEOUT = 9 * 60 * 1000;
const ACTIVITY_CHECK_INTERVAL = 60000;
let lastActivityTime = Date.now();
let sessionWarningShown = false;

function setupActivityDetection() {
    if (sessionRenewalInterval) clearInterval(sessionRenewalInterval);
    if (activityMonitorInterval) clearInterval(activityMonitorInterval);

    const activityEvents = [
        'mousemove', 'mousedown', 'click', 'scroll',
        'keypress', 'touchstart', 'touchmove', 'input',
        'change', 'focus', 'submit'
    ];

    activityEvents.forEach(event => {
        document.addEventListener(event, () => {
            lastActivityTime = Date.now();
            sessionWarningShown = false;
        }, { passive: true });
    });

    activityMonitorInterval = setInterval(() => {
        checkSessionStatus();
    }, ACTIVITY_CHECK_INTERVAL);

    sessionRenewalInterval = setInterval(() => {
        renewSessionIfNeeded();
    }, 60000);
}

function renewSessionIfNeeded() {
    const expiresCookie = getCookie('expires');
    if (!expiresCookie) return false;

    const expirationDate = new Date(expiresCookie);
    const now = new Date();
    const timeUntilExpiration = expirationDate - now;

    if (timeUntilExpiration < 300000 && (Date.now() - lastActivityTime) < 180000) {
        return renewSession();
    }
    return false;
}

function checkSessionStatus() {
    const sessionCookie = getCookie('session');
    const expiresCookie = getCookie('expires');

    if (!sessionCookie || !expiresCookie) {
        redirectToLogin();
        return;
    }

    const now = new Date();
    const expirationDate = new Date(expiresCookie);
    const timeUntilExpiration = expirationDate - now;

    if (timeUntilExpiration < 120000 && !sessionWarningShown) {
        showSessionWarning();
        sessionWarningShown = true;
    }

    if (timeUntilExpiration < 30000) {
        if (Date.now() - lastActivityTime < 60000) {
            forceRenewSession();
        } else {
            redirectToLogin();
        }
    }
}

function forceRenewSession() {
    try {
        const fechaExpiracion = new Date();
        fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 10);
        const expiresUTC = fechaExpiracion.toUTCString();
        const cookieSettings = `expires=${expiresUTC}; path=/; SameSite=Lax; Secure`;

        const cookiesToRenew = ['session', 'email', 'nombre', 'rol', 'dependencia', 'area', 'expires'];
        cookiesToRenew.forEach(cookieName => {
            const valor = getCookie(cookieName);
            if (valor) {
                document.cookie = `${cookieName}=${encodeURIComponent(valor)}; ${cookieSettings}`;
            }
        });
        document.cookie = `lastLogin=${new Date().toISOString()}; ${cookieSettings}`;
        sessionWarningShown = false;
        console.log('Sesión renovada forzosamente');
        return true;
    } catch (error) {
        console.error('Error forzando renovación de sesión:', error);
        return false;
    }
}

function showSessionWarning() {
    let warningDiv = document.getElementById('session-warning');
    if (!warningDiv) {
        warningDiv = document.createElement('div');
        warningDiv.id = 'session-warning';
        warningDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff9800;
            color: white;
            padding: 15px;
            border-radius: 5px;
            z-index: 9999;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            max-width: 300px;
        `;
        document.body.appendChild(warningDiv);
    }

    warningDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-exclamation-triangle" style="font-size: 20px;"></i>
            <div>
                <strong>Sesión por expirar</strong><br>
                <small>Tu sesión expirará en 2 minutos. Realiza alguna acción para renovarla.</small>
            </div>
        </div>
    `;

    setTimeout(() => {
        if (warningDiv.parentNode) {
            warningDiv.style.opacity = '0';
            warningDiv.style.transition = 'opacity 0.5s';
            setTimeout(() => {
                if (warningDiv.parentNode) {
                    warningDiv.remove();
                }
            }, 500);
        }
    }, 10000);
}

function redirectToLogin() {
    if (sessionRenewalInterval) clearInterval(sessionRenewalInterval);
    if (activityMonitorInterval) clearInterval(activityMonitorInterval);

    const message = document.createElement('div');
    message.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        color: white;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: Arial, sans-serif;
    `;
    message.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <i class="fas fa-hourglass-end" style="font-size: 50px; margin-bottom: 20px;"></i>
            <h2>Sesión Expirada</h2>
            <p>Tu sesión ha expirado por inactividad.</p>
            <p>Redirigiendo al inicio de sesión...</p>
        </div>
    `;
    document.body.appendChild(message);
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 2000);
}

function shouldRenewSession() {
    const timeSinceLastActivity = Date.now() - lastActivityTime;
    const sessionAge = getSessionAge();
    return timeSinceLastActivity < 120000 && sessionAge > 8 * 60 * 1000;
}

function getSessionAge() {
    const expiresCookie = getCookie('expires');
    if (!expiresCookie) return 0;
    const expirationDate = new Date(expiresCookie);
    const now = new Date();
    return expirationDate - now;
}

function renewSession() {
    try {
        const fechaExpiracion = new Date();
        fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 10);
        const expiresUTC = fechaExpiracion.toUTCString();
        const cookieSettings = `expires=${expiresUTC}; path=/; SameSite=Lax; Secure`;

        const sessionCookie = getCookie('session');
        if (!sessionCookie) {
            console.warn('No hay sesión para renovar');
            return false;
        }

        const cookiesToRenew = ['session', 'email', 'nombre', 'rol', 'dependencia', 'area', 'expires'];
        let renewed = false;
        cookiesToRenew.forEach(cookieName => {
            const valor = getCookie(cookieName);
            if (valor) {
                document.cookie = `${cookieName}=${encodeURIComponent(valor)}; ${cookieSettings}`;
                renewed = true;
            }
        });

        if (renewed) {
            console.log('Sesión renovada automáticamente a las', new Date().toLocaleTimeString());
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error renovando sesión:', error);
        return false;
    }
}

function checkSession() {
    const sessionCookie = getCookie('session');
    const expiresCookie = getCookie('expires');

    if (!sessionCookie || !expiresCookie) {
        redirectToLogin();
        return false;
    }

    const now = new Date();
    const expirationDate = new Date(expiresCookie);

    if (now > expirationDate) {
        redirectToLogin();
        return false;
    }

    setupActivityDetection();

    const sessionAge = expirationDate - now;
    if (sessionAge < 5 * 60 * 1000) {
        renewSession();
    }

    return true;
}

window.mostrarModalEstado = function (folio) {
    document.getElementById('modalFolio').textContent = folio;
    new bootstrap.Modal('#statusModal').show();
};

window.cambiarEstadoModal = function (nuevoEstado) {
    const folio = document.getElementById('modalFolio').textContent;
    cambiarEstado(folio, nuevoEstado);
};

function calcularFechaLimite(fechaCreacion) {
    const fechaBase = new Date(fechaCreacion);
    let diasAgregados = 0;
    let fechaLimite = new Date(fechaBase);

    while (diasAgregados < 5) {
        fechaLimite.setDate(fechaLimite.getDate() + 1);
        if (fechaLimite.getDay() !== 0 && fechaLimite.getDay() !== 6) {
            diasAgregados++;
        }
    }
    return fechaLimite.toISOString();
}

function calcularDiasRestantes(fechaLimite) {
    const ahora = ajustarHoraMexico(new Date());
    const limite = ajustarHoraMexico(new Date(fechaLimite));

    if (ahora >= limite) {
        const diffMs = ahora - limite;
        return Math.floor(diffMs / (1000 * 60 * 60 * 24)) * -1;
    }

    let diasRestantes = 0;
    const current = new Date(ahora);

    while (current < limite) {
        current.setDate(current.getDate() + 1);
        if (current.getDay() !== 0 && current.getDay() !== 6) {
            diasRestantes++;
        }
    }
    return diasRestantes;
}

function calcularTiempoRestante(fechaLimite) {
    const ahora = ajustarHoraMexico(new Date());
    const limite = ajustarHoraMexico(new Date(fechaLimite));

    if (ahora >= limite) return 'Expirado';

    let tiempoRestante = limite - ahora;
    let current = new Date(ahora);
    while (current < limite) {
        if (current.getDay() === 0 || current.getDay() === 6) {
            tiempoRestante -= 86400000;
        }
        current.setDate(current.getDate() + 1);
    }

    if (tiempoRestante <= 0) return 'Expirado';

    const segundos = Math.floor(tiempoRestante / 1000);
    const minutos = Math.floor(segundos / 60) % 60;
    const horas = Math.floor(segundos / 3600) % 24;
    const dias = Math.floor(segundos / 86400);

    return `${dias} días hábiles ${horas} hrs ${minutos.toString().padStart(2, '0')} min`;
}

function obtenerFechaHoy() {
    const ahora = new Date();
    const offsetMexico = -6 * 60;
    ahora.setMinutes(ahora.getMinutes() + ahora.getTimezoneOffset() + offsetMexico);
    return ahora.toISOString().split('T')[0];
}

function ajustarHoraMexico(fecha) {
    const offsetMexico = -6 * 60;
    const nuevaFecha = new Date(fecha);
    nuevaFecha.setMinutes(nuevaFecha.getMinutes() + nuevaFecha.getTimezoneOffset() + offsetMexico);
    return nuevaFecha;
}

async function generarFolio(tipo = 'solicitud') {
    const tipoFolio = {
        'acuerdo': 'ultimoFolioAcuerdo',
        'oficio': 'ultimoFolioOficio',
        'solicitud': 'ultimoFolio',
        'institucional': 'ultimoFolioInstitucional',
    };

    const prefijos = {
        'acuerdo': 'AG-',
        'oficio': 'OF-',
        'solicitud': 'SO-',
        'institucional': 'SI-',
    };

    const folioRef = ref(database, `configuracion/${tipoFolio[tipo]}`);
    const snapshot = await get(folioRef);
    const nuevoFolio = (snapshot.val() || 0) + 1;
    await set(folioRef, nuevoFolio);
    return `${prefijos[tipo]}${nuevoFolio.toString().padStart(4, '0')}`;
}

function cargarValidadas() {
    const userRol = parseInt(getCookie('rol')) || 0;
    const userDependencias = getCookie('dependencia') ?
        decodeURIComponent(getCookie('dependencia')).split(',') : [];

    const { esJefaturaGabinete, esSecretariaParticular, esOficialMayor, esPresidentaMunicipal } = obtenerFiltroEspecial();
    let paths = ['solicitudes', 'acuerdos', 'oficios', 'solicitudes_institucionales'];

    if (esJefaturaGabinete) {
        paths = ['acuerdos'];
    } else if (esSecretariaParticular) {
        paths = ['solicitudes', 'oficios'];
    } else if (esOficialMayor) {
        // CAMBIO: incluir oficios
        paths = ['solicitudes_institucionales', 'oficios'];
    }

    solicitudesValidadas = [];

    paths.forEach(path => {
        let q;
        if (userRol === 3 || userRol === 4) {
            q = query(
                ref(database, path),
                orderByChild('estado'),
                equalTo('atendida')
            );
        } else {
            q = query(
                ref(database, path),
                orderByChild('estado'),
                equalTo('atendida')
            );
        }

        onValue(q, (snapshot) => {
            // Eliminar los anteriores de este path para evitar duplicados
            solicitudesValidadas = solicitudesValidadas.filter(s => s.tipoPath !== path);

            snapshot.forEach(childSnapshot => {
                const doc = childSnapshot.val();

                // Filtro de dependencia (para no admin)
                if (userRol !== 3 && userRol !== 4 && !userDependencias.includes(doc.dependencia)) return;
                if (doc.estado !== 'atendida') return;

                // ─── FILTRO PARA OFICIOS (SOLO OFICIALIA MAYOR) ───
                if (esOficialMayor && path === 'oficios' && doc.dependencia !== 'oficialia-mayor') {
                    return;
                }
                // ──────────────────────────────────────────────────

                const solicitud = {
                    key: childSnapshot.key,
                    tipoPath: path,
                    ...doc
                };

                if (!solicitudesValidadas.some(s => s.key === solicitud.key)) {
                    solicitudesValidadas.push(solicitud);
                }
            });

            solicitudesValidadas = filtrarPorPerfil(solicitudesValidadas);

            solicitudesValidadas.sort((a, b) =>
                new Date(b.fechaAtencion || b.fechaCreacion) - new Date(a.fechaAtencion || a.fechaCreacion)
            );

            aplicarFiltrosValidadas();
        });
    });
}

function mostrarPaginaValidadas(data) {
    const start = (currentPageValidadas - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const tabla = document.getElementById('lista-validadas');

    tabla.innerHTML = '';

    if (data.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="8" class="text-center py-4">
                <i class="fas fa-info-circle me-2"></i>
                No hay solicitudes validadas para mostrar
            </td>
        `;
        tabla.appendChild(tr);
        actualizarPaginacion('validadas', 0);
        return;
    }

    const items = data.slice(start, end);

    const frag = document.createDocumentFragment();
    items.forEach(solicitud => {
        let tipoDocumento = 'Solicitud';
        if (solicitud.tipoPath === 'acuerdos') tipoDocumento = 'Acuerdo';
        if (solicitud.tipoPath === 'oficios') tipoDocumento = 'Oficio';
        if (solicitud.tipoPath === 'solicitudes_institucionales') tipoDocumento = 'Institucional';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${solicitud.key}</td>
            <td>${solicitud.tipo || tipoDocumento}</td>
            <td>${solicitud.asunto}</td>
            <td>${dependenciasMap[solicitud.dependencia] || 'Desconocida'}</td>
            <td>${solicitud.solicitante?.nombre || solicitud.contacto || 'N/A'}</td>
            <td>${solicitud.solicitante?.telefono || solicitud.telefono || 'N/A'}</td>
            <td>${new Date(solicitud.fechaAtencion).toLocaleDateString()}</td>
            <td>
                ${solicitud.documentoInicial ? `
                <button class="btn btn-sm btn-documento-inicial" 
                        onclick="mostrarEvidenciaModal('${solicitud.key}','Documento Inicial','${solicitud.documentoInicial}','${tipoDocumento}')">
                    <i class="fas fa-file-import me-2"></i> Documento Inicial
                </button>
                ` : ''}
                
                ${solicitud.evidencias ? `
                <button class="btn btn-sm btn-evidencia" 
                        onclick="mostrarEvidenciaModal('${solicitud.key}','Evidencia','${solicitud.evidencias}','${tipoDocumento}')">
                    <i class="fas fa-search me-2"></i> Documento Evidencia
                </button>
                ` : ''}
            </td>
        `;
        frag.appendChild(tr);
    });
    tabla.appendChild(frag);

    actualizarPaginacion('validadas', data.length);
}

function actualizarPaginacion(tipo, totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const container = document.querySelector(`.paginacion-${tipo}`);
    let currentPage = tipo === 'seguimiento' ? currentPageSeguimiento : currentPageValidadas;

    container.innerHTML = '';

    if (totalItems === 0 || totalPages === 0) {
        return;
    }

    if (currentPage > totalPages) {
        currentPage = totalPages;
        if (tipo === 'seguimiento') {
            currentPageSeguimiento = currentPage;
        } else {
            currentPageValidadas = currentPage;
        }
    }

    const paginationHTML = `
        <div class="paginacion-contenedor">
            <button class="btn-pag anterior" ${currentPage === 1 ? 'disabled' : ''}>
                Anterior
            </button>
            <span class="info-pagina">Página ${currentPage} de ${totalPages}</span>
            <button class="btn-pag siguiente" ${currentPage === totalPages ? 'disabled' : ''}>
                Siguiente
            </button>
        </div>
    `;

    container.innerHTML = paginationHTML;

    container.querySelector('.anterior')?.addEventListener('click', () => {
        if (tipo === 'seguimiento') {
            currentPageSeguimiento = Math.max(1, currentPageSeguimiento - 1);
        } else {
            currentPageValidadas = Math.max(1, currentPageValidadas - 1);
        }
        tipo === 'seguimiento' ? aplicarFiltrosSeguimiento() : aplicarFiltrosValidadas();
    });

    container.querySelector('.siguiente')?.addEventListener('click', () => {
        if (tipo === 'seguimiento') {
            currentPageSeguimiento = Math.min(totalPages, currentPageSeguimiento + 1);
        } else {
            currentPageValidadas = Math.min(totalPages, currentPageValidadas + 1);
        }
        tipo === 'seguimiento' ? aplicarFiltrosSeguimiento() : aplicarFiltrosValidadas();
    });
}

function obtenerValidadasFiltradas() {
    const busqueda = document.getElementById('busqueda-validadas').value.toLowerCase();
    const secretaria = document.getElementById('filtro-secretaria-validadas').value;
    const canal = document.getElementById('filtro-canal-validadas').value;
    const { esJefaturaGabinete, esSecretariaParticular } = obtenerFiltroEspecial();

    let filtradas = filtrarPorPerfil(solicitudesValidadas);

    return filtradas.filter(doc => {
        const esAcuerdoAtendido = (doc.tipo === 'Acuerdo' && doc.estado === 'atendida');

        if (esJefaturaGabinete && !esAcuerdoAtendido && doc.tipo !== 'acuerdo') return false;
        if (esSecretariaParticular && !esAcuerdoAtendido && doc.tipo === 'acuerdo') return false;

        const texto = `${doc.key || ''} ${doc.asunto || ''} ${dependenciasMap[doc.dependencia] || ''} ${doc.tipo || ''}`.toLowerCase();
        const coincideSecretaria = !secretaria || doc.dependencia === secretaria;
        const coincideCanal = !canal || (doc.tipo || '').toLowerCase().includes(canal.toLowerCase());
        return texto.includes(busqueda) && coincideSecretaria && coincideCanal;
    });
}

function aplicarFiltrosValidadas() {
    mostrarPaginaValidadas(obtenerValidadasFiltradas());
}

function obtenerSeguimientoFiltrado() {
    const busqueda = document.getElementById('busqueda-seguimiento').value.toLowerCase();
    const estado = document.getElementById('filtro-estado-seguimiento').value;
    const { esJefaturaGabinete, esSecretariaParticular } = obtenerFiltroEspecial();

    let filtradas = filtrarPorPerfil(solicitudesSeguimiento);

    return filtradas.filter(s => {
        if (esJefaturaGabinete && s.tipoPath !== 'acuerdos') return false;
        if (esSecretariaParticular && s.tipoPath === 'acuerdos') return false;
        if (s.estado === 'atendida') return false;

        const texto = `${s.key || s.folio || ''} ${s.asunto || ''} ${dependenciasMap[s.dependencia] || ''}`.toLowerCase();
        const coincideEstado = !estado || s.estado === estado;
        return texto.includes(busqueda) && coincideEstado;
    });
}

function aplicarFiltrosSeguimiento() {
    mostrarPaginaSeguimiento(obtenerSeguimientoFiltrado());
}

function mostrarPaginaSeguimiento(data) {
    const start = (currentPageSeguimiento - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const tabla = document.getElementById('lista-seguimiento');

    tabla.innerHTML = '';

    if (data.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="6" class="text-center py-4">
                <i class="fas fa-info-circle me-2"></i>
                No se encontraron solicitudes con los filtros aplicados
            </td>
        `;
        tabla.appendChild(tr);
        actualizarPaginacion('seguimiento', 0);
        return;
    }

    const items = data.slice(start, end);

    if (items.length === 0) {
        currentPageSeguimiento = Math.max(1, currentPageSeguimiento - 1);
        return mostrarPaginaSeguimiento(data);
    }

    const frag = document.createDocumentFragment();
    items.forEach(solicitud => frag.appendChild(crearFilaSolicitud(solicitud)));
    tabla.appendChild(frag);

    actualizarPaginacion('seguimiento', data.length);
}

async function cargarSecretarias() {
    const secretariasRef = ref(database, 'dependencias');
    const snapshot = await get(secretariasRef);
    const selects = ['secretaria', 'secretariaAcuerdo', 'secretariaOficio', 'filtro-secretaria-validadas', 'secretariaInstitucional', 'filtro-secretaria-vobo'];

    const userRol = parseInt(getCookie('rol')) || 0;
    let userDependencias = getCookie('dependencia') ?
        decodeURIComponent(getCookie('dependencia')).split(',') : [];

    const { esVinculacionCiudadana } = obtenerFiltroEspecial();

    if (esVinculacionCiudadana) {
        userDependencias = [DEPENDENCIA_SECRETARIA_GENERAL];
    }

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        select.innerHTML = '<option value="" disabled selected>Seleccione una secretaría</option>';

        snapshot.forEach((childSnapshot) => {
            const dependencia = childSnapshot.val();
            const dependenciaKey = childSnapshot.key;

            if (!dependencia || typeof dependencia.nombre !== 'string') return;

            if (userRol !== 3 && !userDependencias.includes(dependenciaKey)) return;

            const nombre = dependencia.nombre.trim();
            if (!nombre) return;

            const option = document.createElement('option');
            option.value = dependenciaKey;
            option.textContent = nombre;
            select.appendChild(option);
        });
    });
}

// ===================== NUEVA FUNCIÓN PARA DESCARGAR CON FETCH =====================
async function descargarArchivoConFetch(url, nombreArchivo) {
    try {
        Toastify({
            text: 'Descargando archivo...',
            duration: 2000,
            className: "toastify-info",
        }).showToast();

        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache',
            credentials: 'omit'
        });

        if (!response.ok) {
            throw new Error(`Error al descargar: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = nombreArchivo || 'archivo_descargado';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => {
            URL.revokeObjectURL(link.href);
        }, 100);

        Toastify({
            text: 'Descarga completada',
            duration: 2000,
            className: "toastify-success",
        }).showToast();

    } catch (error) {
        console.error('Error en la descarga:', error);
        mostrarError(`No se pudo descargar el archivo: ${error.message}. Intenta abrirlo en una nueva pestaña.`);
        window.open(url, '_blank');
    }
}
// ========================================================================

// ===================== FUNCIONES MEJORADAS PARA VISOR DE DOCUMENTOS =====================
// Siempre muestran el botón de descarga y manejan errores de carga, y ahora descargan con fetch

window.mostrarEvidenciaModal = function (folio, tipoDocumento, urlDocumento, secretaria = '') {
    const modal = new bootstrap.Modal(document.getElementById('evidenciaModal'));
    const loading = document.getElementById('loadingPreview');
    const pdfContainer = document.getElementById('pdfContainer');
    const imagenContainer = document.getElementById('imagenContainer');
    const visorNoSoportado = document.getElementById('visorNoSoportado');
    const pdfViewer = document.getElementById('pdfViewer');
    const descargarBtn = document.getElementById('descargarEvidencia');

    // Resetear
    [loading, pdfContainer, imagenContainer, visorNoSoportado].forEach(el => el.classList.add('d-none'));
    loading.classList.remove('d-none');
    pdfViewer.src = '';
    pdfViewer.onerror = null;
    pdfViewer.onload = null;
    descargarBtn.classList.add('d-none');

    let nombreArchivo = 'Sin documento';
    let extension = '';
    if (urlDocumento) {
        try {
            nombreArchivo = decodeURIComponent(urlDocumento.split('/').pop().split('?')[0]);
            extension = nombreArchivo.split('.').pop().toLowerCase();
        } catch (e) {
            console.error('Error procesando URL:', e);
        }
    }

    // Metadatos
    document.getElementById('nombreArchivoCompleto').textContent = `${tipoDocumento}: ${nombreArchivo}`;
    document.getElementById('folioEvidencia').textContent = folio;
    document.getElementById('secretariaEvidencia').textContent = secretaria || 'No especificada';
    document.getElementById('fechaEvidencia').textContent = new Date().toLocaleDateString('es-MX');

    // Configurar el botón de descarga con fetch
    descargarBtn.classList.remove('d-none');
    descargarBtn.textContent = 'Descargar archivo';
    descargarBtn.onclick = function (e) {
        e.preventDefault();
        if (urlDocumento) {
            descargarArchivoConFetch(urlDocumento, nombreArchivo);
        } else {
            mostrarError('No hay archivo para descargar.');
        }
    };

    // Función para manejar error de carga
    function handleLoadError() {
        loading.classList.add('d-none');
        visorNoSoportado.classList.remove('d-none');
        document.getElementById('tipoArchivo').textContent = extension || 'documento';
        descargarBtn.classList.remove('d-none');
        mostrarError('No se pudo cargar el documento. Puedes descargarlo manualmente.');
    }

    // Mostrar según extensión
    setTimeout(() => {
        loading.classList.add('d-none');

        if (!urlDocumento) {
            visorNoSoportado.classList.remove('d-none');
            document.getElementById('tipoArchivo').textContent = 'Documento no disponible';
            descargarBtn.classList.add('d-none');
            return;
        }

        if (extension === 'pdf') {
            pdfContainer.classList.remove('d-none');
            document.getElementById('pdfMeta').textContent = `${nombreArchivo} | ${tipoDocumento}`;
            pdfViewer.style.minHeight = '500px';
            pdfViewer.onerror = handleLoadError;
            pdfViewer.onload = function() { };
            pdfViewer.src = urlDocumento + '#view=FitH&toolbar=0';
        } else if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) {
            imagenContainer.classList.remove('d-none');
            const img = document.getElementById('visorImagen');
            img.src = urlDocumento;
            img.onload = () => {
                document.getElementById('imagenDimensions').textContent = `${img.naturalWidth}px × ${img.naturalHeight}px`;
            };
            img.onerror = handleLoadError;
        } else {
            visorNoSoportado.classList.remove('d-none');
            document.getElementById('tipoArchivo').textContent = `.${extension}`;
        }
    }, 300);

    modal.show();
};

window.mostrarDocumentoInicial = function (folio, nombreArchivo, url, secretariaOrigen) {
    const solicitud = solicitudesSeguimiento.find(s => s.folio === folio);

    const fechaDocumento = solicitud?.fechaCreacion
        ? new Date(solicitud.fechaCreacion).toLocaleDateString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        })
        : '-';

    const modal = new bootstrap.Modal(document.getElementById('evidenciaModal'));
    const loading = document.getElementById('loadingPreview');
    const pdfContainer = document.getElementById('pdfContainer');
    const imagenContainer = document.getElementById('imagenContainer');
    const visorNoSoportado = document.getElementById('visorNoSoportado');
    const pdfViewer = document.getElementById('pdfViewer');
    const descargarBtn = document.getElementById('descargarEvidencia');
    const modalElement = document.getElementById('evidenciaModal');

    // Resetear estado inicial
    [loading, pdfContainer, imagenContainer, visorNoSoportado].forEach(el => {
        el.classList.add('d-none');
    });
    loading.classList.remove('d-none');
    pdfViewer.src = '';
    pdfViewer.removeAttribute('data-temp-src');
    descargarBtn.classList.add('d-none');

    // Configurar nombre de archivo
    const extractFileName = (url) => {
        try {
            const decodedUrl = decodeURIComponent(url);
            return decodedUrl.split('/').pop().split(/[?#]/)[0];
        } catch (error) {
            console.error('Error al extraer nombre:', error);
            return 'archivo-desconocido';
        }
    };

    const nombre = nombreArchivo || extractFileName(url);
    const fileExt = nombre.split('.').pop().toLowerCase();

    // Actualizar metadatos
    document.getElementById('nombreArchivoCompleto').textContent = nombre;
    document.getElementById('folioEvidencia').textContent = folio;
    document.getElementById('secretariaEvidencia').textContent = secretariaOrigen || '-';
    document.getElementById('fechaEvidencia').textContent = fechaDocumento;

    // Configurar el botón de descarga con fetch
    descargarBtn.classList.remove('d-none');
    descargarBtn.textContent = 'Descargar archivo';
    descargarBtn.onclick = function (e) {
        e.preventDefault();
        if (url) {
            descargarArchivoConFetch(url, nombre);
        } else {
            mostrarError('No hay archivo para descargar.');
        }
    };

    // Función para manejar error de carga
    function handleLoadError() {
        loading.classList.add('d-none');
        visorNoSoportado.classList.remove('d-none');
        document.getElementById('tipoArchivo').textContent = fileExt || 'documento';
        descargarBtn.classList.remove('d-none');
        mostrarError('No se pudo cargar el documento. Puedes descargarlo manualmente.');
    }

    // Configurar eventos del modal
    const modalShownHandler = () => {
        if (pdfViewer.dataset.tempSrc) {
            const container = pdfViewer.parentElement;
            pdfViewer.style.height = `${container.clientHeight}px`;

            setTimeout(() => {
                pdfViewer.src = pdfViewer.dataset.tempSrc;
                delete pdfViewer.dataset.tempSrc;
            }, 100);
        }
    };

    const resizeHandler = () => {
        if (pdfViewer && pdfContainer.classList.contains('d-none') === false) {
            const container = pdfViewer.parentElement;
            const newHeight = Math.max(400, container.clientHeight);
            pdfViewer.style.height = `${newHeight}px`;
        }
    };

    // Configurar visores
    setTimeout(() => {
        loading.classList.add('d-none');

        if (!url) {
            visorNoSoportado.classList.remove('d-none');
            document.getElementById('tipoArchivo').textContent = 'Documento no disponible';
            descargarBtn.classList.add('d-none');
            return;
        }

        if (['jpg', 'jpeg', 'png', 'gif'].includes(fileExt)) {
            imagenContainer.classList.remove('d-none');
            const img = document.getElementById('visorImagen');
            img.src = url;
            img.onload = () => {
                document.getElementById('imagenDimensions').textContent =
                    `${img.naturalWidth}px × ${img.naturalHeight}px`;
            };
            img.onerror = handleLoadError;
        } else if (fileExt === 'pdf') {
            pdfContainer.classList.remove('d-none');
            document.getElementById('pdfMeta').textContent = `${nombre} | ${fechaDocumento}`;
            pdfViewer.dataset.tempSrc = `${url}#view=FitH`;
            pdfViewer.onerror = handleLoadError;
            window.addEventListener('resize', resizeHandler);
            setTimeout(resizeHandler, 50);
        } else {
            visorNoSoportado.classList.remove('d-none');
            document.getElementById('tipoArchivo').textContent = `.${fileExt}`;
        }
    }, 300);

    // Evento de zoom para imágenes
    document.getElementById('visorImagen').onclick = function () {
        this.classList.toggle('img-zoom');
    };

    // Manejar eventos del modal
    modalElement.addEventListener('shown.bs.modal', modalShownHandler);
    modalElement.addEventListener('hidden.bs.modal', () => {
        window.removeEventListener('resize', resizeHandler);
        modalElement.removeEventListener('shown.bs.modal', modalShownHandler);
        pdfViewer.src = '';
    });

    modal.show();
};
// ===================== FIN FUNCIONES MEJORADAS =====================

// 1. Crear un mapa global de dependencias
let dependenciasMap = {};
let _dependenciasCargadas = false;

async function cargarDependencias() {
    if (_dependenciasCargadas) return;

    const dependenciasRef = ref(database, 'dependencias');
    const snapshot = await get(dependenciasRef);

    const mapeoOficial = {
        'presidencia-municipal-constitucional': 'Presidencia Municipal Constitucional',
        'secretaria-bienestar-social': 'Secretaría de Bienestar Social',
        'secretaria-contraloria-interna': 'Secretaría de la Contraloría Interna Municipal',
        'secretaria-desarrollo-economico': 'Secretaría de Desarrollo Económico',
        'secretaria-finanzas': 'Secretaría de Finanzas',
        'secretaria-general-municipal': 'Secretaría General Municipal',
        'secretaria-obras-publicas': 'Secretaría de Obras Públicas',
        'secretaria-seguridad-ciudadana': 'Secretaría de Seguridad Ciudadana'
    };

    snapshot.forEach((childSnapshot) => {
        const key = childSnapshot.key;
        dependenciasMap[key] = mapeoOficial[key] || childSnapshot.val().nombre;
    });

    _dependenciasCargadas = true;
}

let intervaloActualizacionGlobal = null;

function iniciarActualizacionTiempo() {
    if (intervaloActualizacionGlobal) clearInterval(intervaloActualizacionGlobal);

    intervaloActualizacionGlobal = setInterval(() => {
        document.querySelectorAll('#lista-seguimiento tr').forEach(fila => {
            const estado = fila.dataset.estado;
            const celdaTiempo = fila.cells[7];

            if (['verificacion', 'atendida'].includes(estado)) {
                celdaTiempo.textContent = estado === 'verificacion'
                    ? 'En Verificación'
                    : 'Atendida';
                return;
            }

            const fechaLimite = fila.dataset.fechaLimite;
            celdaTiempo.textContent = calcularTiempoRestante(fechaLimite);
        });
    }, 300000);
}

function actualizarEstadisticas(solicitudes) {
    const { esSecretariaGeneral, esVinculacionCiudadana } = obtenerFiltroEspecial();
    const userEmail = getCookie('email');

    const stats = {
        pendientes: 0,
        pendientesVobo: 0,
        porVencer: 0,
        enProceso: 0,
        verificacion: 0,
        atendidas: 0,
        atrasadas: 0,
        total: 0
    };

    if (esSecretariaGeneral || userEmail === CORREO_SECRETARIA_GENERAL) {
        solicitudesVobo.forEach(s => {
            if (s.estado === 'pendiente_vobo') {
                stats.pendientesVobo++;
            }
        });
    }

    let solicitudesFiltradas = solicitudes;
    if (esVinculacionCiudadana) {
        solicitudesFiltradas = filtrarSoloVinculacionCiudadana(solicitudes);
    }

    solicitudesFiltradas.forEach(s => {
        stats.total++;
        const estado = s.estado;

        switch (estado) {
            case 'pendiente':
                stats.pendientes++;
                break;
            case 'pendiente_vobo':
                if (!esSecretariaGeneral && userEmail !== CORREO_SECRETARIA_GENERAL) {
                    stats.pendientes++;
                }
                break;
            case 'por_vencer':
                stats.porVencer++;
                break;
            case 'en_proceso':
                stats.enProceso++;
                break;
            case 'verificacion':
                stats.verificacion++;
                break;
            case 'atendida':
                stats.atendidas++;
                break;
            case 'atrasada':
                stats.atrasadas++;
                break;
        }
    });

    const elements = {
        'stats-pendientes': stats.pendientes,
        'stats-vencer': stats.porVencer,
        'stats-en-proceso': stats.enProceso,
        'stats-verificacion': stats.verificacion,
        'stats-atendidas': stats.atendidas,
        'stats-atrasadas': stats.atrasadas,
        'stats-pendientes-vobo': stats.pendientesVobo
    };

    Object.keys(elements).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = elements[id];
        }
    });

    const eficienciaElement = document.getElementById('stats-eficiencia');
    if (eficienciaElement) {
        const eficiencia = (stats.atendidas / (stats.total || 1)) * 100;
        eficienciaElement.textContent = `${Math.round(eficiencia)}%`;
    }

    const statsVoboElement = document.getElementById('stats-pendientes-vobo');
    if (statsVoboElement) {
        const statCard = statsVoboElement.closest('.stat-card');
        if (statCard) {
            if (esSecretariaGeneral || userEmail === CORREO_SECRETARIA_GENERAL) {
                statCard.style.display = 'block';
            } else {
                statCard.style.display = 'none';
            }
        }
    }
}

function actualizarTablaSeguimiento() {
    const tabla = document.getElementById('lista-seguimiento');
    const foliosUnicos = new Set();

    tabla.innerHTML = '';

    const frag = document.createDocumentFragment();
    [...solicitudesSeguimiento].reverse().forEach(solicitud => {
        if (!foliosUnicos.has(solicitud.key)) {
            foliosUnicos.add(solicitud.key);
            frag.appendChild(crearFilaSolicitud(solicitud));
        }
    });
    tabla.appendChild(frag);

    iniciarActualizacionTiempo();
    aplicarFiltrosSeguimiento();
    actualizarEstadisticas(solicitudesSeguimiento);
    actualizarGraficas(solicitudesSeguimiento);
}

let accionActual = '';

window.cambiarEstado = async function (folio, nuevoEstado, motivo = '', justificacion = '') {
    try {
        const solicitudExistente = solicitudesSeguimiento.find(s => s.key === folio);

        if (!solicitudExistente) {
            throw new Error('Documento no encontrado en datos locales');
        }

        let path = solicitudExistente.tipoPath || 'solicitudes';

        if (path === 'solicitudes' && folio.startsWith('SI-')) {
            path = 'solicitudes_institucionales';
        }

        const docRef = ref(database, `${path}/${folio}`);
        const tipoDocumento = path === 'solicitudes' ? 'Solicitud' :
            path === 'acuerdos' ? 'Acuerdo' :
                path === 'oficios' ? 'Oficio' :
                    path === 'solicitudes_institucionales' ? 'Institucional' : 'Documento';

        const snapshot = await get(docRef);
        const datos = snapshot.val();

        if (nuevoEstado === 'pendiente' && datos.evidencias) {
            try {
                const urlParts = datos.evidencias.split('/');
                const index = urlParts.indexOf('o') + 1;
                const pathStorage = decodeURIComponent(urlParts[index]).split('?')[0];
                const evidenciaRef = storageRef(storage, pathStorage);

                await getDownloadURL(evidenciaRef);
                await deleteObject(evidenciaRef);
            } catch (error) {
                if (error.code === 'storage/object-not-found') {
                    console.log('Archivo no encontrado, continuando...');
                } else {
                    console.error("Error manejando evidencia:", error);
                    throw new Error('Error al eliminar archivo adjunto');
                }
            }
        }

        if (nuevoEstado === 'pendiente' && !motivo) {
            return;
        }

        const actualizacion = {
            estado: nuevoEstado,
            ultimaActualizacion: new Date().toISOString(),
            evidencias: nuevoEstado === 'pendiente' ? null : datos.evidencias || null,
            _actualizadoPor: getCookie('nombre') || 'Sistema',
            motivoRechazo: nuevoEstado === 'pendiente' ? motivo : null,
            fechaRechazo: nuevoEstado === 'pendiente' ? new Date().toISOString() : null,
            justificacionProceso: nuevoEstado === 'en_proceso' ? justificacion : null
        };

        if (nuevoEstado === 'atendida') {
            actualizacion.fechaAtencion = new Date().toISOString();
        } else if (nuevoEstado === 'verificacion') {
            actualizacion.fechaVerificacion = new Date().toISOString();
        }

        await update(docRef, actualizacion);

        const index = solicitudesSeguimiento.findIndex(s => s.key === folio);
        if (index !== -1) {
            solicitudesSeguimiento[index] = {
                ...solicitudesSeguimiento[index],
                ...actualizacion,
                tipoPath: path
            };

            if (typeof actualizarTablaSeguimiento === 'function') {
                actualizarTablaSeguimiento();
            } else {
                console.error('Función actualizarTablaSeguimiento no definida');
            }

            cargarVerificacion();
            cargarValidadas();
        }

        const mensajes = {
            'en_proceso': `${tipoDocumento} marcada en proceso`,
            'verificacion': `${tipoDocumento} enviada a verificación`,
            'atendida': `${tipoDocumento} aprobada exitosamente`,
            'pendiente': `${tipoDocumento} rechazada correctamente`
        };

        if (mensajes[nuevoEstado]) {
            mostrarExito(mensajes[nuevoEstado]);
        }

    } catch (error) {
        console.error("Error completo:", error);
        const mensajeError = error.code === 'storage/object-not-found'
            ? 'El archivo adjunto no fue encontrado'
            : 'Error al actualizar el documento';

        mostrarError(mensajeError);
    } finally {
        if (nuevoEstado !== 'pendiente' || (motivo && motivo.trim() !== '')) {
            folioActual = '';
            accionActual = '';
        }
    }
};

// Event listeners para inputs de archivo
document.getElementById('evidenciaFile').addEventListener('change', function (e) {
    const fileInfo = document.getElementById('fileInfo');
    const removeBtn = document.getElementById('removeFile');

    if (this.files.length > 0) {
        const file = this.files[0];
        const extension = file.name.split('.').pop().toLowerCase();

        if (!ALLOWED_EXTENSIONS.includes(extension)) {
            mostrarError(`Formato no permitido: .${extension}`);
            this.value = '';
            fileInfo.textContent = 'Formatos permitidos: .pdf, .jpg, .jpeg, .png, .zip, .rar (Máx. 10MB)';
            removeBtn.classList.add('d-none');
            return;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            mostrarError(`El archivo excede el tamaño máximo de ${MAX_FILE_SIZE_MB}MB`);
            this.value = '';
            fileInfo.textContent = 'Formatos permitidos: .pdf, .jpg, .jpeg, .png, .zip, .rar (Máx. 10MB)';
            removeBtn.classList.add('d-none');
            return;
        }

        removeBtn.classList.remove('d-none');
        fileInfo.innerHTML = `
            <span class="text-success">
                <i class="fas fa-file me-2"></i>${file.name}
            </span>
            <br><small>${(file.size / 1024 / 1024).toFixed(2)} MB</small>`;
    } else {
        fileInfo.textContent = 'Formatos permitidos: .pdf, .jpg, .jpeg, .png, .zip, .rar (Máx. 10MB)';
        removeBtn.classList.add('d-none');
    }
});

document.getElementById('removeFile').addEventListener('click', () => {
    const fileInput = document.getElementById('evidenciaFile');
    fileInput.value = '';
    fileInput.dispatchEvent(new Event('change'));
});

const fileDropArea = document.querySelector('.file-drop-area');

['dragenter', 'dragover'].forEach(eventName => {
    fileDropArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        fileDropArea.classList.add('dragover');
    });
});

['dragleave', 'drop'].forEach(eventName => {
    fileDropArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        fileDropArea.classList.remove('dragover');
    });
});

fileDropArea.addEventListener('drop', (e) => {
    const input = document.getElementById('evidenciaFile');
    input.files = e.dataTransfer.files;
    input.dispatchEvent(new Event('change'));
});

window.subirEvidenciaYCambiarEstado = async function () {
    const fileInput = document.getElementById('evidenciaFile');
    const file = fileInput.files[0];
    let tipo = 'solicitudes';
    if (folioActual.startsWith('AG-')) tipo = 'acuerdos';
    else if (folioActual.startsWith('OF-')) tipo = 'oficios';
    else if (folioActual.startsWith('SI-')) tipo = 'solicitudes_institucionales';

    if (!file) {
        mostrarError("Debes seleccionar un archivo primero");
        return;
    }

    const extension = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
        mostrarError(`Formato no permitido: .${extension}`);
        return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
        mostrarError(`El archivo excede el tamaño máximo de ${MAX_FILE_SIZE_MB}MB`);
        return;
    }

    try {
        const storagePath = `${folioActual}/Evidencia/${file.name}`;
        const refArchivo = storageRef(storage, storagePath);
        await uploadBytes(refArchivo, file);
        const urlDescarga = await getDownloadURL(refArchivo);

        await update(ref(database, `${tipo}/${folioActual}`), {
            estado: 'verificacion',
            evidencias: urlDescarga,
            fechaVerificacion: new Date().toISOString()
        });

        fileInput.value = '';
        bootstrap.Modal.getInstance('#confirmarAtendidaModal').hide();
        mostrarExito("Evidencia subida correctamente");

    } catch (error) {
        console.error("Error completo:", error);
        mostrarError(`Error técnico: ${error.code} - ${error.message}`);
    }
};

// Funciones de utilidad
function mostrarError(mensaje) {
    Toastify({
        text: mensaje,
        className: "toastify-error",
        duration: 3000
    }).showToast();
}

function mostrarExito(mensaje) {
    Toastify({
        text: mensaje,
        className: "toastify-success",
        duration: 3000
    }).showToast();
}

function cargarVerificacion() {
    const { esJefaturaGabinete, esSecretariaParticular, esOficialMayor, esPresidentaMunicipal } = obtenerFiltroEspecial();
    let paths = ['solicitudes', 'acuerdos', 'oficios', 'solicitudes_institucionales'];

    if (esJefaturaGabinete) {
        paths = ['acuerdos'];
    } else if (esSecretariaParticular) {
        paths = ['solicitudes', 'oficios'];
    } else if (esOficialMayor) {
        // CAMBIO: incluir oficios
        paths = ['solicitudes_institucionales', 'oficios'];
    }

    solicitudesVerificacion = [];

    const userRol = parseInt(getCookie('rol')) || 0;
    const userDependencias = getCookie('dependencia') ?
        decodeURIComponent(getCookie('dependencia')).split(',') : [];

    if (userRol !== 3 && userDependencias.length === 0) {
        mostrarPaginaVerificacion([]);
        return;
    }

    paths.forEach(path => {
        let q;
        if (userRol === 3 || userRol === 4) {
            q = query(
                ref(database, path),
                orderByChild('estado'),
                equalTo('verificacion')
            );
        } else {
            userDependencias.forEach(dependencia => {
                q = query(
                    ref(database, path),
                    orderByChild('dependencia'),
                    equalTo(dependencia)
                );
            });
        }

        if (!q) {
            console.error('Query no definida para el path:', path);
            return;
        }

        onValue(q, (snapshot) => {
            solicitudesVerificacion = solicitudesVerificacion.filter(s => s.tipoPath !== path);

            snapshot.forEach(childSnapshot => {
                const solicitud = childSnapshot.val();
                if (userRol !== 3 && userRol !== 4 && !userDependencias.includes(solicitud.dependencia)) return;
                if (solicitud.estado !== 'verificacion') return;

                // ─── FILTRO PARA OFICIOS (SOLO OFICIALIA MAYOR) ───
                if (esOficialMayor && path === 'oficios' && solicitud.dependencia !== 'oficialia-mayor') {
                    return;
                }
                // ──────────────────────────────────────────────────

                solicitud.key = childSnapshot.key;
                solicitud.tipoPath = path;
                solicitud.folio = solicitud.folio || childSnapshot.key;
                solicitudesVerificacion.push(solicitud);
            });

            solicitudesVerificacion = filtrarPorPerfil(solicitudesVerificacion);

            aplicarFiltrosVerificacion();
        });
    });
}

document.getElementById('busqueda-verificacion').addEventListener('input', debounce(() => {
    currentPageVerificacion = 1;
    aplicarFiltrosVerificacion();
}, 300));

function obtenerVerificacionFiltrada() {
    const busqueda = document.getElementById('busqueda-verificacion').value.toLowerCase();
    return solicitudesVerificacion.filter(s =>
        (s.folio || s.key || '').toLowerCase().includes(busqueda) ||
        (s.asunto || '').toLowerCase().includes(busqueda)
    );
}

function aplicarFiltrosVerificacion() {
    mostrarPaginaVerificacion(obtenerVerificacionFiltrada());
}

function actualizarPaginacionVerificacion(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const container = document.querySelector('.paginacion-verificacion');
    container.innerHTML = '';

    if (totalItems === 0 || totalPages === 0) return;

    container.innerHTML = `
        <div class="paginacion-contenedor">
            <button class="btn-pag anterior" ${currentPageVerificacion === 1 ? 'disabled' : ''}>
                Anterior
            </button>
            <span class="info-pagina">Página ${currentPageVerificacion} de ${totalPages}</span>
            <button class="btn-pag siguiente" ${currentPageVerificacion === totalPages ? 'disabled' : ''}>
                Siguiente
            </button>
        </div>
    `;

    container.querySelector('.anterior')?.addEventListener('click', () => {
        currentPageVerificacion = Math.max(1, currentPageVerificacion - 1);
        aplicarFiltrosVerificacion();
    });

    container.querySelector('.siguiente')?.addEventListener('click', () => {
        currentPageVerificacion = Math.min(totalPages, currentPageVerificacion + 1);
        aplicarFiltrosVerificacion();
    });
}

function mostrarPaginaVerificacion(data) {
    const start = (currentPageVerificacion - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const tabla = document.getElementById('lista-verificacion');
    tabla.innerHTML = '';

    if (data.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="9" class="text-center py-4">
                <i class="fas fa-info-circle me-2"></i>
                No hay solicitudes por verificar
            </td>
        `;
        tabla.appendChild(tr);
        actualizarPaginacionVerificacion(0);
        return;
    }

    const items = data.slice(start, end);

    const frag = document.createDocumentFragment();
    items.forEach(solicitud => {
        let tipoDocumento = 'Solicitud';
        if (solicitud.tipoPath === 'acuerdos') tipoDocumento = 'Acuerdo';
        if (solicitud.tipoPath === 'oficios') tipoDocumento = 'Oficio';
        if (solicitud.tipoPath === 'solicitudes_institucionales') tipoDocumento = 'Institucional';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${solicitud.folio}</td>
            <td>${solicitud.asunto}</td>
            <td>${tipoDocumento}</td>
            <td>${dependenciasMap[solicitud.dependencia] || 'Desconocida'}</td>
            <td>${solicitud.solicitante?.nombre || solicitud.contacto || 'N/A'}</td>
            <td>${solicitud.solicitante?.telefono || solicitud.telefono || 'N/A'}</td>
            <td>${new Date(solicitud.fechaVerificacion).toLocaleDateString()}</td>
            <td class="documentos-cell">
                <div class="documentos-container">
                    ${solicitud.documentoInicial ? `
                    <button class="btn btn-sm btn-documento-inicial" 
                        onclick="mostrarEvidenciaModal(
                            '${solicitud.folio}',
                            'Documento Inicial',
                            '${solicitud.documentoInicial}',
                            '${tipoDocumento}'
                        )">
                        <i class="fas fa-file-alt me-1"></i> Documento Inicial
                    </button>
                    ` : ''}
                    
                    ${solicitud.evidencias ? `
                    <button class="btn btn-sm btn-evidencia" 
                        onclick="mostrarEvidenciaModal(
                            '${solicitud.folio}',
                            'Evidencia',
                            '${solicitud.evidencias}',
                            '${tipoDocumento}'
                        )">
                        <i class="fas fa-search me-2"></i> Documento Evidencia
                    </button>
                    ` : ''}
                </div>
            </td>
            <td>
                <div class="d-flex gap-2">
                    <button class="btn btn-success btn-sm btn-aprobar" 
                        onclick="mostrarConfirmacion('${solicitud.folio}', 'aprobar', '${tipoDocumento}')">
                        <i class="fas fa-check me-1"></i> Aprobar
                    </button>
                    
                    <button class="btn btn-danger btn-sm btn-rechazar" 
                        onclick="mostrarConfirmacion('${solicitud.folio}', 'rechazar', '${tipoDocumento}')">
                        <i class="fas fa-times me-1"></i> Rechazar
                    </button>
                </div>
            </td>
        `;
        frag.appendChild(tr);
    });
    tabla.appendChild(frag);
    actualizarPaginacionVerificacion(data.length);
}

window.mostrarConfirmacion = function (folio, accion, tipo) {
    folioActual = folio;
    accionActual = accion;
    tipoActual = tipo;

    const modalId = accion === 'aprobar'
        ? '#confirmarAprobarModal'
        : '#confirmarRechazarModal';

    new bootstrap.Modal(document.querySelector(modalId)).show();
};

document.getElementById('documentoInicial').addEventListener('change', function (e) {
    if (suppressFileInputEvents) return;

    const fileInfo = document.getElementById('docInicialInfo');
    const removeBtn = document.getElementById('removeDocInicial');

    if (this.files.length > 0) {
        const file = this.files[0];
        const extension = file.name.split('.').pop().toLowerCase();

        if (!ALLOWED_INITIAL_EXTENSIONS.includes(extension)) {
            mostrarError(`Formato no permitido: .${extension}`);
            this.value = '';
            fileInfo.textContent = 'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
            removeBtn.classList.add('d-none');
            return;
        }

        if (file.size > MAX_INITIAL_FILE_SIZE_BYTES) {
            mostrarError(`El archivo excede el tamaño máximo de ${MAX_INITIAL_FILE_SIZE_MB}MB`);
            this.value = '';
            fileInfo.textContent = 'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
            removeBtn.classList.add('d-none');
            return;
        }

        removeBtn.classList.remove('d-none');
        fileInfo.innerHTML = `
            <span class="text-success">
                <i class="fas fa-file me-2"></i>${file.name}
            </span>
            <br><small>${(file.size / 1024 / 1024).toFixed(2)} MB</small>`;
    } else {
        fileInfo.textContent = 'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
        removeBtn.classList.add('d-none');
    }
});

document.getElementById('removeDocInicial').addEventListener('click', () => {
    const fileInput = document.getElementById('documentoInicial');
    fileInput.value = '';
    fileInput.dispatchEvent(new Event('change'));
});

// Colores y estados
const coloresGraficas = {
    primary: '#491F42',
    secondary: '#720F36',
    success: '#2E7D32',
    warning: '#FFA500',
    danger: '#a90000',
    info: '#ae9074',
    light: '#f8f9fa',
    dark: '#343a40',
    pendiente_vobo: '#FF6B35',
    rechazado_vobo: '#DC3545'
};

const estados = {
    'pendiente': { texto: 'Pendiente', color: coloresGraficas.primary },
    'pendiente_vobo': { texto: 'Pendiente VoBo', color: coloresGraficas.pendiente_vobo },
    'rechazado_vobo': { texto: 'VoBo Rechazado', color: coloresGraficas.rechazado_vobo },
    'por_vencer': { texto: 'Por Vencer', color: coloresGraficas.secondary },
    'en_proceso': { texto: 'En Proceso', color: coloresGraficas.info },
    'verificacion': { texto: 'En Verificación', color: coloresGraficas.warning },
    'atendida': { texto: 'Atendida', color: coloresGraficas.success },
    'atrasada': { texto: 'No Atendidas', color: coloresGraficas.danger }
};

function crearFilaSolicitud(solicitud) {
    const tr = document.createElement('tr');
    tr.dataset.fechaLimite = solicitud.fechaLimite;
    tr.dataset.estado = solicitud.estado;

    const nombresTipos = {
        'acuerdo': 'Acuerdo de Gabinete',
        'oficio': 'Oficio',
        'solicitud': 'Solicitud',
        'institucional': 'Solicitud Institucional'
    };

    const userRol = parseInt(getCookie('rol')) || 0;

    const estado = estados[solicitud.estado] || { texto: 'Desconocido', color: '#666' };
    const dependenciaNombre = dependenciasMap[solicitud.dependencia] || 'Desconocida';

    const userEmail = getCookie('email');
    const esVinculacionCiudadana = userEmail === CORREO_VINCULACION_CIUDADANA;

    const pendienteVobo = solicitud.estado === 'pendiente_vobo';
    const enVerificacion = solicitud.estado === 'verificacion';
    const atendida = solicitud.estado === 'atendida';
    const rechazadaVobo = solicitud.estado === 'rechazado_vobo';
    const deshabilitarBotones = pendienteVobo || enVerificacion || atendida;

    const botonReenvio = (esVinculacionCiudadana && rechazadaVobo) ? `
        <button class="btn btn-sm btn-warning" 
                onclick="mostrarReenvioVobo('${solicitud.folio}', '${solicitud.motivoRechazoVobo || ''}')">
            <i class="fas fa-redo-alt me-1"></i> Reenviar VoBo
        </button>
    ` : '';

    tr.innerHTML = `
        <td>${solicitud.folio}</td>
        <td>${nombresTipos[solicitud.tipo] || solicitud.tipo}</td>
        <td>
    ${solicitud.fechaCreacion
            ? new Date(solicitud.fechaCreacion).toLocaleDateString('es-MX', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            })
            : '-'
        }
</td>
        <td>${solicitud.asunto}</td>
        <td>${dependenciasMap[solicitud.dependencia] || 'Desconocida'}</td>
        <td>${solicitud.solicitante?.nombre || solicitud.contacto || 'N/A'}</td>
        <td>${solicitud.solicitante?.telefono || solicitud.telefono || 'N/A'}</td>

        <td><span class="status-badge" style="background:${estado.color}">${estado.texto}</span></td>
        <td>${solicitud.estado === 'atendida' ? 'Atendida' : solicitud.estado === 'verificacion' ? 'En Verificación' : solicitud.estado === 'pendiente_vobo' ? 'Esperando VoBo' : solicitud.estado === 'rechazado_vobo' ? 'VoBo Rechazado' : calcularTiempoRestante(solicitud.fechaLimite)}</td>
        <td>
            <div class="d-flex gap-2 flex-wrap">
${solicitud.documentoInicial ? `
    <button class="btn btn-sm btn-documento" 
            onclick="mostrarDocumentoInicial('${solicitud.folio}', '${solicitud.nombreDocumento}', '${solicitud.documentoInicial}')">
        <i class="fas fa-file-alt me-1"></i>Documento Inicial
    </button>
` : ''}

${solicitud.estado === 'pendiente_vobo' && obtenerFiltroEspecial().esSecretariaGeneral ? `
    <button class="btn btn-sm btn-success" 
            onclick="aprobarVobo('${solicitud.folio}')">
        <i class="fas fa-check me-1"></i> Dar VoBo
    </button>
` : ''}

${botonReenvio}

${userRol === 3 && !deshabilitarBotones ? `
    <button class="btn btn-sm btn-proceso" 
            onclick="mostrarConfirmacionProceso('${solicitud.folio}')">
        <i class="fas fa-sync-alt"></i> ${solicitud.estado === 'en_proceso' ? 'En Proceso' : 'Marcar Proceso'}
    </button>
` : ''}
                
                <button class="btn btn-sm btn-verificacion" 
                    ${deshabilitarBotones ? 'disabled' : ''}
                    onclick="${!deshabilitarBotones ? `mostrarConfirmacionAtendida('${solicitud.folio}')` : ''}">
                    <i class="fas fa-check-circle"></i> ${solicitud.estado === 'verificacion' ? 'En Verificación' : 'Mandar a Verificación'}
                </button>

                ${solicitud.motivoRechazo ? `
                <button class="btn btn-sm btn-info" 
                        onclick="mostrarMotivo('${solicitud.motivoRechazo}', '${solicitud._usuarioRechazo || 'Sistema'}', '${solicitud.fechaRechazo || 'Fecha no disponible'}')"
                        data-bs-toggle="tooltip" 
                        title="Ver detalles de rechazo">
                    <i class="fa-solid fa-message"></i>
                </button>
                ` : ''}

                ${solicitud.justificacionProceso ? `
                <button class="btn btn-sm btn-proceso"
                            onclick="mostrarJustificacion('${solicitud.folio}', '${solicitud.justificacionProceso}')">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                ` : ''}
            </div>
        </td>
    `;

    tr.querySelectorAll('button[disabled]').forEach(btn => {
        btn.style.opacity = '0.6';
        btn.style.cursor = 'not-allowed';
    });

    return tr;
}

async function obtenerNombreDependencia(dependenciaKey) {
    const dependenciaRef = ref(database, `dependencias/${dependenciaKey}`);
    const snapshot = await get(dependenciaRef);
    return snapshot.val()?.nombre || 'Desconocida';
}

// Actualización automática de estados
let actualizacionEnCurso = false;
const DIAS_ADVERTENCIA = 1;

async function actualizarEstadosAutomaticos() {
    if (actualizacionEnCurso) return;
    actualizacionEnCurso = true;

    try {
        const ahora = ajustarHoraMexico(new Date());
        const updates = {};
        const paths = ['solicitudes', 'acuerdos', 'oficios'];

        const allDocs = await Promise.all(paths.map(async (path) => {
            const snapshot = await get(query(ref(database, path)));
            return snapshot.val() || {};
        }));

        paths.forEach((path, index) => {
            const docs = allDocs[index];
            Object.entries(docs).forEach(([key, doc]) => {
                if (!['pendiente', 'por_vencer'].includes(doc.estado)) return;

                const fechaLimite = ajustarHoraMexico(new Date(doc.fechaLimite));
                const diasRestantes = calcularDiasHabilesRestantes(ahora, fechaLimite);

                let nuevoEstado = doc.estado;

                if (diasRestantes === 0) {
                    nuevoEstado = 'atrasada';
                } else if (diasRestantes <= DIAS_ADVERTENCIA && doc.estado === 'pendiente') {
                    nuevoEstado = 'por_vencer';
                } else if (diasRestantes > DIAS_ADVERTENCIA && doc.estado === 'por_vencer') {
                    nuevoEstado = 'pendiente';
                }

                if (nuevoEstado !== doc.estado) {
                    updates[`${path}/${key}/estado`] = nuevoEstado;
                    updates[`${path}/${key}/ultimaActualizacion`] = ahora.toISOString();
                }
            });
        });

        if (Object.keys(updates).length > 0) {
            await update(ref(database), updates);

            Object.entries(updates).forEach(([path, value]) => {
                const [collection, key, field] = path.split('/');
                const index = solicitudesSeguimiento.findIndex(s =>
                    s.tipoPath === collection && s.key === key
                );
                if (index > -1 && field === 'estado') {
                    solicitudesSeguimiento[index].estado = value;
                }
            });
        }

    } catch (error) {
        console.error('Error en actualización automática:', error);
        mostrarError('Error técnico al actualizar estados');
    } finally {
        actualizacionEnCurso = false;
    }
}

function calcularDiasHabilesRestantes(fechaInicio, fechaLimite) {
    let dias = 0;
    const fechaActual = new Date(fechaInicio);

    while (fechaActual < fechaLimite) {
        fechaActual.setDate(fechaActual.getDate() + 1);
        if (fechaActual.getDay() !== 0 && fechaActual.getDay() !== 6) {
            dias++;
        }
    }

    return dias;
}

setInterval(actualizarEstadosAutomaticos, 43200000);
document.addEventListener('DOMContentLoaded', () => setTimeout(actualizarEstadosAutomaticos, 3000));

// ===================== CARGA DE SEGUIMIENTO (CORREGIDA) =====================
function cargarSeguimiento() {
    const {
        esJefaturaGabinete,
        esSecretariaParticular,
        esOficialMayor,
        esPresidentaMunicipal
    } = obtenerFiltroEspecial();
    const tabla = document.getElementById('lista-seguimiento');
    let paths = ['solicitudes', 'acuerdos', 'oficios', 'solicitudes_institucionales'];
    if (esOficialMayor) {
        // CAMBIO: Ahora incluye 'oficios' junto a 'solicitudes_institucionales'
        paths = ['solicitudes_institucionales', 'oficios'];
    } else if (esPresidentaMunicipal) {
        // Mostrar todo - no cambiar paths
    } else if (esJefaturaGabinete) {
        paths = ['acuerdos'];
    } else if (esSecretariaParticular) {
        paths = ['solicitudes', 'oficios'];
    }

    const userRol = parseInt(getCookie('rol')) || 0;
    const userDependencias = getCookie('dependencia') ?
        decodeURIComponent(getCookie('dependencia')).split(',') : [];

    // ─── DEFINICIÓN ÚNICA DEL THROTTLE ───
    const _actualizarTablaSeguimientoThrottled = rafThrottle(() => {
        solicitudesSeguimiento = filtrarPorPerfil(solicitudesSeguimiento);
        if (obtenerFiltroEspecial().esVinculacionCiudadana) {
            solicitudesSeguimiento = filtrarSoloVinculacionCiudadana(solicitudesSeguimiento);
        }
        actualizarTablaSeguimiento();
    });

    // Limpiar listeners anteriores
    paths.forEach(path => {
        const refPath = ref(database, path);
        onValue(refPath, () => { });
    });

    if (userRol === 3) {
        // Admin: cargar todas las solicitudes
        Promise.all(paths.map(path => {
            return new Promise((resolve) => {
                const q = query(ref(database, path), orderByChild('fechaCreacion'));
                onValue(q, (snapshot) => {
                    const datos = [];
                    snapshot.forEach(childSnapshot => {
                        const solicitud = childSnapshot.val();
                        solicitud.key = childSnapshot.key;
                        solicitud.motivoRechazo = solicitud.motivoRechazo || null;
                        solicitud.tipoPath = path;
                        datos.push(solicitud);
                    });
                    const datosFiltrados = filtrarPorPerfil(datos);
                    resolve(datosFiltrados);
                }, { onlyOnce: true });
            });
        })).then(results => {
            let mergedData = [].concat(...results).reduce((acc, current) => {
                if (!acc.find(item => item.key === current.key)) {
                    acc.push(current);
                }
                return acc;
            }, []);

            // ─── FILTRO PARA OFICIOS (SOLO OFICIALIA MAYOR) ───
            if (esOficialMayor) {
                mergedData = mergedData.filter(item => {
                    if (item.tipoPath === 'oficios') {
                        return item.dependencia === 'oficialia-mayor';
                    }
                    return true; // institucionales sin filtro
                });
            }
            // ──────────────────────────────────────────────────

            solicitudesSeguimiento = mergedData;
            actualizarTablaSeguimiento();
            actualizarEstadisticas(solicitudesSeguimiento);
            actualizarGraficas(solicitudesSeguimiento);
        });

        // Escuchar cambios en tiempo real (admin)
        paths.forEach(path => {
            const refPath = ref(database, path);
            onValue(refPath, (snapshot) => {
                snapshot.forEach(childSnapshot => {
                    const nuevaSolicitud = childSnapshot.val();
                    const index = solicitudesSeguimiento.findIndex(s => s.key === childSnapshot.key);
                    if (index === -1) {
                        // Si es oficio y no es para oficialia-mayor, no lo agregamos
                        if (esOficialMayor && path === 'oficios' && nuevaSolicitud.dependencia !== 'oficialia-mayor') {
                            return;
                        }
                        solicitudesSeguimiento.push({ ...nuevaSolicitud, key: childSnapshot.key, tipoPath: path });
                    } else {
                        solicitudesSeguimiento[index] = { ...nuevaSolicitud, key: childSnapshot.key, tipoPath: path };
                    }
                });
                _actualizarTablaSeguimientoThrottled();
            });
        });
    } else {
        // No admin: cargar solo las dependencias del usuario
        const allPromises = [];
        paths.forEach(path => {
            userDependencias.forEach(dependencia => {
                const q = query(
                    ref(database, path),
                    orderByChild('dependencia'),
                    equalTo(dependencia)
                );
                const promise = new Promise((resolve) => {
                    onValue(q, (snapshot) => {
                        const datos = [];
                        snapshot.forEach(childSnapshot => {
                            const solicitud = childSnapshot.val();
                            solicitud.key = childSnapshot.key;
                            solicitud.tipoPath = path;
                            solicitud.motivoRechazo = solicitud.motivoRechazo || null;
                            datos.push(solicitud);
                        });
                        const datosFiltrados = filtrarSoloVinculacionCiudadana(datos);
                        resolve(datosFiltrados);
                    }, { onlyOnce: true });
                });
                allPromises.push(promise);
            });
        });
        Promise.all(allPromises).then(results => {
            const mergedData = [].concat(...results).reduce((acc, current) => {
                if (!acc.find(item => item.key === current.key)) {
                    acc.push(current);
                }
                return acc;
            }, []);
            solicitudesSeguimiento = filtrarSolicitudesVinculacionCiudadana(mergedData);
            actualizarTablaSeguimiento();
            actualizarEstadisticas(solicitudesSeguimiento);
            actualizarGraficas(solicitudesSeguimiento);
        });

        // Escuchar cambios en tiempo real (no admin)
        paths.forEach(path => {
            userDependencias.forEach(dependencia => {
                const q = query(
                    ref(database, path),
                    orderByChild('dependencia'),
                    equalTo(dependencia)
                );
                onValue(q, (snapshot) => {
                    snapshot.forEach(childSnapshot => {
                        const nuevaSolicitud = childSnapshot.val();
                        const index = solicitudesSeguimiento.findIndex(s => s.key === childSnapshot.key);
                        if (index === -1) {
                            solicitudesSeguimiento.push({ ...nuevaSolicitud, key: childSnapshot.key, tipoPath: path });
                        } else {
                            solicitudesSeguimiento[index] = { ...nuevaSolicitud, key: childSnapshot.key, tipoPath: path };
                        }
                    });
                    solicitudesSeguimiento = filtrarSoloVinculacionCiudadana(solicitudesSeguimiento);
                    _actualizarTablaSeguimientoThrottled();
                });
            });
        });
    }
}
// ===================== FIN DE CARGA DE SEGUIMIENTO =====================

// Manejo del formulario corregido
document.getElementById('formNuevaSolicitud').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;

    const camposRequeridos = [
        'receptor', 'canal', 'nombre',
        'colonia', 'telefono', 'asunto',
        'secretaria', 'documentoInicial'
    ];

    let validado = true;
    camposRequeridos.forEach(id => {
        const campo = document.getElementById(id);
        if (!campo || !campo.value.trim()) {
            validado = false;
            mostrarError(`El campo ${campo.labels[0].textContent} es requerido`);
        }
    });

    const telefono = document.getElementById('telefono');
    if (!/^\d{10}$/.test(telefono.value)) {
        validado = false;
        mostrarError("El teléfono debe tener 10 dígitos");
    }

    if (!validado) return;

    try {
        const folio = await generarFolio();

        const docInicialInput = document.getElementById('documentoInicial');
        const docInicialFile = docInicialInput.files[0];

        if (!docInicialFile) {
            mostrarError("Debes subir un documento inicial");
            return;
        }

        const extension = docInicialFile.name.split('.').pop().toLowerCase();
        if (!ALLOWED_INITIAL_EXTENSIONS.includes(extension)) {
            mostrarError(`Formato no permitido: .${extension}`);
            return;
        }

        if (docInicialFile.size > MAX_INITIAL_FILE_SIZE_BYTES) {
            mostrarError(`El archivo excede el tamaño máximo de ${MAX_INITIAL_FILE_SIZE_MB}MB`);
            return;
        }

        const submitBtn = e.target.querySelector('[type="submit"]') || e.submitter;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Guardando…'; }

        const storagePath = `${folio}/Documento Inicial/${docInicialFile.name}`;
        const docRef = storageRef(storage, storagePath);
        await uploadBytes(docRef, docInicialFile);
        const docUrl = await getDownloadURL(docRef);

        const { esVinculacionCiudadana } = obtenerFiltroEspecial();
        const userEmail = obtenerEmailUsuario();

        const estadoInicial = (esVinculacionCiudadana || userEmail === CORREO_VINCULACION_CIUDADANA)
            ? 'pendiente_vobo'
            : 'pendiente';

        const fechaCreacion = new Date().toISOString();
        const nuevaSolicitud = {
            fechaCreacion: fechaCreacion,
            tipo: document.getElementById('canal').value,
            tiposolicitud: document.getElementById('receptor').value,
            dependencia: document.getElementById('secretaria').value,
            estado: estadoInicial,
            solicitante: {
                nombre: document.getElementById('nombre').value,
                colonia: document.getElementById('colonia').value,
                telefono: document.getElementById('telefono').value
            },
            asunto: document.getElementById('asunto').value,
            comentarios: document.getElementById('comentarios').value,
            fechaLimite: calcularFechaLimite(fechaCreacion),
            documentoInicial: docUrl,
            nombreDocumento: docInicialFile.name,
            folio: folio,
            requiereVobo: (esVinculacionCiudadana || userEmail === CORREO_VINCULACION_CIUDADANA),
            voboAprobado: false,
            voboSecretariaGeneral: null,
            fechaSolicitudVobo: (esVinculacionCiudadana || userEmail === CORREO_VINCULACION_CIUDADANA) ? new Date().toISOString() : null,
            creadoPor: userEmail,
            _creadoPor: userEmail,
            usuarioCreacion: userEmail,
            _usuarioCreacion: userEmail,
            creadoPorEmail: userEmail,
            creadoPorNombre: obtenerNombreUsuario()
        };

        Object.keys(nuevaSolicitud).forEach(key => {
            if (nuevaSolicitud[key] === undefined) {
                nuevaSolicitud[key] = null;
            }
        });

        await set(ref(database, `solicitudes/${folio}`), nuevaSolicitud);

        suppressFileInputEvents = true;
        form.reset();
        document.getElementById('fecha').value = obtenerFechaHoy();
        docInicialInput.value = '';

        document.getElementById('docInicialInfo').textContent =
            'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
        document.getElementById('removeDocInicial').classList.add('d-none');
        suppressFileInputEvents = false;

        if (estadoInicial === 'pendiente_vobo') {
            mostrarExito("Solicitud creada exitosamente! Esperando VoBo de Secretaría General.");
        } else {
            mostrarExito("Solicitud creada exitosamente!");
        }

    } catch (error) {
        console.error("Error al guardar:", error);
        mostrarError(`Error al crear la solicitud: ${error.message}`);
    } finally {
        const submitBtn = e.target.querySelector('[type="submit"]') || e.submitter;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Guardar Solicitud'; }
    }
});

// Colores para gráficas
const coloresEstatus = {
    pendiente: '#491F42',
    vencer: '#720F36',
    en_progreso: '#ae9074',
    atendida: '#2E7D32',
    atrasado: '#a90000',
    verificacion: '#FFA500'
};

const coloresSecundarios = {
    texto: '#37474F',
    fondo: '#FFFFFF',
    linea: '#B0BEC5',
    destacado: '#D32F2F'
};

// Gráficas
let myChart = null;

function obtenerTiposSolicitud(solicitudes) {
    const tiposUnicos = new Set();
    solicitudes.forEach(solicitud => {
        if (solicitud.tipo) tiposUnicos.add(solicitud.tipo);
    });
    return Array.from(tiposUnicos);
}

function actualizarGrafica(solicitudes) {
    const tiposSolicitud = obtenerTiposSolicitud(solicitudes);

    const datos = {
        pendiente: new Array(tiposSolicitud.length).fill(0),
        pendiente_vobo: new Array(tiposSolicitud.length).fill(0),
        por_vencer: new Array(tiposSolicitud.length).fill(0),
        en_proceso: new Array(tiposSolicitud.length).fill(0),
        atrasada: new Array(tiposSolicitud.length).fill(0),
        atendida: new Array(tiposSolicitud.length).fill(0),
        verificacion: new Array(tiposSolicitud.length).fill(0)
    };

    solicitudes.forEach(solicitud => {
        const index = tiposSolicitud.indexOf(solicitud.tipo);
        if (index === -1) return;

        if (datos.hasOwnProperty(solicitud.estado)) {
            datos[solicitud.estado][index]++;
        }
    });

    const ctx = document.getElementById('mainChart').getContext('2d');

    if (charts.mainChart) {
        charts.mainChart.destroy();
    }

    charts.mainChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: tiposSolicitud,
            datasets: [
                {
                    label: 'Pendientes',
                    data: datos.pendiente,
                    backgroundColor: coloresEstatus.pendiente,
                    borderColor: coloresSecundarios.linea,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                },
                {
                    label: 'Pendientes VoBo',
                    data: datos.pendiente_vobo,
                    backgroundColor: coloresEstatus.pendiente_vobo,
                    borderColor: coloresSecundarios.linea,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                },
                {
                    label: 'Por Vencer',
                    data: datos.por_vencer,
                    backgroundColor: coloresEstatus.por_vencer,
                    borderColor: coloresSecundarios.linea,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                },
                {
                    label: 'En Proceso',
                    data: datos.en_proceso,
                    backgroundColor: coloresEstatus.en_proceso,
                    borderColor: coloresSecundarios.linea,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                },
                {
                    label: 'Atrasadas',
                    data: datos.atrasada,
                    backgroundColor: coloresEstatus.atrasada,
                    borderColor: coloresSecundarios.linea,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                },
                {
                    label: 'Atendidas',
                    data: datos.atendida,
                    backgroundColor: coloresEstatus.atendida,
                    borderColor: coloresSecundarios.linea,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                },
                {
                    label: 'En Verificación',
                    data: datos.verificacion,
                    backgroundColor: coloresEstatus.verificacion,
                    borderColor: coloresSecundarios.linea,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 20,
                    right: 15,
                    bottom: 25,
                    left: 15
                }
            },
            scales: {
                x: {
                    stacked: false,
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: coloresSecundarios.texto,
                        font: {
                            family: 'Poppins, sans-serif',
                            size: 12
                        },
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: coloresSecundarios.linea,
                        borderDash: [4]
                    },
                    ticks: {
                        color: coloresSecundarios.texto,
                        font: {
                            family: 'Poppins, sans-serif',
                            size: 12
                        },
                        precision: 0,
                        padding: 10
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: coloresSecundarios.texto,
                        font: {
                            family: 'Poppins, sans-serif',
                            size: 13,
                            weight: '500'
                        },
                        boxWidth: 20,
                        padding: 15
                    }
                },
                title: {
                    display: true,
                    text: 'Distribución de Solicitudes por Tipo y Estatus',
                    color: coloresSecundarios.texto,
                    font: {
                        family: 'Poppins, sans-serif',
                        size: 16,
                        weight: '600'
                    },
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                tooltip: {
                    backgroundColor: coloresSecundarios.fondo,
                    titleColor: coloresEstatus.pendiente,
                    bodyColor: coloresSecundarios.texto,
                    borderColor: coloresSecundarios.linea,
                    borderWidth: 1,
                    boxPadding: 10,
                    titleFont: {
                        family: 'Poppins, sans-serif',
                        weight: '600'
                    },
                    bodyFont: {
                        family: 'Poppins, sans-serif'
                    }
                }
            },
            animation: {
                duration: 400,
                easing: 'easeOutQuart'
            }
        }
    });
}

// Event listeners para filtros
document.getElementById('busqueda-seguimiento').addEventListener('input', debounce(() => {
    currentPageSeguimiento = 1;
    aplicarFiltrosSeguimiento();
}, 300));

document.getElementById('filtro-estado-seguimiento').addEventListener('change', () => {
    currentPageSeguimiento = 1;
    aplicarFiltrosSeguimiento();
});

document.getElementById('busqueda-validadas').addEventListener('input', debounce(() => {
    currentPageValidadas = 1;
    aplicarFiltrosValidadas();
}, 300));

document.getElementById('filtro-secretaria-validadas').addEventListener('change', () => {
    currentPageValidadas = 1;
    aplicarFiltrosValidadas();
});

document.getElementById('filtro-canal-validadas').addEventListener('change', () => {
    currentPageValidadas = 1;
    aplicarFiltrosValidadas();
});

document.getElementById('confirmarAtendidaModal').addEventListener('hidden.bs.modal', () => {
    const fileInput = document.getElementById('evidenciaFile');
    fileInput.value = '';
    fileInput.dispatchEvent(new Event('change'));
});

document.getElementById('busqueda-vobo')?.addEventListener('input', debounce(() => {
    currentPageVobo = 1;
    aplicarFiltrosVobo();
}, 300));

document.getElementById('filtro-secretaria-vobo')?.addEventListener('change', () => {
    currentPageVobo = 1;
    aplicarFiltrosVobo();
});

document.getElementById('filtro-fecha-vobo')?.addEventListener('change', () => {
    currentPageVobo = 1;
    aplicarFiltrosVobo();
});

// Sistema de navegación y UI
document.addEventListener('DOMContentLoaded', async function () {
    if (!checkSession()) {
        return;
    }
    showUserInfo();
    setupLogout();

    await cargarDependencias();

    cargarSecretarias();
    cargarSeguimiento();
    cargarValidadas();
    cargarVerificacion();

    const userEmail = getCookie('email');
    const role = parseInt(getCookie('rol')) || 0;
    let userDependencias = getCookie('dependencia') ?
        decodeURIComponent(getCookie('dependencia')).split(',') : [];

    const { esVinculacionCiudadana } = obtenerFiltroEspecial();

    if (esVinculacionCiudadana) {
        userDependencias = [DEPENDENCIA_SECRETARIA_GENERAL];
    }

    const dashboardLi = document.querySelector('a[data-content="dashboard"]').parentElement;
    const nuevaLi = document.querySelector('a[data-content="nueva"]').parentElement;
    const seguimientoLi = document.querySelector('a[data-content="seguimiento"]').parentElement;
    const validadasLi = document.querySelector('a[data-content="validadas"]').parentElement;
    const verificacionLi = document.querySelector('a[data-content="verificacion"]').parentElement;
    const navacuerdos = document.querySelector('a[data-content="acuerdo"]').parentElement;
    const navoficios = document.querySelector('a[data-content="oficio"]').parentElement;
    const navInstitucional = document.getElementById('navInstitucional');
    const navCorrespondencia = document.getElementById('navCorrespondencia');
    const navVobo = document.getElementById('navVobo');

    if (esVinculacionCiudadana) {
        dashboardLi.style.display = 'block';
        nuevaLi.style.display = 'block';
        seguimientoLi.style.display = 'block';
        validadasLi.style.display = 'block';
        verificacionLi.style.display = 'block';

        navacuerdos.style.display = 'none';
        navoficios.style.display = 'none';
        if (navInstitucional) navInstitucional.style.display = 'none';
        if (navCorrespondencia) navCorrespondencia.style.display = 'none';
        if (navVobo) navVobo.style.display = 'none';

        setTimeout(() => {
            document.querySelector('a[data-content="dashboard"]').click();
        }, 100);
    } else {
        dashboardLi.style.display = 'block';

        switch (role) {
            case 1:
                nuevaLi.style.display = userDependencias.length > 0 ? 'block' : 'none';
                seguimientoLi.style.display = 'block';
                validadasLi.style.display = 'none';
                verificacionLi.style.display = 'none';
                navacuerdos.style.display = 'none';
                navoficios.style.display = 'none';
                if (navInstitucional) navInstitucional.style.display = 'none';
                if (navCorrespondencia) navCorrespondencia.style.display = 'none';
                break;
            case 2:
                nuevaLi.style.display = 'none';
                seguimientoLi.style.display = 'block';
                validadasLi.style.display = 'block';
                verificacionLi.style.display = 'none';
                navacuerdos.style.display = 'none';
                navoficios.style.display = 'none';
                if (navInstitucional) navInstitucional.style.display = 'none';
                if (navCorrespondencia) navCorrespondencia.style.display = 'none';
                break;
            case 3:
                if (userEmail === 'vinculacion.ciudadana@tizayuca.gob.mx' ||
                    userEmail === 'oficialia.mayor@tizayuca.gob.mx') {
                    navacuerdos.style.display = 'none';
                } else {
                    navacuerdos.style.display = 'block';
                }

                navoficios.style.display = 'block';
                if (navInstitucional) navInstitucional.style.display = 'block';
                if (navCorrespondencia) navCorrespondencia.style.display = 'block';
                break;
            default:
                nuevaLi.style.display = 'none';
                seguimientoLi.style.display = 'none';
                validadasLi.style.display = 'none';
                navacuerdos.style.display = 'none';
                navoficios.style.display = 'none';
                if (navInstitucional) navInstitucional.style.display = 'none';
                if (navCorrespondencia) navCorrespondencia.style.display = 'none';
        }
    }

    const savedTab = localStorage.getItem('activeTab');
    const allowedTabs = ['dashboard'];

    switch (role) {
        case 1:
            allowedTabs.push('nueva');
            break;
        case 2:
            allowedTabs.push('seguimiento', 'validadas');
            break;
        case 3:
            allowedTabs.push('nueva', 'seguimiento', 'validadas', 'correspondencia');
            break;
    }

    if (esVinculacionCiudadana) {
        allowedTabs.push('nueva', 'seguimiento', 'validadas', 'verificacion');
    }

    if (savedTab && !allowedTabs.includes(savedTab)) {
        switchTab('dashboard');
        document.querySelector('.nav-link.active').classList.remove('active');
        document.querySelector('.nav-link[data-content="dashboard"]').classList.add('active');
    }

    document.getElementById('fecha').value = obtenerFechaHoy();

    const canalSelect = document.getElementById('canal');
    canalSelect.innerHTML = `
        <option value="">Seleccionar...</option>
        <option>Oficina de Presidencia</option>
        <option>Audiencias ciudadanas</option>
        <option>Audiencias comunitarias</option>
        <option>Audiencias virtuales</option>
        <option>Recorridos</option>
        <option>Redes sociales</option>
        <option>Llamada telefónica</option>
        <option>Vinculación Ciudadana</option>
        <option>Eventos Públicos</option>
    `;

    if (userEmail === CORREO_SECRETARIA_GENERAL) {
        if (navVobo) {
            navVobo.style.display = 'block';
            cargarSolicitudesVobo();
        }

        const statsVoboElement = document.getElementById('stats-pendientes-vobo');
        if (statsVoboElement) {
            const statCard = statsVoboElement.closest('.stat-card');
            if (statCard) {
                statCard.style.display = 'block';
            }
        }
    } else {
        if (navVobo) {
            navVobo.style.display = 'none';
        }

        const statsVoboElement = document.getElementById('stats-pendientes-vobo');
        if (statsVoboElement) {
            const statCard = statsVoboElement.closest('.stat-card');
            if (statCard) {
                statCard.style.display = 'none';
            }
        }
    }

    const sidebar = document.querySelector('.sidebar');
    const menuToggle = document.querySelector('.menu-toggle');

    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 &&
            !sidebar.contains(e.target) &&
            !menuToggle.contains(e.target)) {
            sidebar.classList.remove('active');
        }
    });

    function switchTab(contentId) {
        contentSections.forEach(section => {
            section.style.display = 'none';
        });

        const activeSection = document.getElementById(`${contentId}-content`);
        if (activeSection) {
            activeSection.style.display = 'block';

            const { esVinculacionCiudadana } = obtenerFiltroEspecial();
            if (esVinculacionCiudadana) {
                if (contentId === 'seguimiento') {
                    aplicarFiltrosSeguimiento();
                } else if (contentId === 'validadas') {
                    aplicarFiltrosValidadas();
                } else if (contentId === 'verificacion') {
                    aplicarFiltrosVerificacion();
                } else if (contentId === 'vobo') {
                    aplicarFiltrosVobo();
                }
            }
        }
    }

    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const contentId = this.getAttribute('data-content');
            if (contentId === 'vobo') {
                aplicarFiltrosVobo();
            }
            if (contentId === 'correspondencia') {
                cargarCorrespondenciaPrueba();
            }

            navLinks.forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            switchTab(contentId);
        });
    });

    document.getElementById('confirmarAprobar')?.addEventListener('click', async () => {
        if (folioActual) {
            await cambiarEstado(folioActual, 'atendida');
            bootstrap.Modal.getInstance(document.querySelector('#confirmarAprobarModal')).hide();
        }
    });

    document.getElementById('confirmarRechazar')?.addEventListener('click', async () => {
        if (folioActual) {
            await cambiarEstado(folioActual, 'pendiente');
            bootstrap.Modal.getInstance(document.querySelector('#confirmarRechazarModal')).hide();
        }
    });
});

// Función mejorada para obtener cookies
function getCookie(name) {
    try {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            const cookieValue = parts.pop().split(';').shift();
            return cookieValue ? decodeURIComponent(cookieValue) : '';
        }
        return '';
    } catch (error) {
        console.error('Error leyendo cookie:', error);
        return '';
    }
}

function showUserInfo() {
    const nombre = decodeURIComponent(getCookie('nombre') || 'Usuario');
    document.getElementById('nombreUsuario').textContent = nombre;
}

function setupLogout() {
    const logoutButton = document.getElementById('logoutButton');
    const confirmLogout = document.getElementById('confirmLogout');
    const logoutModal = new bootstrap.Modal('#logoutModal');

    logoutButton.addEventListener('click', (e) => {
        e.preventDefault();
        logoutModal.show();
    });

    confirmLogout.addEventListener('click', () => {
        if (sessionRenewalInterval) {
            clearInterval(sessionRenewalInterval);
            sessionRenewalInterval = null;
        }
        if (activityMonitorInterval) {
            clearInterval(activityMonitorInterval);
            activityMonitorInterval = null;
        }

        const cookies = document.cookie.split(";");
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i];
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax";
        }

        localStorage.clear();
        sessionStorage.clear();

        logoutModal.hide();
        window.location.href = 'index.html';
    });
}

let folioActual = '';

window.mostrarConfirmacionProceso = function (folio) {
    folioActual = folio;
    new bootstrap.Modal('#confirmarProcesoModal').show();
};

window.mostrarConfirmacionAtendida = function (folio) {
    folioActual = folio;
    new bootstrap.Modal('#confirmarAtendidaModal').show();
};

window.confirmarCambioEstado = function (nuevoEstado) {
    cambiarEstado(folioActual, nuevoEstado);

    ['#confirmarProcesoModal', '#confirmarAtendidaModal'].forEach(modalId => {
        const modal = bootstrap.Modal.getInstance(document.querySelector(modalId));
        if (modal) modal.hide();
    });
};

// Configurar formulario Acuerdo
document.getElementById('formNuevoAcuerdo').addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        const docInput = document.getElementById('documentoAcuerdo');
        const docFile = docInput.files[0];

        const camposRequeridos = [
            'asuntoAcuerdo',
            'descripcionAcuerdo',
            'secretariaAcuerdo'
        ];

        let valido = true;
        camposRequeridos.forEach(id => {
            const campo = document.getElementById(id);
            if (!campo || !campo.value.trim()) {
                valido = false;
                campo.classList.add('is-invalid');
                mostrarError(`El campo ${campo.labels[0]?.textContent || 'requerido'} es obligatorio`);
            }
        });

        if (!docFile) {
            mostrarError("Debes subir un documento para el Acuerdo");
            valido = false;
        } else {
            const extension = docFile.name.split('.').pop().toLowerCase();
            if (!ALLOWED_INITIAL_EXTENSIONS.includes(extension)) {
                mostrarError(`Formato no permitido para Acuerdo: .${extension}`);
                valido = false;
            }

            if (docFile.size > MAX_INITIAL_FILE_SIZE_BYTES) {
                mostrarError(`El archivo excede el tamaño máximo de ${MAX_INITIAL_FILE_SIZE_MB}MB para Acuerdos`);
                valido = false;
            }
        }

        if (!valido) return;

        const folio = await generarFolio('acuerdo');

        const submitBtn = e.target.querySelector('[type="submit"]') || e.submitter;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Guardando…'; }

        const storagePath = `${folio}/Documento Acuerdo/${docFile.name}`;
        const docRef = storageRef(storage, storagePath);
        await uploadBytes(docRef, docFile);
        const docUrl = await getDownloadURL(docRef);

        const userEmail = obtenerEmailUsuario();

        const nuevoAcuerdo = {
            tipo: 'acuerdo',
            fechaCreacion: new Date().toISOString(),
            asunto: document.getElementById('asuntoAcuerdo').value,
            descripcion: document.getElementById('descripcionAcuerdo').value,
            fechaLimite: document.getElementById('fechaLimiteAcuerdo').value || calcularFechaLimite(new Date().toISOString()),
            dependencia: document.getElementById('secretariaAcuerdo').value,
            comentarios: document.getElementById('comentariosAcuerdo').value || '',
            documentoInicial: docUrl,
            nombreDocumento: docFile.name,
            estado: 'pendiente',
            folio: folio,
            creadoPor: userEmail,
            _creadoPor: userEmail,
            usuarioCreacion: userEmail,
            _usuarioCreacion: userEmail,
            creadoPorEmail: userEmail,
            creadoPorNombre: obtenerNombreUsuario()
        };

        Object.keys(nuevoAcuerdo).forEach(key => {
            if (nuevoAcuerdo[key] === undefined) {
                nuevoAcuerdo[key] = null;
            }
        });

        await set(ref(database, `acuerdos/${folio}`), nuevoAcuerdo);

        limpiarFormulario('acuerdo');
        mostrarExito("Acuerdo creado exitosamente!");

    } catch (error) {
        mostrarError(`Error al crear el Acuerdo: ${error.message}`);
        console.error("Detalle del error:", error);
    } finally {
        const submitBtn = e.target.querySelector('[type="submit"]') || e.submitter;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Guardar Acuerdo'; }
    }
});

// Configurar formulario Oficio
document.getElementById('formNuevoOficio').addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        const folio = await generarFolio('oficio');
        const docFile = document.getElementById('documentoOficio').files[0];

        if (!validarDocumento(docFile, true)) return;

        const submitBtn = e.target.querySelector('[type="submit"]') || e.submitter;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Guardando…'; }

        const storagePath = `${folio}/Documento Inicial Oficio/${docFile.name}`;
        const docRef = storageRef(storage, storagePath);
        await uploadBytes(docRef, docFile);
        const docUrl = await getDownloadURL(docRef);

        const userEmail = obtenerEmailUsuario();

        const nuevoOficio = {
            tipo: 'oficio',
            fechaCreacion: new Date().toISOString(),
            asunto: document.getElementById('asuntoOficio').value,
            descripcion: document.getElementById('descripcionOficio').value,
            fechaLimite: document.getElementById('fechaLimiteOficio').value,
            dependencia: document.getElementById('secretariaOficio').value,
            comentarios: document.getElementById('comentariosOficio').value,
            documentoInicial: docUrl,
            nombreDocumento: docFile.name,
            estado: 'pendiente',
            folio: folio,
            solicitante: {
                nombre: document.getElementById('peticionarioOficio').value,
                telefono: document.getElementById('telefonoOficio').value
            },
            creadoPor: userEmail,
            _creadoPor: userEmail,
            usuarioCreacion: userEmail,
            _usuarioCreacion: userEmail,
            creadoPorEmail: userEmail,
            creadoPorNombre: obtenerNombreUsuario()
        };

        Object.keys(nuevoOficio).forEach(key => {
            if (nuevoOficio[key] === undefined) {
                nuevoOficio[key] = null;
            }
        });

        await set(ref(database, `oficios/${folio}`), nuevoOficio);
        limpiarFormulario('oficio');
        mostrarExito("Oficio creado exitosamente!");

    } catch (error) {
        mostrarError(`Error al crear oficio: ${error.message}`);
    } finally {
        const submitBtn = e.target.querySelector('[type="submit"]') || e.submitter;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Guardar Oficio'; }
    }
});

// Funciones auxiliares
function validarCampos(campos) {
    let valido = true;
    campos.forEach(id => {
        const campo = document.getElementById(id);
        if (!campo || !campo.value.trim()) {
            valido = false;
            campo.classList.add('is-invalid');
        }
    });
    return valido;
}

function validarDocumento(file, tipoDocumento) {
    const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'zip', 'rar'];
    const MAX_SIZE_MB = 10;

    if (!file) {
        mostrarError(`Debes subir un documento para ${tipoDocumento}`);
        return false;
    }

    const extension = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXT.includes(extension)) {
        mostrarError(`Formato no permitido para ${tipoDocumento}: .${extension}`);
        return false;
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        mostrarError(`El archivo excede el tamaño máximo de ${MAX_SIZE_MB}MB`);
        return false;
    }

    return true;
}

function limpiarFormulario(tipo) {
    const prefix = tipo.charAt(0).toUpperCase() + tipo.slice(1);
    const form = document.getElementById(`formNuevo${prefix}`);

    form.reset();

    const fileInput = document.getElementById(`documento${prefix}`);
    const fileInfo = document.getElementById(`doc${prefix}Info`);
    const removeBtn = document.getElementById(`removeDoc${prefix}`);

    fileInput.value = '';
    fileInfo.textContent = 'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
    removeBtn.classList.add('d-none');

    document.getElementById(`fecha${prefix}`).value = obtenerFechaHoy();

    if (tipo === 'oficio') {
        document.getElementById('peticionarioOficio').value = '';
        document.getElementById('telefonoOficio').value = '';
    }
}

['Acuerdo', 'Oficio'].forEach(tipo => {
    const docInput = document.getElementById(`documento${tipo}`);
    const removeBtn = document.getElementById(`removeDoc${tipo}`);
    const docInfo = document.getElementById(`doc${tipo}Info`);

    docInput.addEventListener('change', function (e) {
        if (this.files.length > 0) {
            const file = this.files[0];
            docInfo.innerHTML = `
                <span class="text-success">
                    <i class="fas fa-file me-2"></i>${file.name}
                </span>
                <br><small>${(file.size / 1024 / 1024).toFixed(2)} MB</small>`;
            removeBtn.classList.remove('d-none');
        } else {
            docInfo.textContent = 'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
            removeBtn.classList.add('d-none');
        }
    });

    removeBtn.addEventListener('click', () => {
        docInput.value = '';
        docInput.dispatchEvent(new Event('change'));
    });
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fechaAcuerdo').value = obtenerFechaHoy();
    document.getElementById('fechaOficio').value = obtenerFechaHoy();

    const userEmail = getCookie('email');
    const role = parseInt(getCookie('rol'));

    if (role === 3) {
        if (userEmail === 'vinculacion.ciudadana@tizayuca.gob.mx' ||
            userEmail === 'oficialia.mayor@tizayuca.gob.mx') {
            document.getElementById('navAcuerdo').style.display = 'none';
        } else {
            document.getElementById('navAcuerdo').style.display = 'block';
        }

        document.getElementById('navOficio').style.display = 'block';
        document.getElementById('navInstitucional').style.display = 'block';
    } else {
        document.getElementById('navAcuerdo').style.display = 'none';
        document.getElementById('navOficio').style.display = 'none';
        document.getElementById('navInstitucional').style.display = 'none';
    }
});

function validarFormulario(tipo) {
    const prefix = tipo.charAt(0).toUpperCase() + tipo.slice(1);
    const camposRequeridos = {
        'acuerdo': ['asuntoAcuerdo', 'descripcionAcuerdo', 'secretariaAcuerdo', 'documentoAcuerdo'],
        'oficio': ['asuntoOficio', 'descripcionOficio', 'secretariaOficio', 'documentoOficio']
    };

    let valido = true;
    camposRequeridos[tipo].forEach(id => {
        const campo = document.getElementById(id);
        if (!campo || !campo.value.trim()) {
            valido = false;
            campo.classList.add('is-invalid');
            mostrarError(`El campo ${campo.previousElementSibling?.innerText || 'requerido'} es obligatorio`);
        }
    });

    const fileInput = document.getElementById(`documento${prefix}`);
    const file = fileInput.files[0];

    if (!file) {
        mostrarError(`Debe adjuntar un documento para ${prefix}`);
        valido = false;
    } else {
        const extension = file.name.split('.').pop().toLowerCase();
        const allowedExtensions = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'zip', 'rar'];

        if (!allowedExtensions.includes(extension)) {
            mostrarError(`Formato no permitido para ${prefix}: .${extension}`);
            valido = false;
        }

        if (file.size > 10 * 1024 * 1024) {
            mostrarError(`El archivo excede el tamaño máximo de 10MB para ${prefix}`);
            valido = false;
        }
    }

    return valido;
}

document.getElementById('documentoAcuerdo').addEventListener('change', function (e) {
    validarArchivoInput(this, 'Acuerdo');
});

document.getElementById('documentoOficio').addEventListener('change', function (e) {
    validarArchivoInput(this, 'Oficio');
});

function validarArchivoInput(input, tipoDocumento) {
    const file = input.files[0];
    const fileInfo = input.parentElement.querySelector('.file-info');
    const removeBtn = input.parentElement.querySelector('.remove-file');

    input.classList.remove('is-invalid');
    fileInfo.classList.remove('text-danger');

    if (!file) {
        fileInfo.textContent = `Formatos permitidos: ${ALLOWED_INITIAL_EXTENSIONS.join(', ')} (Máx. ${MAX_INITIAL_FILE_SIZE_MB}MB)`;
        removeBtn?.classList.add('d-none');
        return;
    }

    const extension = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_INITIAL_EXTENSIONS.includes(extension)) {
        input.value = '';
        fileInfo.textContent = `Formato .${extension} no permitido para ${tipoDocumento}`;
        fileInfo.classList.add('text-danger');
        mostrarError(`Formato no permitido para ${tipoDocumento}: .${extension}`);
        return;
    }

    if (file.size > MAX_INITIAL_FILE_SIZE_BYTES) {
        input.value = '';
        fileInfo.textContent = `El archivo excede ${MAX_INITIAL_FILE_SIZE_MB}MB`;
        fileInfo.classList.add('text-danger');
        mostrarError(`El archivo es demasiado grande para ${tipoDocumento} (Máx. ${MAX_INITIAL_FILE_SIZE_MB}MB)`);
        return;
    }

    fileInfo.innerHTML = `
        <span class="text-success">
            <i class="fas fa-file me-2"></i>${file.name}
            <br><small>${(file.size / 1024 / 1024).toFixed(2)} MB</small>
        </span>
    `;
    removeBtn?.classList.remove('d-none');
}

// Variables globales para las gráficas
let mainChart, typeChart, trendChart, statusChart;

function actualizarGraficas(solicitudes) {
    requestAnimationFrame(() => {
        let solicitudesFiltradas = filtrarPorPerfil(solicitudes);

        actualizarGraficaPrincipal(solicitudesFiltradas);
        actualizarGraficaTipos(solicitudesFiltradas);
        actualizarGraficaTendencias(solicitudesFiltradas);
        actualizarGraficaEstatus(solicitudesFiltradas);
        actualizarEficienciaDepartamentos(solicitudesFiltradas);
        actualizarTiemposRespuesta(solicitudesFiltradas);
        actualizarGraficaTrimestral(solicitudesFiltradas);
        actualizarGraficaCanales(solicitudesFiltradas);
    });
}

function actualizarGraficaPrincipal(solicitudes) {
    const { esVinculacionCiudadana } = obtenerFiltroEspecial();
    let solicitudesFiltradas = solicitudes;

    if (esVinculacionCiudadana) {
        solicitudesFiltradas = filtrarSoloVinculacionCiudadana(solicitudes);
    }
    const tiposSolicitud = obtenerTiposSolicitud(solicitudes);

    const datos = {
        pendiente: new Array(tiposSolicitud.length).fill(0),
        pendiente_vobo: new Array(tiposSolicitud.length).fill(0),
        por_vencer: new Array(tiposSolicitud.length).fill(0),
        en_proceso: new Array(tiposSolicitud.length).fill(0),
        atrasada: new Array(tiposSolicitud.length).fill(0),
        atendida: new Array(tiposSolicitud.length).fill(0),
        verificacion: new Array(tiposSolicitud.length).fill(0)
    };

    solicitudes.forEach(solicitud => {
        const index = tiposSolicitud.indexOf(solicitud.tipo);
        if (index === -1) return;

        if (datos.hasOwnProperty(solicitud.estado)) {
            datos[solicitud.estado][index]++;
        }
    });

    const ctx = document.getElementById('mainChart').getContext('2d');

    if (charts.mainChart) {
        charts.mainChart.destroy();
    }

    charts.mainChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: tiposSolicitud,
            datasets: [
                {
                    label: 'Pendientes',
                    data: datos.pendiente,
                    backgroundColor: coloresGraficas.primary,
                    borderColor: coloresGraficas.primary,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                },
                {
                    label: 'Pendientes VoBo',
                    data: datos.pendiente_vobo,
                    backgroundColor: coloresGraficas.pendiente_vobo,
                    borderColor: coloresGraficas.pendiente_vobo,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                },
                {
                    label: 'Por Vencer',
                    data: datos.por_vencer,
                    backgroundColor: coloresGraficas.secondary,
                    borderColor: coloresGraficas.secondary,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                },
                {
                    label: 'En Proceso',
                    data: datos.en_proceso,
                    backgroundColor: coloresGraficas.info,
                    borderColor: coloresGraficas.info,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                },
                {
                    label: 'No Atendidas',
                    data: datos.atrasada,
                    backgroundColor: coloresGraficas.danger,
                    borderColor: coloresGraficas.danger,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                },
                {
                    label: 'Atendidas',
                    data: datos.atendida,
                    backgroundColor: coloresGraficas.success,
                    borderColor: coloresGraficas.success,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                },
                {
                    label: 'En Verificación',
                    data: datos.verificacion,
                    backgroundColor: coloresGraficas.warning,
                    borderColor: coloresGraficas.warning,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 35
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 20,
                    right: 15,
                    bottom: 25,
                    left: 15
                }
            },
            scales: {
                x: {
                    stacked: false,
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: coloresSecundarios.texto,
                        font: {
                            family: 'Poppins, sans-serif',
                            size: 12
                        },
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: coloresSecundarios.linea,
                        borderDash: [4]
                    },
                    ticks: {
                        color: coloresSecundarios.texto,
                        font: {
                            family: 'Poppins, sans-serif',
                            size: 12
                        },
                        precision: 0,
                        padding: 10
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: coloresSecundarios.texto,
                        font: {
                            family: 'Poppins, sans-serif',
                            size: 13,
                            weight: '500'
                        },
                        boxWidth: 20,
                        padding: 15
                    }
                },
                title: {
                    display: true,
                    text: 'Distribución de Solicitudes por Tipo y Estatus',
                    color: coloresSecundarios.texto,
                    font: {
                        family: 'Poppins, sans-serif',
                        size: 16,
                        weight: '600'
                    },
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                tooltip: {
                    backgroundColor: coloresSecundarios.fondo,
                    titleColor: coloresGraficas.primary,
                    bodyColor: coloresSecundarios.texto,
                    borderColor: coloresSecundarios.linea,
                    borderWidth: 1,
                    boxPadding: 10,
                    titleFont: {
                        family: 'Poppins, sans-serif',
                        weight: '600'
                    },
                    bodyFont: {
                        family: 'Poppins, sans-serif'
                    }
                }
            },
            animation: {
                duration: 400,
                easing: 'easeOutQuart'
            }
        }
    });
}

function actualizarGraficaTipos(solicitudes) {
    const tipos = {
        'Solicitud': 0,
        'Acuerdo': 0,
        'Oficio': 0,
        'Institucional': 0
    };

    solicitudes.forEach(s => {
        tipos[s.tipo] = (tipos[s.tipo] || 0) + 1;
    });

    if (charts.typeChart) charts.typeChart.destroy();

    const ctx = document.getElementById('typeChart').getContext('2d');
    charts.typeChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(tipos),
            datasets: [{
                data: Object.values(tipos),
                backgroundColor: [
                    coloresGraficas.primary,
                    coloresGraficas.success,
                    coloresGraficas.info,
                    coloresGraficas.warning
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: coloresSecundarios.texto,
                        font: {
                            family: 'Poppins, sans-serif',
                            size: 12
                        }
                    }
                }
            }
        }
    });
}

function actualizarGraficaTendencias(solicitudes) {
    const meses = Array.from({ length: 12 }, (_, i) => {
        const date = new Date();
        date.setMonth(i);
        return date.toLocaleString('es-MX', { month: 'short' });
    });

    const datos = Array(12).fill(0);

    solicitudes.forEach(s => {
        const mes = new Date(s.fechaCreacion).getMonth();
        datos[mes]++;
    });

    if (charts.trendChart) charts.trendChart.destroy();

    const ctx = document.getElementById('trendChart').getContext('2d');
    charts.trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: meses,
            datasets: [{
                label: 'Solicitudes por Mes',
                data: datos,
                borderColor: coloresGraficas.primary,
                backgroundColor: 'rgba(73, 31, 66, 0.1)',
                tension: 0.3,
                fill: true,
                pointBackgroundColor: coloresGraficas.primary,
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: coloresSecundarios.texto
                    }
                }
            }
        }
    });
}

function actualizarGraficaEstatus(solicitudes) {
    const estatus = {
        'pendiente': 0,
        'pendiente_vobo': 0,
        'en_proceso': 0,
        'verificacion': 0,
        'atendida': 0,
        'atrasada': 0
    };

    solicitudes.forEach(s => estatus[s.estado]++);

    if (charts.statusChart) charts.statusChart.destroy();

    const ctx = document.getElementById('statusChart').getContext('2d');
    charts.statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(estatus).map(key => estados[key]?.texto || key),
            datasets: [{
                data: Object.values(estatus),
                backgroundColor: Object.keys(estatus).map(key => estados[key]?.color || coloresGraficas.primary),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: coloresSecundarios.texto,
                        font: {
                            family: 'Poppins, sans-serif',
                            size: 12
                        }
                    }
                }
            }
        }
    });
}

function actualizarEficienciaDepartamentos(solicitudes) {
    const departamentos = {};

    solicitudes.forEach(s => {
        const depto = dependenciasMap[s.dependencia] || 'Desconocido';
        if (!departamentos[depto]) {
            departamentos[depto] = {
                total: 0,
                atendidas: 0
            };
        }
        departamentos[depto].total++;
        if (s.estado === 'atendida') departamentos[depto].atendidas++;
    });

    const labels = Object.keys(departamentos);
    const data = labels.map(depto => {
        return (departamentos[depto].atendidas / departamentos[depto].total * 100).toFixed(1);
    });

    if (charts.departmentChart) charts.departmentChart.destroy();

    const ctx = document.getElementById('departmentChart').getContext('2d');
    charts.departmentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '% Eficiencia',
                data: data,
                backgroundColor: '#2E7D32',
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: value => `${value}%`
                    }
                }
            }
        }
    });
}

function actualizarTiemposRespuesta(solicitudes) {
    const tiempos = {
        '1-3 días': 0,
        '4-7 días': 0,
        '8-15 días': 0,
        '+15 días': 0
    };

    solicitudes.filter(s => s.estado === 'atendida').forEach(s => {
        const inicio = new Date(s.fechaCreacion);
        const fin = new Date(s.fechaAtencion);
        const diff = Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24));

        if (diff <= 3) tiempos['1-3 días']++;
        else if (diff <= 7) tiempos['4-7 días']++;
        else if (diff <= 15) tiempos['8-15 días']++;
        else tiempos['+15 días']++;
    });

    if (charts.efficiencyChart) charts.efficiencyChart.destroy();

    const ctx = document.getElementById('efficiencyChart').getContext('2d');
    charts.efficiencyChart = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: Object.keys(tiempos),
            datasets: [{
                data: Object.values(tiempos),
                backgroundColor: [
                    '#2E7D32',
                    '#491F42',
                    '#FFA500',
                    '#a90000'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

window.exportAllCharts = async () => {
    try {
        const zip = new JSZip();
        const folder = zip.folder("graficas_sisges");
        const date = new Date().toISOString().slice(0, 10);

        await Promise.all(Object.keys(charts).map(async (chartId) => {
            if (chartId === 'quarterlyChart' && !charts[chartId]) {
                actualizarGraficaTrimestral(solicitudesSeguimiento);
            }

            if (chartId === 'channelChart' && !charts[chartId]) {
                actualizarGraficaCanales(solicitudesSeguimiento);
            }

            const chart = charts[chartId];
            if (!chart) return;

            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = chart.canvas.width;
            tempCanvas.height = chart.canvas.height;
            tempCtx.drawImage(chart.canvas, 0, 0);

            const blob = await new Promise(resolve =>
                tempCanvas.toBlob(resolve, 'image/png', 1)
            );

            folder.file(`${chartId}_${date}.png`, blob);
        }));

        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `graficas_sisges_${date}.zip`);

    } catch (error) {
        mostrarError(`Error al exportar gráficas: ${error.message}`);
    }
};

window.exportChart = (chartId, fileName = 'chart') => {
    const chart = charts[chartId];
    if (!chart) return;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    const scale = 2;
    tempCanvas.width = chart.canvas.width * scale;
    tempCanvas.height = chart.canvas.height * scale;
    tempCtx.scale(scale, scale);
    tempCtx.drawImage(chart.canvas, 0, 0);

    const url = tempCanvas.toDataURL('image/png', 1);
    const link = document.createElement('a');
    link.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = url;
    link.click();
};

function obtenerFiltroEspecial() {
    const userEmail = obtenerEmailUsuario();
    return {
        esJefaturaGabinete: userEmail === 'jefaturadegabinete@tizayuca.gob.mx',
        esSecretariaParticular: userEmail === 'oficinadepresidencia@tizayuca.gob.mx',
        esVinculacionCiudadana: userEmail === CORREO_VINCULACION_CIUDADANA,
        esOficialMayor: userEmail === 'oficialia.mayor@tizayuca.gob.mx',
        esPresidentaMunicipal: userEmail === 'pdta.gretchen@tizayuca.gob.mx',
        esSecretariaGeneral: userEmail === CORREO_SECRETARIA_GENERAL,
        mostrarAcuerdosAtendidos: true
    };
}

document.getElementById('confirmarRechazar').addEventListener('click', async () => {
    const motivoInput = document.getElementById('motivoRechazo');
    const motivo = motivoInput.value.trim();

    if (!motivo || motivo.length > 500) {
        mostrarError(motivo ? "¡El motivo no puede exceder 500 caracteres!" : "¡Debe ingresar un motivo de rechazo!");
        motivoInput.classList.add('is-invalid');
        return;
    }

    try {
        await cambiarEstado(folioActual, 'pendiente', motivo);
        motivoInput.value = '';
        bootstrap.Modal.getInstance('#confirmarRechazarModal').hide();
    } catch (error) {
        console.error('Error en rechazo:', error);
        mostrarError("Error al procesar el rechazo");
    }
});

document.getElementById('confirmarRechazarModal').addEventListener('hidden.bs.modal', () => {
    document.getElementById('motivoRechazo').value = '';
});

window.mostrarMotivo = function (motivo, usuario, fecha) {
    const motivoContenido = document.getElementById('textoMotivo');

    if (!motivoContenido) {
        console.error('Elemento textoMotivo no encontrado');
        return;
    }

    const contenidoHTML = `
        <div class="mb-3">
        </div>
        <div class="alert alert-warning mb-0">
            ${motivo || 'No se especificó un motivo de rechazo'}
        </div>
    `;

    motivoContenido.innerHTML = contenidoHTML;
    new bootstrap.Modal(document.getElementById('motivoModal')).show();
};

window.mostrarJustificacion = function (folio, justificacion) {
    document.getElementById('textoJustificacion').textContent =
        justificacion || 'No se ha proporcionado una justificación.';

    new bootstrap.Modal('#justificacionModal').show();
};

window.confirmarCambioEstado = function (nuevoEstado) {
    const justificacion = document.getElementById('justificacionProceso').value.trim();

    if (!justificacion || justificacion.length < 20) {
        document.getElementById('justificacionProceso').classList.add('is-invalid');
        return;
    }

    cambiarEstado(folioActual, nuevoEstado, '', justificacion);

    bootstrap.Modal.getInstance('#confirmarProcesoModal').hide();
};

document.getElementById('formNuevaInstitucional').addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        const camposRequeridos = [
            'asuntoInstitucional',
            'institucionInstitucional',
            'contactoInstitucional',
            'telefonoInstitucional',
            'emailInstitucional',
            'descripcionInstitucional',
            'fechaLimiteInstitucional',
            'secretariaInstitucional',
            'documentoInstitucional'
        ];

        let validado = true;
        camposRequeridos.forEach(id => {
            const campo = document.getElementById(id);
            if (!campo || !campo.value.trim()) {
                validado = false;
                mostrarError(`El campo ${campo.previousElementSibling?.textContent || 'requerido'} es obligatorio`);
                campo.classList.add('is-invalid');
            }
        });

        const telefono = document.getElementById('telefonoInstitucional');
        if (!/^\d{10}$/.test(telefono.value)) {
            validado = false;
            mostrarError("El teléfono debe tener 10 dígitos");
            telefono.classList.add('is-invalid');
        }

        const email = document.getElementById('emailInstitucional');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.value)) {
            validado = false;
            mostrarError("Formato de email inválido");
            email.classList.add('is-invalid');
        }

        if (!validado) return;

        const docInput = document.getElementById('documentoInstitucional');
        const docFile = docInput.files[0];

        if (!docFile) {
            mostrarError("Debes subir un documento inicial");
            return;
        }

        const extension = docFile.name.split('.').pop().toLowerCase();
        const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'zip', 'rar'];
        if (!allowedExtensions.includes(extension)) {
            mostrarError(`Formato no permitido: .${extension}`);
            return;
        }

        const MAX_SIZE = 10 * 1024 * 1024;
        if (docFile.size > MAX_SIZE) {
            mostrarError(`El archivo excede el tamaño máximo de 10MB`);
            return;
        }

        const folio = await generarFolio('institucional');

        const storagePath = `${folio}/Documento Institucional/${docFile.name}`;
        const docRef = storageRef(storage, storagePath);
        await uploadBytes(docRef, docFile);
        const docUrl = await getDownloadURL(docRef);

        const userEmail = obtenerEmailUsuario();

        const nuevaSolicitud = {
            tipo: 'institucional',
            fechaCreacion: new Date().toISOString(),
            asunto: document.getElementById('asuntoInstitucional').value,
            institucion: document.getElementById('institucionInstitucional').value,
            contacto: document.getElementById('contactoInstitucional').value,
            telefono: document.getElementById('telefonoInstitucional').value,
            email: document.getElementById('emailInstitucional').value,
            descripcion: document.getElementById('descripcionInstitucional').value,
            fechaLimite: document.getElementById('fechaLimiteInstitucional').value,
            dependencia: document.getElementById('secretariaInstitucional').value,
            documentoInicial: docUrl,
            nombreDocumento: docFile.name,
            estado: 'pendiente',
            folio: folio,
            solicitante: {
                nombre: document.getElementById('contactoInstitucional').value,
                telefono: document.getElementById('telefonoInstitucional').value
            },
            creadoPor: userEmail,
            _creadoPor: userEmail,
            usuarioCreacion: userEmail,
            _usuarioCreacion: userEmail,
            creadoPorEmail: userEmail,
            creadoPorNombre: obtenerNombreUsuario()
        };

        Object.keys(nuevaSolicitud).forEach(key => {
            if (nuevaSolicitud[key] === undefined) {
                nuevaSolicitud[key] = null;
            }
        });

        await set(ref(database, `solicitudes_institucionales/${folio}`), nuevaSolicitud);

        document.getElementById('formNuevaInstitucional').reset();
        document.getElementById('fechaInstitucional').value = obtenerFechaHoy();
        docInput.value = '';
        document.getElementById('docInstitucionalInfo').textContent =
            'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
        document.getElementById('removeDocInstitucional').classList.add('d-none');

        mostrarExito("Solicitud institucional creada exitosamente!");

    } catch (error) {
        console.error("Error al crear solicitud institucional:", error);
        mostrarError(`Error al crear solicitud institucional: ${error.message}`);
    }
});

document.getElementById('removeDocInstitucional').addEventListener('click', () => {
    const fileInput = document.getElementById('documentoInstitucional');
    fileInput.value = '';
    fileInput.dispatchEvent(new Event('change'));
});

document.getElementById('documentoInstitucional').addEventListener('change', function (e) {
    const fileInfo = document.getElementById('docInstitucionalInfo');
    const removeBtn = document.getElementById('removeDocInstitucional');

    if (this.files.length > 0) {
        const file = this.files[0];
        fileInfo.innerHTML = `
            <span class="text-success">
                <i class="fas fa-file me-2"></i>${file.name}
            </span>
            <br><small>${(file.size / 1024 / 1024).toFixed(2)} MB</small>`;
        removeBtn.classList.remove('d-none');
    } else {
        fileInfo.textContent = 'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
        removeBtn.classList.add('d-none');
    }
});

document.getElementById('fechaInstitucional').value = obtenerFechaHoy();

function obtenerTrimestre(fecha) {
    const mes = new Date(fecha).getMonth();
    return Math.floor(mes / 3) + 1;
}

function obtenerPeriodo(fecha) {
    const año = new Date(fecha).getFullYear();
    const trimestre = obtenerTrimestre(fecha);
    return `${año}-T${trimestre}`;
}

function procesarDatosTrimestrales(solicitudes) {
    const datosTrimestrales = {};
    const años = new Set();

    solicitudes.filter(s => s.estado === 'atendida').forEach(solicitud => {
        if (!solicitud.fechaAtencion) return;

        const periodo = obtenerPeriodo(solicitud.fechaAtencion);
        const año = periodo.split('-')[0];
        años.add(año);

        if (!datosTrimestrales[periodo]) {
            datosTrimestrales[periodo] = {
                total: 0,
                porTipo: {}
            };
        }

        datosTrimestrales[periodo].total++;

        const tipo = solicitud.tipoPath === 'solicitudes' ? 'Solicitud' :
            solicitud.tipoPath === 'acuerdos' ? 'Acuerdo' :
                solicitud.tipoPath === 'oficios' ? 'Oficio' :
                    solicitud.tipoPath === 'solicitudes_institucionales' ? 'Institucional' : 'Otro';

        if (!datosTrimestrales[periodo].porTipo[tipo]) {
            datosTrimestrales[periodo].porTipo[tipo] = 0;
        }
        datosTrimestrales[periodo].porTipo[tipo]++;
    });

    return { datosTrimestrales, años: Array.from(años).sort() };
}

function actualizarGraficaTrimestral(solicitudes) {
    const { datosTrimestrales, años } = procesarDatosTrimestrales(solicitudes);

    const periodos = Object.keys(datosTrimestrales).sort();

    const tiposUnicos = new Set();
    periodos.forEach(periodo => {
        Object.keys(datosTrimestrales[periodo].porTipo).forEach(tipo => {
            tiposUnicos.add(tipo);
        });
    });
    const tipos = Array.from(tiposUnicos);

    const datasets = tipos.map(tipo => {
        return {
            label: tipo,
            data: periodos.map(periodo => datosTrimestrales[periodo].porTipo[tipo] || 0),
            backgroundColor: obtenerColorParaTipo(tipo),
            borderColor: obtenerColorParaTipo(tipo),
            borderWidth: 1
        };
    });

    datasets.push({
        label: 'Total',
        data: periodos.map(periodo => datosTrimestrales[periodo].total),
        type: 'line',
        fill: false,
        borderColor: '#491F42',
        borderWidth: 3,
        pointRadius: 5,
        pointHoverRadius: 7
    });

    const ctx = document.getElementById('quarterlyChart').getContext('2d');

    if (charts.quarterlyChart) {
        charts.quarterlyChart.destroy();
    }

    charts.quarterlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: periodos.map(p => {
                const [año, trimestre] = p.split('-');
                return `T${trimestre} ${año}`;
            }),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    },
                    title: {
                        display: true,
                        text: 'Cantidad de Solicitudes'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        afterBody: function (context) {
                            const periodo = periodos[context[0].dataIndex];
                            const total = datosTrimestrales[periodo].total;
                            return `Total: ${total}`;
                        }
                    }
                }
            }
        }
    });
}

function obtenerColorParaTipo(tipo) {
    const colores = {
        'Solicitud': '#491F42',
        'Acuerdo': '#2E7D32',
        'Oficio': '#ae9074',
        'Institucional': '#FFA500',
        'Otro': '#a90000'
    };

    return colores[tipo] || '#666666';
}

function actualizarGraficaCanales(solicitudes) {
    const estados = [
        { id: 'atendida', label: 'Atendidas', color: '#2E7D32' },
        { id: 'pendiente', label: 'Pendientes', color: '#491F42' },
        { id: 'en_proceso', label: 'En Proceso', color: '#ae9074' },
        { id: 'por_vencer', label: 'Por Vencer', color: '#720F36' },
        { id: 'atrasada', label: 'No Atendidas', color: '#a90000' },
        { id: 'verificacion', label: 'En Verificación', color: '#FFA500' }
    ];

    const canalesSet = new Set();
    solicitudes.forEach(s => {
        const canal = s.tipo || s.canal || 'Sin especificar';
        canalesSet.add(canal);
    });

    const canales = Array.from(canalesSet);

    const datasets = estados.map(estado => {
        const data = canales.map(canal => {
            return solicitudes.filter(s => {
                const sCanal = s.tipo || s.canal || 'Sin especificar';
                return sCanal === canal && s.estado === estado.id;
            }).length;
        });

        return {
            label: estado.label,
            data: data,
            backgroundColor: estado.color,
            borderWidth: 0
        };
    });

    const totalesPorCanal = canales.map(canal => {
        return solicitudes.filter(s => {
            const sCanal = s.tipo || s.canal || 'Sin especificar';
            return sCanal === canal;
        }).length;
    });

    const deficitPorCanal = canales.map(canal => {
        const atendidas = solicitudes.filter(s => {
            const sCanal = s.tipo || s.canal || 'Sin especificar';
            return sCanal === canal && s.estado === 'atendida';
        }).length;

        const total = solicitudes.filter(s => {
            const sCanal = s.tipo || s.canal || 'Sin especificar';
            return sCanal === canal;
        }).length;

        return total - atendidas;
    });

    if (charts.channelChart) charts.channelChart.destroy();

    const ctx = document.getElementById('channelChart').getContext('2d');
    charts.channelChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: canales,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    },
                    title: {
                        display: true,
                        text: 'Cantidad de Solicitudes'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Solicitudes por Canal y Estado',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const datasetLabel = context.dataset.label || '';
                            const value = context.raw;
                            const total = totalesPorCanal[context.dataIndex];
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${datasetLabel}: ${value} (${percentage}%)`;
                        },
                        afterBody: function (context) {
                            const index = context[0].dataIndex;
                            const canal = canales[index];
                            const total = totalesPorCanal[index];
                            const deficit = deficitPorCanal[index];

                            return [
                                `Total ${canal}: ${total}`,
                                `Déficit (no atendidas): ${deficit}`
                            ];
                        }
                    }
                }
            }
        }
    });

    const chartHeader = document.querySelector('#channelChart').closest('.chart-card').querySelector('.chart-header h5');
    if (chartHeader) {
        chartHeader.textContent = 'Solicitudes por Canal y Estado';
    }
}

function cargarSolicitudesVobo() {
    const userEmail = getCookie('email');

    if (userEmail !== CORREO_SECRETARIA_GENERAL) {
        return;
    }

    solicitudesVobo = [];

    const q = query(
        ref(database, 'solicitudes'),
        orderByChild('estado'),
        equalTo('pendiente_vobo')
    );

    onValue(q, (snapshot) => {
        solicitudesVobo = [];
        snapshot.forEach(childSnapshot => {
            const solicitud = childSnapshot.val();
            if (solicitud.estado === 'pendiente_vobo') {
                solicitud.key = childSnapshot.key;
                solicitud.tipoPath = 'solicitudes';
                solicitudesVobo.push(solicitud);
            }
        });

        solicitudesVobo.sort((a, b) => new Date(b.fechaSolicitudVobo || b.fechaCreacion) - new Date(a.fechaSolicitudVobo || a.fechaCreacion));

        const voboSection = document.getElementById('vobo-content');
        if (voboSection && voboSection.style.display !== 'none') {
            aplicarFiltrosVobo();
        }

        actualizarEstadisticasVobo(solicitudesVobo);
        actualizarEstadisticas(solicitudesSeguimiento);
    });
}

function mostrarPaginaVobo(data) {
    const tabla = document.getElementById('lista-vobo');

    if (!tabla) {
        console.warn('Tabla de VoBo no encontrada');
        return;
    }

    const start = (currentPageVobo - 1) * itemsPerPage;
    const end = start + itemsPerPage;

    tabla.innerHTML = '';

    if (data.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="9" class="text-center py-4">
                <i class="fas fa-info-circle me-2"></i>
                No hay solicitudes pendientes de VoBo
            </td>
        `;
        tabla.appendChild(tr);
        actualizarPaginacionVobo(0);
        return;
    }

    const items = data.slice(start, end);

    const frag = document.createDocumentFragment();
    items.forEach(solicitud => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                ${solicitud.folio}
            </td>
            <td>
                ${new Date(solicitud.fechaSolicitudVobo || solicitud.fechaCreacion).toLocaleDateString()}
            </td>
            <td>
                <strong>${solicitud.asunto}</strong>
            </td>
            <td>
                <strong>${solicitud.solicitante?.nombre || 'N/A'}</strong>
            </td>
            <td>
                ${solicitud.solicitante?.telefono || 'N/A'}
            </td>
            <td>
                ${solicitud.solicitante?.colonia || 'N/A'}
            </td>
            <td>
                <span class="secretaria-badge">${dependenciasMap[solicitud.dependencia] || 'Desconocida'}</span>
            </td>
            <td>
                ${solicitud.documentoInicial ? `
                <button class="btn btn-sm btn-documento-inicial" 
                        onclick="mostrarDocumentoInicial('${solicitud.folio}', '${solicitud.nombreDocumento}', '${solicitud.documentoInicial}')">
                    <i class="fas fa-file-pdf me-1"></i> Ver
                </button>
                ` : '<span class="text-muted small">Sin documento</span>'}
            </td>
            <td>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-success" 
                            onclick="aprobarVobo('${solicitud.folio}')"
                            data-bs-toggle="tooltip"
                            title="Aprobar VoBo y turnar a secretaría">
                        <i class="fas fa-check"></i> Aprobar
                    </button>
                    <button class="btn btn-sm btn-danger" 
                            onclick="rechazarVobo('${solicitud.folio}')"
                            data-bs-toggle="tooltip"
                            title="Rechazar VoBo y devolver">
                        <i class="fas fa-times"></i> Rechazar
                    </button>
                </div>
            </td>
        `;
        frag.appendChild(tr);
    });
    tabla.appendChild(frag);

    actualizarPaginacionVobo(data.length);
}

function actualizarEstadisticasVobo(solicitudes) {
    const statsPendientesVobo = document.getElementById('stats-pendientes-vobo');
    const statsAprobadasHoy = document.getElementById('stats-aprobadas-hoy');
    const statsRechazadasHoy = document.getElementById('stats-rechazadas-hoy');

    if (!statsPendientesVobo && !statsAprobadasHoy && !statsRechazadasHoy) {
        return;
    }

    const hoy = new Date().toDateString();
    const aprobadasHoy = solicitudes.filter(s =>
        s.fechaVoboAprobado && new Date(s.fechaVoboAprobado).toDateString() === hoy
    ).length;

    const rechazadasHoy = solicitudes.filter(s =>
        s.fechaVoboRechazado && new Date(s.fechaVoboRechazado).toDateString() === hoy
    ).length;

    if (statsPendientesVobo) {
        statsPendientesVobo.textContent = solicitudes.length;
    }
    if (statsAprobadasHoy) {
        statsAprobadasHoy.textContent = aprobadasHoy;
    }
    if (statsRechazadasHoy) {
        statsRechazadasHoy.textContent = rechazadasHoy;
    }
}

function aplicarFiltrosVobo() {
    const busquedaInput = document.getElementById('busqueda-vobo');
    const secretariaSelect = document.getElementById('filtro-secretaria-vobo');
    const fechaSelect = document.getElementById('filtro-fecha-vobo');

    if (!busquedaInput || !secretariaSelect) {
        console.warn('Elementos de filtro VoBo no encontrados');
        return;
    }

    const busqueda = busquedaInput.value.toLowerCase();
    const secretaria = secretariaSelect.value;
    const fecha = fechaSelect ? fechaSelect.value : '';

    const hoy = new Date();
    const filtradas = solicitudesVobo.filter(s => {
        const texto = `${s.folio} ${s.asunto} ${s.solicitante?.nombre || ''} ${s.solicitante?.colonia || ''}`.toLowerCase();
        const coincideSecretaria = !secretaria || s.dependencia === secretaria;

        let coincideFecha = true;
        if (fecha && fechaSelect) {
            const fechaSolicitud = new Date(s.fechaSolicitudVobo || s.fechaCreacion);
            switch (fecha) {
                case 'hoy':
                    coincideFecha = fechaSolicitud.toDateString() === hoy.toDateString();
                    break;
                case 'ayer':
                    const ayer = new Date(hoy);
                    ayer.setDate(ayer.getDate() - 1);
                    coincideFecha = fechaSolicitud.toDateString() === ayer.toDateString();
                    break;
                case 'semana':
                    const semanaPasada = new Date(hoy);
                    semanaPasada.setDate(semanaPasada.getDate() - 7);
                    coincideFecha = fechaSolicitud >= semanaPasada;
                    break;
                case 'mes':
                    const mesPasado = new Date(hoy);
                    mesPasado.setMonth(mesPasado.getMonth() - 1);
                    coincideFecha = fechaSolicitud >= mesPasado;
                    break;
            }
        }

        return texto.includes(busqueda) && coincideSecretaria && coincideFecha;
    });

    mostrarPaginaVobo(filtradas);
}

function actualizarPaginacionVobo(totalItems) {
    const container = document.querySelector('.paginacion-vobo');

    if (!container) {
        return;
    }

    const totalPages = Math.ceil(totalItems / itemsPerPage);
    container.innerHTML = '';

    const startItem = (currentPageVobo - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPageVobo * itemsPerPage, totalItems);

    container.innerHTML = `
        <div class="paginacion-contenedor">
            <button class="btn-pag anterior" ${currentPageVobo === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left me-1"></i> Anterior
            </button>
            <span class="info-pagina">Página ${currentPageVobo} de ${totalPages}</span>
            <button class="btn-pag siguiente" ${currentPageVobo === totalPages ? 'disabled' : ''}>
                Siguiente <i class="fas fa-chevron-right ms-1"></i>
            </button>
        </div>
    `;

    container.querySelector('.anterior')?.addEventListener('click', () => {
        currentPageVobo = Math.max(1, currentPageVobo - 1);
        aplicarFiltrosVobo();
    });

    container.querySelector('.siguiente')?.addEventListener('click', () => {
        currentPageVobo = Math.min(totalPages, currentPageVobo + 1);
        aplicarFiltrosVobo();
    });
}

window.aprobarVobo = async function (folio) {
    try {
        const { esSecretariaGeneral } = obtenerFiltroEspecial();
        if (!esSecretariaGeneral) {
            mostrarError('No tienes permisos para aprobar VoBo');
            return;
        }

        const solicitudExistente = solicitudesVobo.find(s => s.key === folio);

        if (!solicitudExistente) {
            throw new Error('Solicitud no encontrada');
        }

        const docRef = ref(database, `solicitudes/${folio}`);
        const usuarioActual = getCookie('nombre') || 'Secretaría General';
        const fechaActual = new Date().toISOString();

        await update(docRef, {
            estado: 'pendiente',
            voboAprobado: true,
            voboSecretariaGeneral: usuarioActual,
            fechaVoboAprobado: fechaActual,
            ultimaActualizacion: fechaActual,
            comentariosVobo: `VoBo aprobado por ${usuarioActual} el ${new Date().toLocaleDateString()}`
        });

        const indexVobo = solicitudesVobo.findIndex(s => s.key === folio);
        if (indexVobo !== -1) {
            solicitudesVobo.splice(indexVobo, 1);
        }

        const indexSeguimiento = solicitudesSeguimiento.findIndex(s => s.key === folio);
        if (indexSeguimiento !== -1) {
            solicitudesSeguimiento[indexSeguimiento].estado = 'pendiente';
            solicitudesSeguimiento[indexSeguimiento].voboAprobado = true;
            solicitudesSeguimiento[indexSeguimiento].voboSecretariaGeneral = usuarioActual;
            solicitudesSeguimiento[indexSeguimiento].fechaVoboAprobado = fechaActual;
        }

        aplicarFiltrosVobo();
        if (typeof actualizarTablaSeguimiento === 'function') {
            actualizarTablaSeguimiento();
        }

        actualizarEstadisticas(solicitudesSeguimiento);

        mostrarExito(`VoBo aprobado para ${folio}. La solicitud ha sido turnada a la secretaría correspondiente.`);

    } catch (error) {
        console.error("Error al aprobar VoBo:", error);
        mostrarError(`Error al aprobar VoBo: ${error.message}`);
    }
};

window.rechazarVobo = async function (folio) {
    const { esSecretariaGeneral } = obtenerFiltroEspecial();
    if (!esSecretariaGeneral) {
        mostrarError('No tienes permisos para rechazar VoBo');
        return;
    }

    const motivo = prompt('Ingrese el motivo del rechazo del VoBo:');

    if (!motivo || motivo.trim() === '') {
        mostrarError('Debe proporcionar un motivo para rechazar el VoBo.');
        return;
    }

    if (motivo.length < 10) {
        mostrarError('El motivo debe tener al menos 10 caracteres.');
        return;
    }

    try {
        const solicitudExistente = solicitudesVobo.find(s => s.key === folio);

        if (!solicitudExistente) {
            throw new Error('Solicitud no encontrada');
        }

        const docRef = ref(database, `solicitudes/${folio}`);
        const usuarioActual = getCookie('nombre') || 'Secretaría General';
        const fechaActual = new Date().toISOString();

        await update(docRef, {
            estado: 'rechazado_vobo',
            voboAprobado: false,
            voboRechazado: true,
            voboSecretariaGeneral: usuarioActual,
            fechaVoboRechazado: fechaActual,
            motivoRechazoVobo: motivo,
            ultimaActualizacion: fechaActual,
            comentariosVobo: `VoBo rechazado por ${usuarioActual} el ${new Date().toLocaleDateString()}. Motivo: ${motivo}`
        });

        const indexVobo = solicitudesVobo.findIndex(s => s.key === folio);
        if (indexVobo !== -1) {
            solicitudesVobo.splice(indexVobo, 1);
        }

        const indexSeguimiento = solicitudesSeguimiento.findIndex(s => s.key === folio);
        if (indexSeguimiento !== -1) {
            solicitudesSeguimiento[indexSeguimiento].estado = 'rechazado_vobo';
            solicitudesSeguimiento[indexSeguimiento].voboAprobado = false;
            solicitudesSeguimiento[indexSeguimiento].voboRechazado = true;
            solicitudesSeguimiento[indexSeguimiento].motivoRechazoVobo = motivo;
        }

        aplicarFiltrosVobo();
        if (typeof actualizarTablaSeguimiento === 'function') {
            actualizarTablaSeguimiento();
        }

        actualizarEstadisticas(solicitudesSeguimiento);

        mostrarExito(`VoBo rechazado para ${folio}. La solicitud ha sido devuelta a Vinculación Ciudadana.`);

    } catch (error) {
        console.error("Error al rechazar VoBo:", error);
        mostrarError(`Error al rechazar VoBo: ${error.message}`);
    }
};

window.mostrarReenvioVobo = function (folio, motivoRechazo) {
    folioReenvioVobo = folio;

    document.getElementById('motivoRechazoAnterior').textContent =
        motivoRechazo || 'No se especificó motivo de rechazo.';

    document.getElementById('nuevoDocumentoVobo').value = '';
    document.getElementById('nuevoDocVoboInfo').textContent =
        'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
    document.getElementById('removeNuevoDocVobo').classList.add('d-none');
    document.getElementById('comentariosReenvio').value = '';

    new bootstrap.Modal(document.getElementById('reenviarVoboModal')).show();
};

document.getElementById('confirmarReenvioVobo')?.addEventListener('click', async () => {
    await reenviarSolicitudVobo();
});

async function reenviarSolicitudVobo() {
    const fileInput = document.getElementById('nuevoDocumentoVobo');
    const nuevoArchivo = fileInput.files[0];
    const comentarios = document.getElementById('comentariosReenvio').value;

    try {
        let nuevoDocumentoUrl = null;
        let nuevoNombreDocumento = null;

        if (nuevoArchivo) {
            const extension = nuevoArchivo.name.split('.').pop().toLowerCase();

            if (!ALLOWED_INITIAL_EXTENSIONS.includes(extension)) {
                mostrarError(`Formato no permitido: .${extension}`);
                return;
            }

            if (nuevoArchivo.size > MAX_INITIAL_FILE_SIZE_BYTES) {
                mostrarError(`El archivo excede el tamaño máximo de ${MAX_INITIAL_FILE_SIZE_MB}MB`);
                return;
            }

            const storagePath = `${folioReenvioVobo}/Documento Inicial/${nuevoArchivo.name}`;
            const docRef = storageRef(storage, storagePath);
            await uploadBytes(docRef, nuevoArchivo);
            nuevoDocumentoUrl = await getDownloadURL(docRef);
            nuevoNombreDocumento = nuevoArchivo.name;
        }

        const actualizacion = {
            estado: 'pendiente_vobo',
            voboRechazado: false,
            motivoRechazoVobo: null,
            fechaVoboRechazado: null,
            fechaSolicitudVobo: new Date().toISOString(),
            ultimaActualizacion: new Date().toISOString(),
            comentariosReenvio: comentarios || null,
            _reenviadoPor: getCookie('nombre') || 'Vinculación Ciudadana',
            fechaReenvioVobo: new Date().toISOString()
        };

        if (nuevoDocumentoUrl) {
            actualizacion.documentoInicial = nuevoDocumentoUrl;
            actualizacion.nombreDocumento = nuevoNombreDocumento;
        }

        await update(ref(database, `solicitudes/${folioReenvioVobo}`), actualizacion);

        const index = solicitudesSeguimiento.findIndex(s => s.key === folioReenvioVobo);
        if (index !== -1) {
            solicitudesSeguimiento[index] = {
                ...solicitudesSeguimiento[index],
                ...actualizacion
            };
        }

        bootstrap.Modal.getInstance(document.getElementById('reenviarVoboModal')).hide();
        mostrarExito('Solicitud reenviada a VoBo exitosamente.');

        actualizarTablaSeguimiento();

    } catch (error) {
        console.error('Error al reenviar a VoBo:', error);
        mostrarError(`Error al reenviar a VoBo: ${error.message}`);
    }
}

document.getElementById('nuevoDocumentoVobo')?.addEventListener('change', function (e) {
    const fileInfo = document.getElementById('nuevoDocVoboInfo');
    const removeBtn = document.getElementById('removeNuevoDocVobo');

    if (this.files.length > 0) {
        const file = this.files[0];
        fileInfo.innerHTML = `
            <span class="text-success">
                <i class="fas fa-file me-2"></i>${file.name}
            </span>
            <br><small>${(file.size / 1024 / 1024).toFixed(2)} MB</small>`;
        removeBtn.classList.remove('d-none');
    } else {
        fileInfo.textContent = 'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
        removeBtn.classList.add('d-none');
    }
});

document.getElementById('removeNuevoDocVobo')?.addEventListener('click', () => {
    const fileInput = document.getElementById('nuevoDocumentoVobo');
    fileInput.value = '';
    fileInput.dispatchEvent(new Event('change'));
});

document.getElementById('reenviarVoboModal')?.addEventListener('hidden.bs.modal', () => {
    document.getElementById('nuevoDocumentoVobo').value = '';
    document.getElementById('nuevoDocVoboInfo').textContent = 'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
    document.getElementById('removeNuevoDocVobo').classList.add('d-none');
    document.getElementById('comentariosReenvio').value = '';
});

function filtrarSoloVinculacionCiudadana(solicitudes) {
    const { esVinculacionCiudadana } = obtenerFiltroEspecial();
    const userEmail = obtenerEmailUsuario();

    if (!esVinculacionCiudadana) {
        return solicitudes;
    }

    return solicitudes.filter(solicitud => {
        const camposCreador = [
            solicitud.creadoPor,
            solicitud._creadoPor,
            solicitud.usuarioCreacion,
            solicitud.creadoPorEmail,
            solicitud._usuarioCreacion
        ];

        return camposCreador.some(campo => campo === userEmail);
    });
}

function obtenerEmailUsuario() {
    const email = getCookie('email');
    if (!email || email === 'undefined' || email === 'null') {
        console.warn('Email no encontrado en cookies, usando valor por defecto');
    }
    return email;
}

function obtenerNombreUsuario() {
    const nombre = getCookie('nombre');
    if (!nombre || nombre === 'undefined' || nombre === 'null') {
        return 'Sistema';
    }
    return decodeURIComponent(nombre);
}

function filtrarSolicitudesVinculacionCiudadana(solicitudes) {
    const { esSecretariaParticular } = obtenerFiltroEspecial();
    const userEmail = obtenerEmailUsuario();

    if (esSecretariaParticular && userEmail === 'oficinadepresidencia@tizayuca.gob.mx') {
        return solicitudes.filter(solicitud => {
            if (solicitud.tipo === 'Vinculación Ciudadana') {
                return false;
            }
            if (solicitud.creadoPor === CORREO_VINCULACION_CIUDADANA ||
                solicitud._creadoPor === CORREO_VINCULACION_CIUDADANA ||
                solicitud.usuarioCreacion === CORREO_VINCULACION_CIUDADANA) {
                return false;
            }
            return true;
        });
    }
    return solicitudes;
}

function filtrarPorPerfil(solicitudes) {
    const { esVinculacionCiudadana, esSecretariaParticular } = obtenerFiltroEspecial();
    const userEmail = obtenerEmailUsuario();

    if (!esVinculacionCiudadana && !esSecretariaParticular) {
        return solicitudes;
    }

    if (esVinculacionCiudadana) {
        return solicitudes.filter(solicitud => {
            const esCanalVinculacion = solicitud.tipo === 'Vinculación Ciudadana';
            const camposCreador = [
                solicitud.creadoPor,
                solicitud._creadoPor,
                solicitud.usuarioCreacion,
                solicitud.creadoPorEmail,
                solicitud._usuarioCreacion
            ];
            const esCreadaPorVinculacion = camposCreador.some(campo => campo === userEmail);
            return esCanalVinculacion && esCreadaPorVinculacion;
        });
    }

    if (esSecretariaParticular && userEmail === 'oficinadepresidencia@tizayuca.gob.mx') {
        return solicitudes.filter(solicitud => {
            if (solicitud.tipo === 'Vinculación Ciudadana') {
                return false;
            }
            if (solicitud.creadoPor === CORREO_VINCULACION_CIUDADANA ||
                solicitud._creadoPor === CORREO_VINCULACION_CIUDADANA ||
                solicitud.usuarioCreacion === CORREO_VINCULACION_CIUDADANA) {
                return false;
            }
            return true;
        });
    }

    return solicitudes;
}

// ===================== EXPORTACIÓN A EXCEL =====================
function obtenerTipoDocumentoExcel(solicitud) {
    const tiposPorPath = {
        solicitudes: 'Solicitud Ciudadana',
        acuerdos: 'Acuerdo de Gabinete',
        oficios: 'Oficio',
        solicitudes_institucionales: 'Solicitud Institucional'
    };
    return tiposPorPath[solicitud.tipoPath] || solicitud.tipo || 'Solicitud';
}

function formatearFechaExcel(valor) {
    if (!valor) return '';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return String(valor);
    return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function limpiarValorExcel(valor) {
    if (valor === null || valor === undefined) return '';
    if (typeof valor === 'object') return JSON.stringify(valor);
    return String(valor);
}

function nombrePeticionarioExcel(solicitud) {
    return solicitud.solicitante?.nombre || solicitud.contacto || solicitud.nombre || '';
}

function telefonoPeticionarioExcel(solicitud) {
    return solicitud.solicitante?.telefono || solicitud.telefono || '';
}

function estadoTextoExcel(estado) {
    return estados[estado]?.texto || estado || '';
}

function crearArchivoExcel(datos, nombreHoja, nombreArchivo, anchosColumnas = []) {
    if (!window.XLSX) {
        if (typeof mostrarError === 'function') mostrarError('No fue posible cargar el componente de Excel. Recarga la página e inténtalo nuevamente.');
        else alert('No fue posible cargar el componente de Excel.');
        return;
    }

    if (!datos.length) {
        if (typeof mostrarError === 'function') mostrarError('No hay registros para exportar con los filtros actuales.');
        else alert('No hay registros para exportar con los filtros actuales.');
        return;
    }

    const worksheet = XLSX.utils.json_to_sheet(datos);
    worksheet['!autofilter'] = { ref: worksheet['!ref'] };
    if (anchosColumnas.length) worksheet['!cols'] = anchosColumnas.map(wch => ({ wch }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, nombreHoja.substring(0, 31));
    XLSX.writeFile(workbook, nombreArchivo);

    if (typeof mostrarExito === 'function') mostrarExito(`Excel generado correctamente (${datos.length} registros)`);
}

window.exportarSeguimientoExcel = function () {
    const filas = obtenerSeguimientoFiltrado().map(solicitud => ({
        'Folio': limpiarValorExcel(solicitud.folio || solicitud.key),
        'Canal / Tipo': limpiarValorExcel(solicitud.tipo || obtenerTipoDocumentoExcel(solicitud)),
        'Fecha de Turnado': formatearFechaExcel(solicitud.fechaCreacion),
        'Asunto': limpiarValorExcel(solicitud.asunto),
        'Secretaría': limpiarValorExcel(dependenciasMap[solicitud.dependencia] || solicitud.dependencia),
        'Nombre de Peticionario': limpiarValorExcel(nombrePeticionarioExcel(solicitud)),
        'Teléfono': limpiarValorExcel(telefonoPeticionarioExcel(solicitud)),
        'Estado': estadoTextoExcel(solicitud.estado),
        'Días Restantes / Situación': solicitud.estado === 'verificacion' ? 'En Verificación' : solicitud.estado === 'pendiente_vobo' ? 'Esperando VoBo' : solicitud.estado === 'rechazado_vobo' ? 'VoBo Rechazado' : (solicitud.fechaLimite ? calcularTiempoRestante(solicitud.fechaLimite) : ''),
        'Fecha Límite': formatearFechaExcel(solicitud.fechaLimite),
        'Documento Inicial': limpiarValorExcel(solicitud.documentoInicial),
        'Evidencia': limpiarValorExcel(solicitud.evidencias)
    }));
    crearArchivoExcel(filas, 'Seguimiento', `SISGES_Seguimiento_${new Date().toISOString().slice(0, 10)}.xlsx`, [16, 24, 18, 45, 36, 30, 16, 20, 28, 18, 45, 45]);
};

window.exportarVerificacionExcel = function () {
    const filas = obtenerVerificacionFiltrada().map(solicitud => ({
        'Folio': limpiarValorExcel(solicitud.folio || solicitud.key),
        'Asunto': limpiarValorExcel(solicitud.asunto),
        'Canal / Tipo': obtenerTipoDocumentoExcel(solicitud),
        'Secretaría': limpiarValorExcel(dependenciasMap[solicitud.dependencia] || solicitud.dependencia),
        'Nombre de Peticionario': limpiarValorExcel(nombrePeticionarioExcel(solicitud)),
        'Teléfono': limpiarValorExcel(telefonoPeticionarioExcel(solicitud)),
        'Fecha Envío a Verificación': formatearFechaExcel(solicitud.fechaVerificacion),
        'Documento Inicial': limpiarValorExcel(solicitud.documentoInicial),
        'Evidencia': limpiarValorExcel(solicitud.evidencias)
    }));
    crearArchivoExcel(filas, 'Verificacion', `SISGES_Verificacion_${new Date().toISOString().slice(0, 10)}.xlsx`, [16, 45, 24, 36, 30, 16, 25, 45, 45]);
};

window.exportarAtendidasExcel = function () {
    const filas = obtenerValidadasFiltradas().map(solicitud => ({
        'Folio': limpiarValorExcel(solicitud.key || solicitud.folio),
        'Canal': limpiarValorExcel(solicitud.tipo || obtenerTipoDocumentoExcel(solicitud)),
        'Asunto': limpiarValorExcel(solicitud.asunto),
        'Secretaría': limpiarValorExcel(dependenciasMap[solicitud.dependencia] || solicitud.dependencia),
        'Nombre de Peticionario': limpiarValorExcel(nombrePeticionarioExcel(solicitud)),
        'Teléfono': limpiarValorExcel(telefonoPeticionarioExcel(solicitud)),
        'Fecha Atención': formatearFechaExcel(solicitud.fechaAtencion),
        'Documento Inicial': limpiarValorExcel(solicitud.documentoInicial),
        'Evidencia': limpiarValorExcel(solicitud.evidencias)
    }));
    crearArchivoExcel(filas, 'Atendidas', `SISGES_Atendidas_${new Date().toISOString().slice(0, 10)}.xlsx`, [16, 24, 45, 36, 30, 16, 18, 45, 45]);
};
// ===================== FIN EXPORTACIÓN A EXCEL =====================

window.addEventListener('beforeunload', () => {
    if (sessionRenewalInterval) clearInterval(sessionRenewalInterval);
    if (activityMonitorInterval) clearInterval(activityMonitorInterval);
});


// ============================================================================
// MÓDULO DE PRUEBA · UNIDAD CENTRAL DE CORRESPONDENCIA
// Base aislada: correspondencia_prueba
// ============================================================================

function uccEscapeHtml(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function obtenerFechaHoraLocalInput() {
    const ahora = new Date();
    const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function formatearFechaHoraUCC(valor) {
    if (!valor) return 'N/A';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return valor;
    return fecha.toLocaleString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function textoEstadoUCC(estado) {
    const estadosUCC = {
        recibido: 'Recibido',
        turnado: 'Turnado',
        concluido: 'Concluido'
    };
    return estadosUCC[estado] || estado || 'Recibido';
}

function claseEstadoUCC(estado) {
    const clases = {
        recibido: 'ucc-status-recibido',
        turnado: 'ucc-status-turnado',
        concluido: 'ucc-status-concluido'
    };
    return clases[estado] || 'ucc-status-recibido';
}

function poblarDependenciasCorrespondencia() {
    const select = document.getElementById('ucc-dependencia-destino');
    if (!select) return;

    const valorActual = select.value;
    const dependencias = Object.entries(dependenciasMap)
        .filter(([, nombre]) => nombre)
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'es'));

    select.innerHTML = '<option value="">Seleccionar dependencia...</option>';

    dependencias.forEach(([clave, nombre]) => {
        const option = document.createElement('option');
        option.value = clave;
        option.textContent = nombre;
        select.appendChild(option);
    });

    if (valorActual && dependenciasMap[valorActual]) {
        select.value = valorActual;
    }
}

async function generarFolioCorrespondenciaPrueba() {
    const folioRef = ref(database, 'configuracion/ultimoFolioCorrespondenciaPrueba');
    const snapshot = await get(folioRef);
    const siguiente = (snapshot.val() || 0) + 1;
    await set(folioRef, siguiente);
    return `UCC-${siguiente.toString().padStart(5, '0')}`;
}

function cargarCorrespondenciaPrueba() {
    poblarDependenciasCorrespondencia();

    if (listenerCorrespondenciaPruebaIniciado) {
        aplicarFiltrosCorrespondenciaPrueba();
        return;
    }

    listenerCorrespondenciaPruebaIniciado = true;

    onValue(ref(database, 'correspondencia_prueba'), (snapshot) => {
        const datos = [];

        snapshot.forEach(childSnapshot => {
            datos.push({
                folio: childSnapshot.key,
                ...childSnapshot.val()
            });
        });

        correspondenciaPrueba = datos.sort((a, b) => {
            const fechaA = new Date(a.fechaRecepcion || a.fechaRegistro || 0).getTime();
            const fechaB = new Date(b.fechaRecepcion || b.fechaRegistro || 0).getTime();
            return fechaB - fechaA;
        });

        actualizarEstadisticasCorrespondenciaPrueba();
        aplicarFiltrosCorrespondenciaPrueba();
    }, (error) => {
        console.error('Error cargando correspondencia de prueba:', error);
        listenerCorrespondenciaPruebaIniciado = false;
        mostrarError('No fue posible cargar la correspondencia de prueba');
    });
}

function obtenerCorrespondenciaFiltrada() {
    const busqueda = (document.getElementById('ucc-busqueda')?.value || '').trim().toLowerCase();
    const estado = document.getElementById('ucc-filtro-estado')?.value || '';
    const prioridad = document.getElementById('ucc-filtro-prioridad')?.value || '';

    return correspondenciaPrueba.filter(item => {
        const texto = [
            item.folio,
            item.numeroDocumento,
            item.tipoDocumento,
            item.remitente,
            item.institucionOrigen,
            item.asunto,
            dependenciasMap[item.dependenciaDestino] || item.dependenciaDestino,
            item.observaciones
        ].join(' ').toLowerCase();

        const coincideBusqueda = !busqueda || texto.includes(busqueda);
        const coincideEstado = !estado || item.estado === estado;
        const coincidePrioridad = !prioridad || item.prioridad === prioridad;

        return coincideBusqueda && coincideEstado && coincidePrioridad;
    });
}

function aplicarFiltrosCorrespondenciaPrueba() {
    currentPageCorrespondencia = Math.max(1, currentPageCorrespondencia);
    mostrarPaginaCorrespondenciaPrueba(obtenerCorrespondenciaFiltrada());
}

function actualizarEstadisticasCorrespondenciaPrueba() {
    const total = correspondenciaPrueba.length;
    const recibidos = correspondenciaPrueba.filter(item => item.estado === 'recibido').length;
    const turnados = correspondenciaPrueba.filter(item => item.estado === 'turnado').length;
    const concluidos = correspondenciaPrueba.filter(item => item.estado === 'concluido').length;

    const valores = {
        'ucc-stat-total': total,
        'ucc-stat-recibidos': recibidos,
        'ucc-stat-turnados': turnados,
        'ucc-stat-concluidos': concluidos
    };

    Object.entries(valores).forEach(([id, valor]) => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = valor;
    });
}

function mostrarPaginaCorrespondenciaPrueba(data) {
    const tabla = document.getElementById('ucc-lista');
    if (!tabla) return;

    const totalPages = Math.max(1, Math.ceil(data.length / itemsPerPageCorrespondencia));
    if (currentPageCorrespondencia > totalPages) {
        currentPageCorrespondencia = totalPages;
    }

    tabla.innerHTML = '';

    if (data.length === 0) {
        tabla.innerHTML = `
            <tr class="ucc-empty-row">
                <td colspan="11" class="text-center py-5 text-muted">
                    <i class="fas fa-inbox fa-2x mb-3 d-block"></i>
                    No hay correspondencia que coincida con los filtros.
                </td>
            </tr>
        `;
        actualizarPaginacionCorrespondenciaPrueba(0);
        return;
    }

    const inicio = (currentPageCorrespondencia - 1) * itemsPerPageCorrespondencia;
    const items = data.slice(inicio, inicio + itemsPerPageCorrespondencia);
    const frag = document.createDocumentFragment();

    items.forEach(item => {
        const tr = document.createElement('tr');
        const nombreDestino = dependenciasMap[item.dependenciaDestino] || item.dependenciaDestino || 'Sin asignar';
        const origen = [item.remitente, item.institucionOrigen].filter(Boolean).join(' · ') || 'N/A';
        const prioridad = item.prioridad === 'urgente' ? 'Urgente' : 'Normal';

        let acciones = '';
        if (item.estado === 'recibido') {
            acciones = `
                <button type="button" class="btn btn-sm btn-ucc-turnar"
                    onclick="cambiarEstadoCorrespondenciaPrueba('${uccEscapeHtml(item.folio)}','turnado')">
                    <i class="fas fa-share-square me-1"></i>Turnar
                </button>
            `;
        } else if (item.estado === 'turnado') {
            acciones = `
                <button type="button" class="btn btn-sm btn-ucc-concluir"
                    onclick="cambiarEstadoCorrespondenciaPrueba('${uccEscapeHtml(item.folio)}','concluido')">
                    <i class="fas fa-check me-1"></i>Concluir
                </button>
            `;
        } else {
            acciones = '<span class="text-success small"><i class="fas fa-check-circle me-1"></i>Finalizado</span>';
        }

        const documento = item.documentoUrl
            ? `<a class="btn btn-sm btn-outline-secondary" href="${uccEscapeHtml(item.documentoUrl)}"
                    target="_blank" rel="noopener noreferrer">
                    <i class="fas fa-file-alt me-1"></i>Ver
               </a>`
            : '<span class="text-muted small">Sin archivo</span>';

        tr.innerHTML = `
            <td data-label="Folio"><strong>${uccEscapeHtml(item.folio)}</strong></td>
            <td data-label="Fecha recepción">${uccEscapeHtml(formatearFechaHoraUCC(item.fechaRecepcion))}</td>
            <td data-label="Tipo">${uccEscapeHtml(item.tipoDocumento || 'N/A')}</td>
            <td data-label="No. documento">${uccEscapeHtml(item.numeroDocumento || 'S/N')}</td>
            <td data-label="Remitente / Origen">${uccEscapeHtml(origen)}</td>
            <td data-label="Asunto" class="ucc-asunto-cell">${uccEscapeHtml(item.asunto || 'N/A')}</td>
            <td data-label="Destino">${uccEscapeHtml(nombreDestino)}</td>
            <td data-label="Prioridad">
                <span class="ucc-priority-badge ${item.prioridad === 'urgente' ? 'ucc-priority-urgente' : 'ucc-priority-normal'}">
                    ${prioridad}
                </span>
            </td>
            <td data-label="Estado">
                <span class="ucc-status-badge ${claseEstadoUCC(item.estado)}">
                    ${uccEscapeHtml(textoEstadoUCC(item.estado))}
                </span>
            </td>
            <td data-label="Documento">${documento}</td>
            <td data-label="Acciones"><div class="ucc-actions">${acciones}</div></td>
        `;
        frag.appendChild(tr);
    });

    tabla.appendChild(frag);
    actualizarPaginacionCorrespondenciaPrueba(data.length);
}

function actualizarPaginacionCorrespondenciaPrueba(totalItems) {
    const container = document.querySelector('.ucc-paginacion');
    if (!container) return;

    const totalPages = Math.ceil(totalItems / itemsPerPageCorrespondencia);
    container.innerHTML = '';

    if (totalPages <= 1) return;

    container.innerHTML = `
        <div class="paginacion-contenedor">
            <button class="btn-pag ucc-anterior" ${currentPageCorrespondencia === 1 ? 'disabled' : ''}>
                Anterior
            </button>
            <span class="info-pagina">Página ${currentPageCorrespondencia} de ${totalPages}</span>
            <button class="btn-pag ucc-siguiente" ${currentPageCorrespondencia === totalPages ? 'disabled' : ''}>
                Siguiente
            </button>
        </div>
    `;

    container.querySelector('.ucc-anterior')?.addEventListener('click', () => {
        currentPageCorrespondencia = Math.max(1, currentPageCorrespondencia - 1);
        mostrarPaginaCorrespondenciaPrueba(obtenerCorrespondenciaFiltrada());
    });

    container.querySelector('.ucc-siguiente')?.addEventListener('click', () => {
        currentPageCorrespondencia = Math.min(totalPages, currentPageCorrespondencia + 1);
        mostrarPaginaCorrespondenciaPrueba(obtenerCorrespondenciaFiltrada());
    });
}

window.cambiarEstadoCorrespondenciaPrueba = async function (folio, nuevoEstado) {
    const textos = {
        turnado: '¿Deseas marcar esta correspondencia como turnada?',
        concluido: '¿Deseas marcar esta correspondencia como concluida?'
    };

    if (!confirm(textos[nuevoEstado] || '¿Deseas actualizar el estado?')) return;

    try {
        const cambios = {
            estado: nuevoEstado,
            ultimaActualizacion: new Date().toISOString(),
            actualizadoPor: getCookie('nombre') || getCookie('email') || 'Sistema'
        };

        if (nuevoEstado === 'turnado') {
            cambios.fechaTurnado = new Date().toISOString();
        }

        if (nuevoEstado === 'concluido') {
            cambios.fechaConclusion = new Date().toISOString();
        }

        await update(ref(database, `correspondencia_prueba/${folio}`), cambios);
        mostrarExito(`Correspondencia ${textoEstadoUCC(nuevoEstado).toLowerCase()} correctamente`);
    } catch (error) {
        console.error('Error actualizando correspondencia:', error);
        mostrarError('No fue posible actualizar el estado de la correspondencia');
    }
};

window.exportarCorrespondenciaExcel = function () {
    if (typeof XLSX === 'undefined') {
        mostrarError('No se pudo cargar el componente de exportación Excel');
        return;
    }

    const datos = obtenerCorrespondenciaFiltrada();

    if (datos.length === 0) {
        Toastify({
            text: 'No hay registros para exportar con los filtros actuales',
            duration: 3000,
            className: 'toastify-info'
        }).showToast();
        return;
    }

    const filas = datos.map(item => ({
        'Folio UCC': item.folio || '',
        'Fecha recepción': formatearFechaHoraUCC(item.fechaRecepcion),
        'Tipo de documento': item.tipoDocumento || '',
        'Número de documento': item.numeroDocumento || '',
        'Remitente': item.remitente || '',
        'Institución / Origen': item.institucionOrigen || '',
        'Asunto': item.asunto || '',
        'Dependencia destino': dependenciasMap[item.dependenciaDestino] || item.dependenciaDestino || '',
        'Prioridad': item.prioridad === 'urgente' ? 'Urgente' : 'Normal',
        'Estado': textoEstadoUCC(item.estado),
        'Observaciones': item.observaciones || '',
        'Documento digital': item.documentoUrl || '',
        'Registró': item.registradoPor || '',
        'Fecha de registro': formatearFechaHoraUCC(item.fechaRegistro),
        'Fecha de turno': item.fechaTurnado ? formatearFechaHoraUCC(item.fechaTurnado) : '',
        'Fecha de conclusión': item.fechaConclusion ? formatearFechaHoraUCC(item.fechaConclusion) : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(filas);
    worksheet['!cols'] = [
        { wch: 14 }, { wch: 19 }, { wch: 20 }, { wch: 22 },
        { wch: 28 }, { wch: 30 }, { wch: 45 }, { wch: 38 },
        { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 35 },
        { wch: 28 }, { wch: 19 }, { wch: 19 }, { wch: 19 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Correspondencia');

    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `SISGES_UCC_prueba_${fecha}.xlsx`);
};

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('formCorrespondenciaPrueba');
    const modalElement = document.getElementById('modalNuevaCorrespondencia');

    const prepararFormulario = () => {
        const fecha = document.getElementById('ucc-fecha-recepcion');
        if (fecha && !fecha.value) fecha.value = obtenerFechaHoraLocalInput();
        poblarDependenciasCorrespondencia();
    };

    modalElement?.addEventListener('show.bs.modal', prepararFormulario);

    modalElement?.addEventListener('hidden.bs.modal', () => {
        form?.reset();
        const fecha = document.getElementById('ucc-fecha-recepcion');
        if (fecha) fecha.value = obtenerFechaHoraLocalInput();
        const prioridad = document.getElementById('ucc-prioridad');
        if (prioridad) prioridad.value = 'normal';
    });

    document.getElementById('ucc-busqueda')?.addEventListener('input', debounce(() => {
        currentPageCorrespondencia = 1;
        aplicarFiltrosCorrespondenciaPrueba();
    }, 250));

    document.getElementById('ucc-filtro-estado')?.addEventListener('change', () => {
        currentPageCorrespondencia = 1;
        aplicarFiltrosCorrespondenciaPrueba();
    });

    document.getElementById('ucc-filtro-prioridad')?.addEventListener('change', () => {
        currentPageCorrespondencia = 1;
        aplicarFiltrosCorrespondenciaPrueba();
    });

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();

        const btnGuardar = document.getElementById('ucc-btn-guardar');
        const archivo = document.getElementById('ucc-documento')?.files?.[0] || null;

        if (archivo && archivo.size > MAX_FILE_SIZE_BYTES) {
            mostrarError('El documento digital no puede superar los 10 MB');
            return;
        }

        if (archivo) {
            const extension = archivo.name.split('.').pop().toLowerCase();
            if (!['pdf', 'jpg', 'jpeg', 'png'].includes(extension)) {
                mostrarError('El documento digital debe ser PDF, JPG o PNG');
                return;
            }
        }

        btnGuardar?.setAttribute('disabled', 'disabled');

        try {
            const folio = await generarFolioCorrespondenciaPrueba();
            let documentoUrl = '';

            if (archivo) {
                const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const ruta = `correspondencia_prueba/${folio}/${Date.now()}_${nombreSeguro}`;
                const archivoRef = storageRef(storage, ruta);
                await uploadBytes(archivoRef, archivo);
                documentoUrl = await getDownloadURL(archivoRef);
            }

            const registro = {
                fechaRecepcion: document.getElementById('ucc-fecha-recepcion').value,
                tipoDocumento: document.getElementById('ucc-tipo-documento').value,
                numeroDocumento: document.getElementById('ucc-numero-documento').value.trim(),
                remitente: document.getElementById('ucc-remitente').value.trim(),
                institucionOrigen: document.getElementById('ucc-institucion-origen').value.trim(),
                asunto: document.getElementById('ucc-asunto').value.trim(),
                dependenciaDestino: document.getElementById('ucc-dependencia-destino').value,
                prioridad: document.getElementById('ucc-prioridad').value,
                observaciones: document.getElementById('ucc-observaciones').value.trim(),
                documentoUrl,
                estado: 'recibido',
                fechaRegistro: new Date().toISOString(),
                registradoPor: getCookie('nombre') || getCookie('email') || 'Sistema',
                correoRegistro: getCookie('email') || ''
            };

            await set(ref(database, `correspondencia_prueba/${folio}`), registro);

            const modal = bootstrap.Modal.getInstance(modalElement);
            modal?.hide();

            mostrarExito(`Correspondencia registrada con folio ${folio}`);
        } catch (error) {
            console.error('Error registrando correspondencia de prueba:', error);
            mostrarError('No fue posible registrar la correspondencia');
        } finally {
            btnGuardar?.removeAttribute('disabled');
        }
    });

    prepararFormulario();
});

// ============================================================================
// FIN MÓDULO DE PRUEBA · UNIDAD CENTRAL DE CORRESPONDENCIA
// ============================================================================

