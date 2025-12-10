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
    equalTo // ← Agregar esta importación
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

// Inicializa Firebase Storage
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
    channelChart: null  // ← Nueva gráfica de canales
};


let tipoActual = ''; // ← Agregar esta línea

let solicitudesSeguimiento = [];
let solicitudesValidadas = [];
let solicitudesVerificacion = [];
const itemsPerPage = 5;
let currentPageSeguimiento = 1;
let currentPageValidadas = 1;
let currentPageVerificacion = 1; // ← Añadir esta línea con las demás variables de paginación
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Agregar con las otras variables globales
let solicitudesVobo = [];
let currentPageVobo = 1;

let folioReenvioVobo = '';

// Agregar estas constantes al inicio
const MAX_INITIAL_FILE_SIZE_MB = 10;
const MAX_INITIAL_FILE_SIZE_BYTES = MAX_INITIAL_FILE_SIZE_MB * 1024 * 1024;
// Actualizar constantes
const ALLOWED_INITIAL_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'zip', 'rar'];
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'zip', 'rar'];

const MAX_ACUERDO_SIZE_MB = 10;
const MAX_OFICIO_SIZE_MB = 10;

const navLinks = document.querySelectorAll('.nav-link');
const contentSections = document.querySelectorAll('.content-section');

// Agregar después de las otras constantes
const CORREO_VINCULACION_CIUDADANA = 'vinculacion.ciudadana@tizayuca.gob.mx';
const CORREO_SECRETARIA_GENERAL = 'secretariamunicipal@tizayuca.gob.mx';
const DEPENDENCIA_SECRETARIA_GENERAL = 'secretaria-general-municipal'; // ← Agregar esta línea

let suppressFileInputEvents = false;

// Sistema de renovación automática de sesión
let sessionRenewalInterval = null;
const SESSION_TIMEOUT = 9 * 60 * 1000; // 9 minutos (renovar antes de que expire a los 10)
const ACTIVITY_CHECK_INTERVAL = 60000; // Revisar actividad cada minuto
let lastActivityTime = Date.now();

// Función para detectar actividad del usuario
function setupActivityDetection() {
    // Eventos que indican actividad del usuario
    const activityEvents = [
        'mousemove', 'mousedown', 'click', 'scroll',
        'keypress', 'touchstart', 'touchmove'
    ];

    activityEvents.forEach(event => {
        document.addEventListener(event, () => {
            lastActivityTime = Date.now();
            // Renovar sesión inmediatamente si hay actividad
            if (shouldRenewSession()) {
                renewSession();
            }
        }, { passive: true });
    });

    // Verificar actividad periódicamente
    sessionRenewalInterval = setInterval(() => {
        if (shouldRenewSession()) {
            renewSession();
        }
        
        // Verificar si la sesión está por expirar y hay actividad reciente
        checkSessionExpiration();
    }, ACTIVITY_CHECK_INTERVAL);
}

// Función para determinar si debe renovarse la sesión
function shouldRenewSession() {
    const timeSinceLastActivity = Date.now() - lastActivityTime;
    const sessionAge = getSessionAge();
    
    // Renovar si ha habido actividad en los últimos 2 minutos
    // y la sesión tiene más de 8 minutos (pero menos de 10)
    return timeSinceLastActivity < 120000 && sessionAge > 8 * 60 * 1000;
}

// Calcular la edad de la sesión
function getSessionAge() {
    const expiresCookie = getCookie('expires');
    if (!expiresCookie) return 0;
    
    const expirationDate = new Date(expiresCookie);
    const now = new Date();
    return expirationDate - now;
}

// Renovar la sesión
function renewSession() {
    try {
        const fechaExpiracion = new Date();
        fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 10); // Renovar por otros 10 minutos
        const expiresUTC = fechaExpiracion.toUTCString();
        
        const cookieSettings = `expires=${expiresUTC}; path=/; SameSite=Lax`;
        
        // Renovar todas las cookies importantes
        const cookiesToRenew = ['session', 'email', 'nombre', 'rol', 'dependencia', 'area', 'expires'];
        
        cookiesToRenew.forEach(cookieName => {
            const valor = getCookie(cookieName);
            if (valor) {
                document.cookie = `${cookieName}=${valor}; ${cookieSettings}`;
            }
        });
        
        // También renovar lastLogin con tiempo actual
        document.cookie = `lastLogin=${new Date().toISOString()}; ${cookieSettings}`;
        
        console.log('Sesión renovada automáticamente');
        return true;
    } catch (error) {
        console.error('Error renovando sesión:', error);
        return false;
    }
}

// Verificar expiración de sesión con actividad
function checkSessionExpiration() {
    const sessionCookie = getCookie('session');
    const expiresCookie = getCookie('expires');
    
    if (!sessionCookie || !expiresCookie) {
        // Redirigir si no hay cookies
        window.location.href = 'index.html';
        return;
    }
    
    const now = new Date();
    const expirationDate = new Date(expiresCookie);
    const timeUntilExpiration = expirationDate - now;
    
    // Si la sesión expira en menos de 2 minutos y ha habido actividad reciente
    if (timeUntilExpiration < 120000 && (Date.now() - lastActivityTime) < 30000) {
        // Renovar automáticamente
        renewSession();
    }
    
    // Si ya expiró, redirigir
    if (now > expirationDate) {
        clearInterval(sessionRenewalInterval);
        window.location.href = 'index.html';
    }
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
        // Saltar sábado (6) y domingo (0)
        if (fechaLimite.getDay() !== 0 && fechaLimite.getDate() !== 6) {
            diasAgregados++;
        }
    }

    return fechaLimite.toISOString();
}

function calcularDiasRestantes(fechaLimite) {
    const ahora = ajustarHoraMexico(new Date());
    const limite = ajustarHoraMexico(new Date(fechaLimite));

    // Si ya expiró, retornar valor negativo
    if (ahora >= limite) {
        const diffMs = ahora - limite;
        return Math.floor(diffMs / (1000 * 60 * 60 * 24)) * -1; // Días expirados como negativo
    }

    let diasRestantes = 0;
    const current = new Date(ahora);

    // Calcular días hábiles restantes
    while (current < limite) {
        current.setDate(current.getDate() + 1);
        if (current.getDay() !== 0 && current.getDay() !== 6) { // Excluir fines de semana
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

    // Restar tiempo de fines de semana
    let current = new Date(ahora);
    while (current < limite) {
        // Si es fin de semana, restar 24 horas
        if (current.getDay() === 0 || current.getDay() === 6) {
            tiempoRestante -= 86400000; // 24h en milisegundos
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
    const offsetMexico = -6 * 60; // UTC-6
    const nuevaFecha = new Date(fecha);
    nuevaFecha.setMinutes(nuevaFecha.getMinutes() + nuevaFecha.getTimezoneOffset() + offsetMexico);
    return nuevaFecha;
}

// Funciones de Firebase
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

// Función para cargar solicitudes validadas
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
        paths = ['solicitudes_institucionales'];
    }

    solicitudesValidadas = [];

    // Obtener datos de Firebase usando onValue para cada path
    paths.forEach(path => {
        let q;
        if (userRol === 3 || userRol === 4) {
            q = query(
                ref(database, path),
                orderByChild('estado'),
                equalTo('atendida')
            );
        } else {
            // Para otros roles, filtrar por dependencias
            q = query(
                ref(database, path),
                orderByChild('estado'),
                equalTo('atendida')
            );
        }

        onValue(q, (snapshot) => {
    solicitudesValidadas = solicitudesValidadas.filter(s => s.tipoPath !== path);

    snapshot.forEach(childSnapshot => {
        const doc = childSnapshot.val();
        
        // Filtrar por dependencia si no es admin ni presidenta
        if (userRol !== 3 && userRol !== 4 && !userDependencias.includes(doc.dependencia)) return;
        
        // Solo agregar atendidas
        if (doc.estado !== 'atendida') return;
        
        // Asegurar datos mínimos
        const solicitud = {
            key: childSnapshot.key,
            tipoPath: path,
            ...doc
        };
        
        // Asegurar que no esté duplicada
        if (!solicitudesValidadas.some(s => s.key === solicitud.key)) {
            solicitudesValidadas.push(solicitud);
        }
    });
    
    // Aplicar filtro para Esmeralda Merchan - NO mostrar solicitudes de Vinculación Ciudadana
    solicitudesValidadas = filtrarSolicitudesVinculacionCiudadana(solicitudesValidadas);
    
    // Ordenar por fecha de atención
    solicitudesValidadas.sort((a, b) =>
        new Date(b.fechaAtencion || b.fechaCreacion) - new Date(a.fechaAtencion || a.fechaCreacion)
    );
    
    aplicarFiltrosValidadas();
});
    });
}

// Función para mostrar página en validadas
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

    items.forEach(solicitud => {
        // Determinar tipo basado en la colección
        let tipoDocumento = 'Solicitud';
        if (solicitud.tipoPath === 'acuerdos') tipoDocumento = 'Acuerdo';
        if (solicitud.tipoPath === 'oficios') tipoDocumento = 'Oficio';
        if (solicitud.tipoPath === 'solicitudes_institucionales') tipoDocumento = 'Institucional';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${solicitud.key}</td>
            <td>${solicitud.tipo || tipoDocumento}</td> <!-- Mostrar el canal -->
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
        tabla.appendChild(tr);
    });

    actualizarPaginacion('validadas', data.length);
}

// Función genérica para actualizar paginación
function actualizarPaginacion(tipo, totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const container = document.querySelector(`.paginacion-${tipo}`);
    let currentPage = tipo === 'seguimiento' ? currentPageSeguimiento : currentPageValidadas;

    container.innerHTML = '';

    if (totalItems === 0 || totalPages === 0) {
        return;
    }

    // Asegurar que currentPage no exceda el límite
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

    // Event listeners
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

// Función para aplicar filtros a validadas
function aplicarFiltrosValidadas() {
    const busqueda = document.getElementById('busqueda-validadas').value.toLowerCase();
    const secretaria = document.getElementById('filtro-secretaria-validadas').value;
    const canal = document.getElementById('filtro-canal-validadas').value;
    const { esJefaturaGabinete, esSecretariaParticular } = obtenerFiltroEspecial();
    
    // Primero filtrar las solicitudes para Esmeralda Merchan
    let filtradas = filtrarSolicitudesVinculacionCiudadana(solicitudesValidadas);
    
    filtradas = filtradas.filter(doc => {
        const esAcuerdoAtendido = (doc.tipo === 'Acuerdo' && doc.estado === 'atendida');
        
        if (esJefaturaGabinete && !esAcuerdoAtendido && doc.tipo !== 'acuerdo')
            return false;
            
        if (esSecretariaParticular && !esAcuerdoAtendido && doc.tipo === 'acuerdo')
            return false;
            
        const texto = `${doc.key} ${doc.asunto} ${dependenciasMap[doc.dependencia]} ${doc.tipo}`.toLowerCase();
        const coincideSecretaria = !secretaria || doc.dependencia === secretaria;
        const coincideCanal = !canal || (doc.tipo || '').toLowerCase().includes(canal.toLowerCase());
        
        return texto.includes(busqueda) && coincideSecretaria && coincideCanal;
    });
    
    mostrarPaginaValidadas(filtradas);
}

function aplicarFiltrosSeguimiento() {
    const busqueda = document.getElementById('busqueda-seguimiento').value.toLowerCase();
    const estado = document.getElementById('filtro-estado-seguimiento').value;
    const { esJefaturaGabinete, esSecretariaParticular } = obtenerFiltroEspecial();
    
    // Primero filtrar las solicitudes para Esmeralda Merchan
    let filtradas = filtrarSolicitudesVinculacionCiudadana(solicitudesSeguimiento);
    
    // Luego aplicar los otros filtros
    filtradas = filtradas.filter(s => {
        if (esJefaturaGabinete && s.tipoPath !== 'acuerdos') return false;
        if (esSecretariaParticular && s.tipoPath === 'acuerdos') return false;
        // Excluir atendidas y aplicar otros filtros
        if (s.estado === 'atendida') return false;
        
        const texto = `${s.key} ${s.asunto} ${dependenciasMap[s.dependencia]}`.toLowerCase();
        const coincideEstado = !estado || s.estado === estado;
        return texto.includes(busqueda) && coincideEstado;
    });
    
    mostrarPaginaSeguimiento(filtradas);
}

// Función para mostrar página en seguimiento
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

    items.forEach(solicitud => {
        tabla.appendChild(crearFilaSolicitud(solicitud));
    });

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

    // Si es Vinculación Ciudadana, forzar solo Secretaría General
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

            // Filtrar por rol
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

window.mostrarEvidenciaModal = function (folio, tipoDocumento, urlDocumento, secretaria = '') {
    const modal = new bootstrap.Modal(document.getElementById('evidenciaModal'));
    const loading = document.getElementById('loadingPreview');
    const pdfContainer = document.getElementById('pdfContainer');
    const imagenContainer = document.getElementById('imagenContainer');
    const visorNoSoportado = document.getElementById('visorNoSoportado');
    const pdfViewer = document.getElementById('pdfViewer');

    // Resetear visores
    [loading, pdfContainer, imagenContainer, visorNoSoportado].forEach(el => el.classList.add('d-none'));
    loading.classList.remove('d-none');
    pdfViewer.src = '';

    // Extraer nombre de archivo
    let nombreArchivo = 'Sin documento';
    let extension = '';

    if (urlDocumento) {
        try {
            nombreArchivo = decodeURIComponent(urlDocumento.split('/').pop().split('?')[0]);
            extension = nombreArchivo.split('.').pop().toLowerCase();
        } catch (error) {
            console.error('Error procesando URL:', error);
        }
    }

    // Configurar metadatos
    document.getElementById('nombreArchivoCompleto').textContent = `${tipoDocumento}: ${nombreArchivo}`;
    document.getElementById('folioEvidencia').textContent = folio;
    document.getElementById('secretariaEvidencia').textContent = secretaria || 'No especificada';
    document.getElementById('fechaEvidencia').textContent = new Date().toLocaleDateString('es-MX');

    // Cargar contenido después de 300ms
    setTimeout(() => {
        loading.classList.add('d-none');

        if (!urlDocumento) {
            visorNoSoportado.classList.remove('d-none');
            document.getElementById('tipoArchivo').textContent = 'Documento no disponible';
            return;
        }

        if (['pdf'].includes(extension)) {
            pdfContainer.classList.remove('d-none');
            pdfViewer.src = `${urlDocumento}#view=FitH&toolbar=0`;
            document.getElementById('pdfMeta').textContent = `${nombreArchivo} | ${tipoDocumento}`;
        }
        else if (['jpg', 'jpeg', 'png'].includes(extension)) {
            imagenContainer.classList.remove('d-none');
            const img = document.getElementById('visorImagen');
            img.src = urlDocumento;
            img.onload = () => {
                document.getElementById('imagenDimensions').textContent =
                    `${img.naturalWidth}px × ${img.naturalHeight}px`;
            };
        }
        else {
            visorNoSoportado.classList.remove('d-none');
            document.getElementById('tipoArchivo').textContent = `.${extension}`;
            const downloadBtn = document.getElementById('descargarEvidencia');
            downloadBtn.href = urlDocumento;
            downloadBtn.download = nombreArchivo;
        }
    }, 300);

    modal.show();
};

// 1. Crear un mapa global de dependencias
let dependenciasMap = {};

// 2. Cargar dependencias al inicio
async function cargarDependencias() {
    const dependenciasRef = ref(database, 'dependencias');
    const snapshot = await get(dependenciasRef);

    // Mapeo de claves a nombres oficiales
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
}

// 1. Variable para controlar el intervalo
let intervaloActualizacionGlobal = null;

// 2. Función de actualización de tiempos (¡NUEVA!)
// Función para actualización visual de tiempos (sin afectar estados reales)
function iniciarActualizacionTiempo() {
    if (intervaloActualizacionGlobal) clearInterval(intervaloActualizacionGlobal);

    intervaloActualizacionGlobal = setInterval(() => {
        document.querySelectorAll('#lista-seguimiento tr').forEach(fila => {
            const estado = fila.dataset.estado;
            const celdaTiempo = fila.cells[7];

            // Congelar visualización para estos estados
            if (['verificacion', 'atendida'].includes(estado)) {
                celdaTiempo.textContent = estado === 'verificacion'
                    ? 'En Verificación'
                    : 'Atendida';
                return;
            }

            // Actualizar solo la visualización del tiempo
            const fechaLimite = fila.dataset.fechaLimite;
            celdaTiempo.textContent = calcularTiempoRestante(fechaLimite);
        });
    }, 60000); // Actualizar cada minuto solo el texto
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

    // Si es Secretaría General, contar pendientes de VoBo de todas las dependencias
    if (esSecretariaGeneral || userEmail === CORREO_SECRETARIA_GENERAL) {
        // Contar pendientes de VoBo específicamente
        solicitudesVobo.forEach(s => {
            if (s.estado === 'pendiente_vobo') {
                stats.pendientesVobo++;
            }
        });
    }

    // Filtrar solicitudes para Vinculación Ciudadana si es necesario
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
                // Para perfiles normales, contar como pendiente normal
                // Para Secretaría General, ya lo contamos arriba específicamente
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

    // Actualizar DOM - verificar que los elementos existan antes de actualizar
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

    // Calcular y mostrar eficiencia
    const eficienciaElement = document.getElementById('stats-eficiencia');
    if (eficienciaElement) {
        const eficiencia = (stats.atendidas / (stats.total || 1)) * 100;
        eficienciaElement.textContent = `${Math.round(eficiencia)}%`;
    }

    // Mostrar/ocultar el elemento de VoBo según el perfil
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

    // Limpiar tabla completamente
    tabla.innerHTML = '';

    // Filtrar y mostrar solo última versión de cada registro
    solicitudesSeguimiento.reverse().forEach(solicitud => {
        if (!foliosUnicos.has(solicitud.key)) {
            foliosUnicos.add(solicitud.key);
            const fila = crearFilaSolicitud(solicitud);
            tabla.appendChild(fila);
        }
    });

    iniciarActualizacionTiempo(); // ← ¡Aquí debe llamarse la función!
    aplicarFiltrosSeguimiento();
    actualizarEstadisticas(solicitudesSeguimiento);
    actualizarGrafica(solicitudesSeguimiento);
    iniciarActualizacionTiempo();
    actualizarEstadisticas(solicitudesSeguimiento);
    actualizarGraficas(solicitudesSeguimiento); // En lugar de actualizarGrafica()
    iniciarActualizacionTiempo();
}

// Modificar la función cambiarEstado para hacerla global
let accionActual = '';

window.cambiarEstado = async function (folio, nuevoEstado, motivo = '', justificacion = '') {
    try {
        // 1. Buscar en datos locales primero para optimizar
        const solicitudExistente = solicitudesSeguimiento.find(s => s.key === folio);

        if (!solicitudExistente) {
            throw new Error('Documento no encontrado en datos locales');
        }

        // 2. Determinar path CORRECTAMENTE - SOLUCIÓN PARA INSTITUCIONALES
        let path = solicitudExistente.tipoPath || 'solicitudes';

        // Si es institucional pero no tiene tipoPath, determinar por folio
        if (path === 'solicitudes' && folio.startsWith('SI-')) {
            path = 'solicitudes_institucionales';
        }

        const docRef = ref(database, `${path}/${folio}`);
        const tipoDocumento = path === 'solicitudes' ? 'Solicitud' :
            path === 'acuerdos' ? 'Acuerdo' :
                path === 'oficios' ? 'Oficio' :
                    path === 'solicitudes_institucionales' ? 'Institucional' : 'Documento';

        // 3. Obtener datos actualizados directamente de Firebase
        const snapshot = await get(docRef);
        const datos = snapshot.val();

        // 4. Manejo de evidencias con validación mejorada
        if (nuevoEstado === 'pendiente' && datos.evidencias) {
            try {
                // Extraer path desde la URL de descarga
                const urlParts = datos.evidencias.split('/');
                const index = urlParts.indexOf('o') + 1;
                const pathStorage = decodeURIComponent(urlParts[index]).split('?')[0];
                const evidenciaRef = storageRef(storage, pathStorage);

                // Verificar existencia antes de eliminar
                await getDownloadURL(evidenciaRef); // Lanza error si no existe
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
            // mostrarError("Error crítico: Motivo requerido no proporcionado");
            return;
        }
        // 5. Preparar actualización optimizada
        const actualizacion = {
            estado: nuevoEstado,
            ultimaActualizacion: new Date().toISOString(),
            evidencias: nuevoEstado === 'pendiente' ? null : datos.evidencias || null,
            _actualizadoPor: getCookie('nombre') || 'Sistema',
            motivoRechazo: nuevoEstado === 'pendiente' ? motivo : null, // Asegurar motivo
            fechaRechazo: nuevoEstado === 'pendiente' ? new Date().toISOString() : null,
            justificacionProceso: nuevoEstado === 'en_proceso' ? justificacion : null
        };

        // 6. Agregar marcas de tiempo específicas
        if (nuevoEstado === 'atendida') {
            actualizacion.fechaAtencion = new Date().toISOString();
        } else if (nuevoEstado === 'verificacion') {
            actualizacion.fechaVerificacion = new Date().toISOString();
        }

        // 7. Actualización atómica en Firebase
        await update(docRef, actualizacion);

        // 8. Actualización local inmediata sin recargar toda la data
        const index = solicitudesSeguimiento.findIndex(s => s.key === folio);
        if (index !== -1) {
            solicitudesSeguimiento[index] = {
                ...solicitudesSeguimiento[index],
                ...actualizacion,
                tipoPath: path // Asegurar que mantenga el tipoPath correcto
            };

            // Actualizar UI específica
            if (typeof actualizarTablaSeguimiento === 'function') {
                actualizarTablaSeguimiento();
            } else {
                console.error('Función actualizarTablaSeguimiento no definida');
            }

            cargarVerificacion();
            cargarValidadas();
        }

        // 9. Mensajes de éxito contextuales
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

// Modifica el event listener del input de archivo
document.getElementById('evidenciaFile').addEventListener('change', function (e) {
    const fileInfo = document.getElementById('fileInfo');
    const removeBtn = document.getElementById('removeFile');

    if (this.files.length > 0) {
        const file = this.files[0];
        const extension = file.name.split('.').pop().toLowerCase();

        // Validar extensión
        if (!ALLOWED_EXTENSIONS.includes(extension)) {
            mostrarError(`Formato no permitido: .${extension}`);
            this.value = '';
            fileInfo.textContent = 'Formatos permitidos: .pdf, .jpg, .jpeg, .png, .zip, .rar (Máx. 10MB)';
            removeBtn.classList.add('d-none');
            return;
        }

        // Validar tamaño
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

// Agrega evento para el botón de remover archivo
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

// Función para subir evidencia y cambiar estado
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

    // Validar extensión nuevamente (por si el usuario modificó el input)
    const extension = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
        mostrarError(`Formato no permitido: .${extension}`);
        return;
    }

    // Validar tamaño
    if (file.size > MAX_FILE_SIZE_BYTES) {
        mostrarError(`El archivo excede el tamaño máximo de ${MAX_FILE_SIZE_MB}MB`);
        return;
    }

    // Validar tamaño del archivo
    if (file.size > MAX_FILE_SIZE_BYTES) {
        mostrarError(`El archivo excede el tamaño máximo de ${MAX_FILE_SIZE_MB}MB`);
        return;
    }

    try {
        const metadata = {
            contentType: file.type,
            cacheControl: 'public, max-age=31536000',
        };

        const storagePath = `${folioActual}/Evidencia/${file.name}`;
        const refArchivo = storageRef(storage, storagePath);
        await uploadBytes(refArchivo, file);
        const urlDescarga = await getDownloadURL(refArchivo);

        await update(ref(database, `${tipo}/${folioActual}`), {
            estado: 'verificacion',
            evidencias: urlDescarga,
            fechaVerificacion: new Date().toISOString()
        });

        // Actualizar UI
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
        paths = ['solicitudes_institucionales']; // Solo institucionales
    }

    solicitudesVerificacion = [];

    const userRol = parseInt(getCookie('rol')) || 0;
    const userDependencias = getCookie('dependencia') ?
        decodeURIComponent(getCookie('dependencia')).split(',') : [];

    // Corregir: Validar si hay dependencias para no-admin
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

        solicitud.key = childSnapshot.key;
        solicitud.tipoPath = path;
        solicitud.folio = solicitud.folio || childSnapshot.key;
        solicitudesVerificacion.push(solicitud);
    });
    
    // Aplicar filtro para Esmeralda Merchan - NO mostrar solicitudes de Vinculación Ciudadana
    solicitudesVerificacion = filtrarSolicitudesVinculacionCiudadana(solicitudesVerificacion);
    
    aplicarFiltrosVerificacion();
});
    });
}

document.getElementById('busqueda-verificacion').addEventListener('input', () => {
    currentPageVerificacion = 1;
    aplicarFiltrosVerificacion();
});

function aplicarFiltrosVerificacion() {
    const busqueda = document.getElementById('busqueda-verificacion').value.toLowerCase();
    const filtradas = solicitudesVerificacion.filter(s =>
        s.folio.toLowerCase().includes(busqueda) ||
        s.asunto.toLowerCase().includes(busqueda)
    );
    mostrarPaginaVerificacion(filtradas);
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

    items.forEach(solicitud => {
        // Determinar tipoDocumento basado en la colección
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
        tabla.appendChild(tr);
    });
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

// Evento modificado para cambio de archivo
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

// Agregar evento para remover documento inicial
document.getElementById('removeDocInicial').addEventListener('click', () => {
    const fileInput = document.getElementById('documentoInicial');
    fileInput.value = '';
    fileInput.dispatchEvent(new Event('change'));
});

// Agregar al inicio del archivo, después de las constantes
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

// Actualizar el objeto estados
const estados = {
    'pendiente': { texto: 'Pendiente', color: coloresGraficas.primary },
    'pendiente_vobo': { texto: 'Pendiente VoBo', color: coloresGraficas.pendiente_vobo },
    'rechazado_vobo': { texto: 'VoBo Rechazado', color: coloresGraficas.rechazado_vobo },
    'por_vencer': { texto: 'Por Vencer', color: coloresGraficas.secondary },
    'en_proceso': { texto: 'En Proceso', color: coloresGraficas.info },
    'verificacion': { texto: 'En Verificación', color: coloresGraficas.warning },
    'atendida': { texto: 'Atendida', color: coloresGraficas.success },
    'atrasada': { texto: 'Atrasada', color: coloresGraficas.danger }
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

    const estado = estados[solicitud.estado] || { texto: 'Desconocido', color: '#666' };
    const dependenciaNombre = dependenciasMap[solicitud.dependencia] || 'Desconocida';

    // Verificar si es Vinculación Ciudadana
    const userEmail = getCookie('email');
    const esVinculacionCiudadana = userEmail === CORREO_VINCULACION_CIUDADANA;

    // Deshabilitar botones cuando está en pendiente_vobo o verificación/atendida
    const pendienteVobo = solicitud.estado === 'pendiente_vobo';
    const enVerificacion = solicitud.estado === 'verificacion';
    const atendida = solicitud.estado === 'atendida';
    const rechazadaVobo = solicitud.estado === 'rechazado_vobo';
    const deshabilitarBotones = pendienteVobo || enVerificacion || atendida;

    // Botón de reenvío solo para Vinculación Ciudadana y estado rechazado_vobo
    const botonReenvio = (esVinculacionCiudadana && rechazadaVobo) ? `
        <button class="btn btn-sm btn-warning" 
                onclick="mostrarReenvioVobo('${solicitud.folio}', '${solicitud.motivoRechazoVobo || ''}')">
            <i class="fas fa-redo-alt me-1"></i> Reenviar VoBo
        </button>
    ` : '';

    tr.innerHTML = `
        <td>${solicitud.folio}</td>
        <td>${nombresTipos[solicitud.tipo] || solicitud.tipo}</td>
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
                
                <!-- Botón para VoBo (solo visible para Secretaría General) -->
                ${solicitud.estado === 'pendiente_vobo' && obtenerFiltroEspecial().esSecretariaGeneral ? `
                    <button class="btn btn-sm btn-success" 
                            onclick="aprobarVobo('${solicitud.folio}')">
                        <i class="fas fa-check me-1"></i> Dar VoBo
                    </button>
                ` : ''}
                
                ${botonReenvio}
                
                <button class="btn btn-sm btn-proceso" 
                    ${deshabilitarBotones ? 'disabled' : ''}
                    onclick="${!deshabilitarBotones ? `mostrarConfirmacionProceso('${solicitud.folio}')` : ''}">
                    <i class="fas fa-sync-alt"></i> ${solicitud.estado === 'en_proceso' ? 'En Proceso' : 'Marcar Proceso'}
                </button>
                
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

window.mostrarDocumentoInicial = function (folio, nombreArchivo, url, secretariaOrigen) {
    const modal = new bootstrap.Modal(document.getElementById('evidenciaModal'));
    const loading = document.getElementById('loadingPreview');
    const pdfContainer = document.getElementById('pdfContainer');
    const imagenContainer = document.getElementById('imagenContainer');
    const visorNoSoportado = document.getElementById('visorNoSoportado');
    const pdfViewer = document.getElementById('pdfViewer');
    const modalElement = document.getElementById('evidenciaModal');

    // Resetear estado inicial
    [loading, pdfContainer, imagenContainer, visorNoSoportado].forEach(el => {
        el.classList.add('d-none');
    });
    loading.classList.remove('d-none');
    pdfViewer.src = '';
    pdfViewer.removeAttribute('data-temp-src');

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
    const fechaActual = new Date().toLocaleDateString('es-MX');

    // Actualizar metadatos
    document.getElementById('nombreArchivoCompleto').textContent = nombre;
    document.getElementById('folioEvidencia').textContent = folio;
    document.getElementById('secretariaEvidencia').textContent = '-';
    document.getElementById('fechaEvidencia').textContent = fechaActual;

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

        if (['jpg', 'jpeg', 'png', 'gif'].includes(fileExt)) {
            imagenContainer.classList.remove('d-none');
            const img = document.getElementById('visorImagen');
            img.src = url;
            img.onload = () => {
                document.getElementById('imagenDimensions').textContent =
                    `${img.naturalWidth}px × ${img.naturalHeight}px`;
            };
        } else if (fileExt === 'pdf') {
            pdfContainer.classList.remove('d-none');
            document.getElementById('pdfMeta').textContent = `${nombre} | ${fechaActual}`;
            pdfViewer.dataset.tempSrc = `${url}#view=FitH`;
            window.addEventListener('resize', resizeHandler);
            setTimeout(resizeHandler, 50);
        } else {
            visorNoSoportado.classList.remove('d-none');
            document.getElementById('tipoArchivo').textContent = `.${fileExt}`;
            const downloadBtn = document.getElementById('descargarEvidencia');
            downloadBtn.href = url;
            downloadBtn.download = nombre;
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

async function obtenerNombreDependencia(dependenciaKey) {
    const dependenciaRef = ref(database, `dependencias/${dependenciaKey}`);
    const snapshot = await get(dependenciaRef);
    return snapshot.val()?.nombre || 'Desconocida';
}

// 1. Variables de control
let actualizacionEnCurso = false;
const DIAS_ADVERTENCIA = 1; // Días previos para marcar como "por vencer"

// 2. Función optimizada para actualización de estados
async function actualizarEstadosAutomaticos() {
    if (actualizacionEnCurso) return;
    actualizacionEnCurso = true;

    try {
        const ahora = ajustarHoraMexico(new Date());
        const updates = {};
        const paths = ['solicitudes', 'acuerdos', 'oficios'];

        // Obtener datos directamente de Firebase
        const allDocs = await Promise.all(paths.map(async (path) => {
            const snapshot = await get(query(ref(database, path)));
            return snapshot.val() || {};
        }));

        // Procesar cada documento
        paths.forEach((path, index) => {
            const docs = allDocs[index];
            Object.entries(docs).forEach(([key, doc]) => {
                if (!['pendiente', 'por_vencer'].includes(doc.estado)) return;

                const fechaLimite = ajustarHoraMexico(new Date(doc.fechaLimite));
                const diasRestantes = calcularDiasHabilesRestantes(ahora, fechaLimite);

                let nuevoEstado = doc.estado;

                // Lógica mejorada de transición de estados
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

        // Ejecutar actualizaciones si hay cambios
        if (Object.keys(updates).length > 0) {
            await update(ref(database), updates);

            // Actualizar datos locales sin recargar toda la lista
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

// 3. Función mejorada para cálculo de días hábiles
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

// 4. Configurar intervalo de actualización (cada 12 horas)
setInterval(actualizarEstadosAutomaticos, 43200000); // 12 horas 43200000
document.addEventListener('DOMContentLoaded', actualizarEstadosAutomaticos);

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
        paths = ['solicitudes_institucionales'];
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
                    // Aplicar filtro para Vinculación Ciudadana - SOLO SUS SOLICITUDES
                    const datosFiltrados = filtrarSoloVinculacionCiudadana(datos);
                    resolve(datosFiltrados);
                }, { onlyOnce: true });
            });
        })).then(results => {
            const mergedData = [].concat(...results).reduce((acc, current) => {
                if (!acc.find(item => item.key === current.key)) {
                    acc.push(current);
                }
                return acc;
            }, []);
            solicitudesSeguimiento = mergedData;
            actualizarTablaSeguimiento();
            actualizarEstadisticas(solicitudesSeguimiento); // ← AÑADIR ESTA LÍNEA
            actualizarGraficas(solicitudesSeguimiento);     // ← Y ESTA
        });


        // Escuchar cambios en tiempo real
        paths.forEach(path => {
            const refPath = ref(database, path);
            onValue(refPath, (snapshot) => {
                snapshot.forEach(childSnapshot => {
                    const nuevaSolicitud = childSnapshot.val();
                    const index = solicitudesSeguimiento.findIndex(s => s.key === childSnapshot.key);
                    if (index === -1) {
                        solicitudesSeguimiento.push({ ...nuevaSolicitud, key: childSnapshot.key, tipoPath: path });
                    } else {
                        solicitudesSeguimiento[index] = { ...nuevaSolicitud, key: childSnapshot.key, tipoPath: path };
                    }
                });
                // Aplicar filtro para Vinculación Ciudadana
                solicitudesSeguimiento = filtrarSoloVinculacionCiudadana(solicitudesSeguimiento);
                actualizarTablaSeguimiento();
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
                        // Aplicar filtro para Vinculación Ciudadana - SOLO SUS SOLICITUDES
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
    
    // Aplicar filtro para Esmeralda Merchan
    solicitudesSeguimiento = filtrarSolicitudesVinculacionCiudadana(mergedData);
    
    actualizarTablaSeguimiento();
    actualizarEstadisticas(solicitudesSeguimiento);
    actualizarGraficas(solicitudesSeguimiento);
});

        // Escuchar cambios en tiempo real para cada dependencia y path
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
                    // Aplicar filtro para Vinculación Ciudadana
                    solicitudesSeguimiento = filtrarSoloVinculacionCiudadana(solicitudesSeguimiento);
                    actualizarTablaSeguimiento();
                });
            });
        });
    }
}

// Manejo del formulario corregido
document.getElementById('formNuevaSolicitud').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;

    // Validación de campos
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

    // Validar formato de teléfono
    const telefono = document.getElementById('telefono');
    if (!/^\d{10}$/.test(telefono.value)) {
        validado = false;
        mostrarError("El teléfono debe tener 10 dígitos");
    }

    if (!validado) return;

    try {
        // Generar folio primero
        const folio = await generarFolio();

        // Manejar documento inicial
        const docInicialInput = document.getElementById('documentoInicial');
        const docInicialFile = docInicialInput.files[0];

        // Validar archivo
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

        // Subir documento a Storage
        const storagePath = `${folio}/Documento Inicial/${docInicialFile.name}`;
        const docRef = storageRef(storage, storagePath);
        await uploadBytes(docRef, docInicialFile);
        const docUrl = await getDownloadURL(docRef);

        // VERIFICACIÓN DE VINCULACIÓN CIUDADANA Y VoBo
        const { esVinculacionCiudadana } = obtenerFiltroEspecial();
        const userEmail = obtenerEmailUsuario(); // ← USAR FUNCIÓN MEJORADA

        // Si es Vinculación Ciudadana, el estado será 'pendiente_vobo', sino 'pendiente'
        const estadoInicial = (esVinculacionCiudadana || userEmail === CORREO_VINCULACION_CIUDADANA)
            ? 'pendiente_vobo'
            : 'pendiente';

        // Crear objeto de solicitud CON EL CREADOR MEJORADO
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
            // Campos adicionales para control de VoBo
            requiereVobo: (esVinculacionCiudadana || userEmail === CORREO_VINCULACION_CIUDADANA),
            voboAprobado: false,
            voboSecretariaGeneral: null,
            fechaSolicitudVobo: (esVinculacionCiudadana || userEmail === CORREO_VINCULACION_CIUDADANA) ? new Date().toISOString() : null,
            // NUEVO CAMPO: Guardar quién creó la solicitud DE FORMA SEGURA
            creadoPor: userEmail,
            _creadoPor: userEmail,
            usuarioCreacion: userEmail,
            _usuarioCreacion: userEmail,
            creadoPorEmail: userEmail,
            creadoPorNombre: obtenerNombreUsuario() // ← AGREGAR NOMBRE TAMBIÉN
        };

        // Validar que no haya campos undefined
        Object.keys(nuevaSolicitud).forEach(key => {
            if (nuevaSolicitud[key] === undefined) {
                nuevaSolicitud[key] = null;
            }
        });

        // Guardar en la base de datos
        await set(ref(database, `solicitudes/${folio}`), nuevaSolicitud);

        // Limpiar formulario sin triggerear alertas
        suppressFileInputEvents = true;
        form.reset();
        document.getElementById('fecha').value = obtenerFechaHoy();
        docInicialInput.value = '';

        // Restaurar UI manualmente
        document.getElementById('docInicialInfo').textContent =
            'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
        document.getElementById('removeDocInicial').classList.add('d-none');
        suppressFileInputEvents = false;

        // Mensaje diferente según si requiere VoBo o no
        if (estadoInicial === 'pendiente_vobo') {
            mostrarExito("Solicitud creada exitosamente! Esperando VoBo de Secretaría General.");
        } else {
            mostrarExito("Solicitud creada exitosamente!");
        }

    } catch (error) {
        console.error("Error al guardar:", error);
        mostrarError(`Error al crear la solicitud: ${error.message}`);
    }
});

// Añadir al inicio con las constantes
const coloresEstatus = {
    pendiente: '#491F42',
    vencer: '#720F36',
    en_progreso: '#ae9074',
    atendida: '#2E7D32',
    atrasado: '#a90000',
    verificacion: '#FFA500'
};

// Paleta de énfasis visual
const coloresSecundarios = {
    texto: '#37474F',        // Gris oscuro para texto
    fondo: '#FFFFFF',        // Fondo blanco
    linea: '#B0BEC5',        // Líneas grises claras
    destacado: '#D32F2F'     // Rojo para elementos destacados
};

// Añadir después de actualizarEstadisticas
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
        pendiente_vobo: new Array(tiposSolicitud.length).fill(0), // ← Nuevo dataset
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
                    label: 'Pendientes VoBo', // ← Nueva serie
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
                duration: 800,
                easing: 'easeOutQuart'
            }
        }
    });
}

// Event listeners para filtros
document.getElementById('busqueda-seguimiento').addEventListener('input', () => {
    currentPageSeguimiento = 1;
    aplicarFiltrosSeguimiento();
});

document.getElementById('filtro-estado-seguimiento').addEventListener('change', () => {
    currentPageSeguimiento = 1;
    aplicarFiltrosSeguimiento();
});

document.getElementById('busqueda-validadas').addEventListener('input', () => {
    currentPageValidadas = 1;
    aplicarFiltrosValidadas();
});

// En DOMContentLoaded, después de cargar dependencias:
document.getElementById('filtro-secretaria-validadas').addEventListener('change', () => {
    currentPageValidadas = 1;
    aplicarFiltrosValidadas();
});

// En DOMContentLoaded, después de cargar dependencias:
document.getElementById('filtro-canal-validadas').addEventListener('change', () => {
    currentPageValidadas = 1;
    aplicarFiltrosValidadas();
});

document.getElementById('confirmarAtendidaModal').addEventListener('hidden.bs.modal', () => {
    const fileInput = document.getElementById('evidenciaFile');
    fileInput.value = '';
    fileInput.dispatchEvent(new Event('change'));
});

// Agregar en el DOMContentLoaded, después de los otros event listeners
document.getElementById('busqueda-vobo')?.addEventListener('input', () => {
    currentPageVobo = 1;
    aplicarFiltrosVobo();
});

document.getElementById('filtro-secretaria-vobo')?.addEventListener('change', () => {
    currentPageVobo = 1;
    aplicarFiltrosVobo();
});

// En el DOMContentLoaded, agregar este event listener
document.getElementById('filtro-fecha-vobo')?.addEventListener('change', () => {
    currentPageVobo = 1;
    aplicarFiltrosVobo();
});

// Sistema de navegación y UI
document.addEventListener('DOMContentLoaded', async function () {
        if (!checkSession()) {
        return; // Si no hay sesión válida, salir
    }
    showUserInfo();
    setupLogout();

    // Cargar primero las dependencias
    await cargarDependencias();

    // Luego cargar otros componentes
    cargarSecretarias();
    cargarSeguimiento();
    cargarValidadas();
    cargarVerificacion();

    // Obtener email del usuario PRIMERO
    const userEmail = getCookie('email');
    const role = parseInt(getCookie('rol')) || 0;
    let userDependencias = getCookie('dependencia') ?
        decodeURIComponent(getCookie('dependencia')).split(',') : [];

    const { esVinculacionCiudadana } = obtenerFiltroEspecial();

    // Si es Vinculación Ciudadana, forzar solo Secretaría General
    if (esVinculacionCiudadana) {
        userDependencias = [DEPENDENCIA_SECRETARIA_GENERAL];
    }

    // DECLARAR TODAS LAS VARIABLES DE NAVEGACIÓN PRIMERO
    const dashboardLi = document.querySelector('a[data-content="dashboard"]').parentElement;
    const nuevaLi = document.querySelector('a[data-content="nueva"]').parentElement;
    const seguimientoLi = document.querySelector('a[data-content="seguimiento"]').parentElement;
    const validadasLi = document.querySelector('a[data-content="validadas"]').parentElement;
    const verificacionLi = document.querySelector('a[data-content="verificacion"]').parentElement;
    const navacuerdos = document.querySelector('a[data-content="acuerdo"]').parentElement;
    const navoficios = document.querySelector('a[data-content="oficio"]').parentElement;
    const navInstitucional = document.getElementById('navInstitucional');
    const navVobo = document.getElementById('navVobo'); // ← AHORA DECLARADO ANTES DE USAR

    // MODIFICACIÓN: Para Vinculación Ciudadana, mostrar solo los módulos permitidos
    if (esVinculacionCiudadana) {
        // Mostrar solo los módulos permitidos (incluyendo dashboard)
        dashboardLi.style.display = 'block';    // Dashboard
        nuevaLi.style.display = 'block';        // Nueva Solicitud Ciudadana
        seguimientoLi.style.display = 'block';  // Seguimiento de Solicitudes
        validadasLi.style.display = 'block';    // Solicitudes Atendidas
        verificacionLi.style.display = 'block'; // Solicitudes en Verificación

        // Ocultar los módulos NO permitidos
        navacuerdos.style.display = 'none';
        navoficios.style.display = 'none';
        if (navInstitucional) navInstitucional.style.display = 'none';
        if (navVobo) navVobo.style.display = 'none';

        // Activar por defecto la pestaña de Dashboard
        setTimeout(() => {
            document.querySelector('a[data-content="dashboard"]').click();
        }, 100);
    } else {
        // Comportamiento normal para otros perfiles
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
                break;
            case 2:
                nuevaLi.style.display = 'none';
                seguimientoLi.style.display = 'block';
                validadasLi.style.display = 'block';
                verificacionLi.style.display = 'none';
                navacuerdos.style.display = 'none';
                navoficios.style.display = 'none';
                if (navInstitucional) navInstitucional.style.display = 'none';
                break;
            case 3:
                // Mostrar acuerdo de gabinete solo si NO es Vinculación Ciudadana u Oficialía Mayor
                if (userEmail === 'vinculacion.ciudadana@tizayuca.gob.mx' ||
                    userEmail === 'oficialia.mayor@tizayuca.gob.mx') {
                    navacuerdos.style.display = 'none';
                } else {
                    navacuerdos.style.display = 'block';
                }

                // Mostrar otros módulos normalmente
                navoficios.style.display = 'block';
                if (navInstitucional) navInstitucional.style.display = 'block';
                break;
            default:
                nuevaLi.style.display = 'none';
                seguimientoLi.style.display = 'none';
                validadasLi.style.display = 'none';
                navacuerdos.style.display = 'none';
                navoficios.style.display = 'none';
                if (navInstitucional) navInstitucional.style.display = 'none';
        }
    }

    // Validar pestaña activa guardada
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
            allowedTabs.push('nueva', 'seguimiento', 'validadas');
            break;
    }

    // Para Vinculación Ciudadana, permitir los módulos específicos
    if (esVinculacionCiudadana) {
        allowedTabs.push('nueva', 'seguimiento', 'validadas', 'verificacion');
    }

    if (savedTab && !allowedTabs.includes(savedTab)) {
        switchTab('dashboard');
        document.querySelector('.nav-link.active').classList.remove('active');
        document.querySelector('.nav-link[data-content="dashboard"]').classList.add('active');
    }

    // Configurar fecha actual
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
    `;

    // AHORA SÍ PODEMOS USAR navVobo DE FORMA SEGURA
    // Mostrar sección de VoBo solo para Secretaría General
    if (userEmail === CORREO_SECRETARIA_GENERAL) {
        if (navVobo) {
            navVobo.style.display = 'block';
            cargarSolicitudesVobo(); // Cargar solicitudes de VoBo
        }

        // Mostrar estadística de pendientes VoBo en el dashboard
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

        // Ocultar estadística de pendientes VoBo para otros perfiles
        const statsVoboElement = document.getElementById('stats-pendientes-vobo');
        if (statsVoboElement) {
            const statCard = statsVoboElement.closest('.stat-card');
            if (statCard) {
                statCard.style.display = 'none';
            }
        }
    }

    // Menú móvil
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

    // 2. Función para cambiar pestañas
    function switchTab(contentId) {
        contentSections.forEach(section => {
            section.style.display = 'none';
        });

        const activeSection = document.getElementById(`${contentId}-content`);
        if (activeSection) {
            activeSection.style.display = 'block';

            // Si es Vinculación Ciudadana, aplicar filtros específicos cuando se cambie a ciertas pestañas
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

    // Event listeners para los navLinks
    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const contentId = this.getAttribute('data-content');
            if (contentId === 'vobo') {
                // Asegurarse de que los datos de VoBo estén cargados
                aplicarFiltrosVobo();
            }

            navLinks.forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            switchTab(contentId);
        });
    });

    // Agregar event listeners para los botones de confirmación
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


function checkSession() {
    const sessionCookie = getCookie('session');
    const expiresCookie = getCookie('expires');

    if (!sessionCookie || !expiresCookie) {
        // Si no hay cookies, redirigir inmediatamente
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 100);
        return false;
    }

    const now = new Date();
    const expirationDate = new Date(expiresCookie);

    if (now > expirationDate) {
        // Si ya expiró, redirigir
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 100);
        return false;
    }

    // Iniciar el sistema de detección de actividad
    setupActivityDetection();
    
    // Renovar inmediatamente si la sesión es vieja
    const sessionAge = expirationDate - now;
    if (sessionAge < 5 * 60 * 1000) { // Menos de 5 minutos restantes
        renewSession();
    }
    
    return true;
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
        // Detener el intervalo de renovación
        if (sessionRenewalInterval) {
            clearInterval(sessionRenewalInterval);
            sessionRenewalInterval = null;
        }
        
        // Eliminar todas las cookies
        document.cookie.split(";").forEach(cookie => {
            const name = cookie.split("=")[0].trim();
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        });

        logoutModal.hide();
        setTimeout(() => window.location.href = 'index.html', 300);
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

    // Cerrar ambos modales de confirmación
    ['#confirmarProcesoModal', '#confirmarAtendidaModal'].forEach(modalId => {
        const modal = bootstrap.Modal.getInstance(document.querySelector(modalId));
        if (modal) modal.hide();
    });
};

// Configurar formulario Acuerdo
document.getElementById('formNuevoAcuerdo').addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        // Obtener elementos del DOM
        const docInput = document.getElementById('documentoAcuerdo');
        const docFile = docInput.files[0];

        // Validar campos requeridos
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

        // Validar archivo
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

        // Generar folio y subir documento
        const folio = await generarFolio('acuerdo');
        const storagePath = `${folio}/Documento Acuerdo/${docFile.name}`;
        const docRef = storageRef(storage, storagePath);
        await uploadBytes(docRef, docFile);
        const docUrl = await getDownloadURL(docRef);

        const userEmail = obtenerEmailUsuario(); // ← USAR FUNCIÓN MEJORADA

        // Crear objeto Acuerdo CON CAMPOS DE CREADOR
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
            // CAMPOS DE CREADOR AGREGADOS
            creadoPor: userEmail,
            _creadoPor: userEmail,
            usuarioCreacion: userEmail,
            _usuarioCreacion: userEmail,
            creadoPorEmail: userEmail,
            creadoPorNombre: obtenerNombreUsuario()
        };

        // Validar que no haya campos undefined
        Object.keys(nuevoAcuerdo).forEach(key => {
            if (nuevoAcuerdo[key] === undefined) {
                nuevoAcuerdo[key] = null;
            }
        });

        // Guardar en Firebase
        await set(ref(database, `acuerdos/${folio}`), nuevoAcuerdo);

        // Limpiar formulario
        limpiarFormulario('acuerdo');
        mostrarExito("Acuerdo creado exitosamente!");

    } catch (error) {
        mostrarError(`Error al crear el Acuerdo: ${error.message}`);
        console.error("Detalle del error:", error);
    }
});

// Configurar formulario Oficio (similar a Acuerdo)
document.getElementById('formNuevoOficio').addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        const folio = await generarFolio('oficio');
        const docFile = document.getElementById('documentoOficio').files[0];

        if (!validarDocumento(docFile, true)) return;

        const storagePath = `${folio}/Documento Inicial Oficio/${docFile.name}`;
        const docRef = storageRef(storage, storagePath);
        await uploadBytes(docRef, docFile);
        const docUrl = await getDownloadURL(docRef);

        const userEmail = obtenerEmailUsuario(); // ← USAR FUNCIÓN MEJORADA

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
            // Campos del peticionario
            solicitante: {
                nombre: document.getElementById('peticionarioOficio').value,
                telefono: document.getElementById('telefonoOficio').value
            },
            // CAMPOS DE CREADOR AGREGADOS
            creadoPor: userEmail,
            _creadoPor: userEmail,
            usuarioCreacion: userEmail,
            _usuarioCreacion: userEmail,
            creadoPorEmail: userEmail,
            creadoPorNombre: obtenerNombreUsuario()
        };

        // Validar que no haya campos undefined
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

    // Resetear campos
    form.reset();

    // Limpiar file input y UI
    const fileInput = document.getElementById(`documento${prefix}`);
    const fileInfo = document.getElementById(`doc${prefix}Info`);
    const removeBtn = document.getElementById(`removeDoc${prefix}`);

    fileInput.value = '';
    fileInfo.textContent = 'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
    removeBtn.classList.add('d-none');

    // Restablecer fecha
    document.getElementById(`fecha${prefix}`).value = obtenerFechaHoy();

    // Limpiar nuevos campos específicos para oficio
    if (tipo === 'oficio') {
        document.getElementById('peticionarioOficio').value = '';
        document.getElementById('telefonoOficio').value = '';
    }
}
// Configurar eventos para los documentos
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

// En DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // Configurar fechas
    document.getElementById('fechaAcuerdo').value = obtenerFechaHoy();
    document.getElementById('fechaOficio').value = obtenerFechaHoy();

    // Obtener email del usuario
    const userEmail = getCookie('email');

    // Mostrar módulos solo para rol 3, excepto para los correos específicos
    const role = parseInt(getCookie('rol'));

    if (role === 3) {
        // Ocultar acuerdo de gabinete para los correos específicos
        if (userEmail === 'vinculacion.ciudadana@tizayuca.gob.mx' ||
            userEmail === 'oficialia.mayor@tizayuca.gob.mx') {
            document.getElementById('navAcuerdo').style.display = 'none';
        } else {
            document.getElementById('navAcuerdo').style.display = 'block';
        }

        // Mostrar otros módulos normalmente
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

    // Validar campos requeridos
    let valido = true;
    camposRequeridos[tipo].forEach(id => {
        const campo = document.getElementById(id);
        if (!campo || !campo.value.trim()) {
            valido = false;
            campo.classList.add('is-invalid');
            mostrarError(`El campo ${campo.previousElementSibling?.innerText || 'requerido'} es obligatorio`);
        }
    });

    // Validar archivo
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

        if (file.size > 10 * 1024 * 1024) { // 10MB
            mostrarError(`El archivo excede el tamaño máximo de 10MB para ${prefix}`);
            valido = false;
        }
    }

    return valido;
}

// Configurar validación en tiempo real para Acuerdos
document.getElementById('documentoAcuerdo').addEventListener('change', function (e) {
    validarArchivoInput(this, 'Acuerdo');
});

// Configurar validación en tiempo real para Oficios
document.getElementById('documentoOficio').addEventListener('change', function (e) {
    validarArchivoInput(this, 'Oficio');
});

// Función de validación unificada para archivos
function validarArchivoInput(input, tipoDocumento) {
    const file = input.files[0];
    const fileInfo = input.parentElement.querySelector('.file-info');
    const removeBtn = input.parentElement.querySelector('.remove-file');

    // Resetear estado
    input.classList.remove('is-invalid');
    fileInfo.classList.remove('text-danger');

    if (!file) {
        fileInfo.textContent = `Formatos permitidos: ${ALLOWED_INITIAL_EXTENSIONS.join(', ')} (Máx. ${MAX_INITIAL_FILE_SIZE_MB}MB)`;
        removeBtn?.classList.add('d-none');
        return;
    }

    // Validar extensión
    const extension = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_INITIAL_EXTENSIONS.includes(extension)) {
        input.value = '';
        fileInfo.textContent = `Formato .${extension} no permitido para ${tipoDocumento}`;
        fileInfo.classList.add('text-danger');
        mostrarError(`Formato no permitido para ${tipoDocumento}: .${extension}`);
        return;
    }

    // Validar tamaño
    if (file.size > MAX_INITIAL_FILE_SIZE_BYTES) {
        input.value = '';
        fileInfo.textContent = `El archivo excede ${MAX_INITIAL_FILE_SIZE_MB}MB`;
        fileInfo.classList.add('text-danger');
        mostrarError(`El archivo es demasiado grande para ${tipoDocumento} (Máx. ${MAX_INITIAL_FILE_SIZE_MB}MB)`);
        return;
    }

    // Mostrar información válida
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
    const { esSecretariaParticular } = obtenerFiltroEspecial();
    let solicitudesFiltradas = solicitudes;
    
    // Si es Esmeralda Merchan, filtrar solicitudes de Vinculación Ciudadana
    if (esSecretariaParticular && obtenerEmailUsuario() === 'oficinadepresidencia@tizayuca.gob.mx') {
        solicitudesFiltradas = filtrarSolicitudesVinculacionCiudadana(solicitudes);
    }
    
    actualizarGraficaPrincipal(solicitudesFiltradas);
    actualizarGraficaTipos(solicitudesFiltradas);
    actualizarGraficaTendencias(solicitudesFiltradas);
    actualizarGraficaEstatus(solicitudesFiltradas);
    actualizarEficienciaDepartamentos(solicitudesFiltradas);
    actualizarTiemposRespuesta(solicitudesFiltradas);
    actualizarGraficaTrimestral(solicitudesFiltradas);
    actualizarGraficaCanales(solicitudesFiltradas);
}

function actualizarGraficaPrincipal(solicitudes) {
    // Filtrar para Vinculación Ciudadana si es necesario
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
                    label: 'Atrasadas',
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
                duration: 800,
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

// Función mejorada para exportación múltiple
// En la función exportAllCharts, agregar la nueva gráfica
window.exportAllCharts = async () => {
    try {
        const zip = new JSZip();
        const folder = zip.folder("graficas_sisges");
        const date = new Date().toISOString().slice(0, 10);

        // Generar todas las gráficas (incluyendo la nueva)
        await Promise.all(Object.keys(charts).map(async (chartId) => {
            if (chartId === 'quarterlyChart' && !charts[chartId]) {
                // Si la gráfica trimestral no está inicializada, la creamos
                actualizarGraficaTrimestral(solicitudesSeguimiento);
            }

            if (chartId === 'channelChart' && !charts[chartId]) {
                // Si la gráfica de canales no está inicializada, la creamos
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

        // Generar y descargar ZIP
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `graficas_sisges_${date}.zip`);

    } catch (error) {
        mostrarError(`Error al exportar gráficas: ${error.message}`);
    }
};

// Modificar función de exportación individual para mejor calidad
window.exportChart = (chartId, fileName = 'chart') => {
    const chart = charts[chartId];
    if (!chart) return;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // Aumentar resolución para exportación HD
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

// En el evento de clic del botón de confirmar rechazo
document.getElementById('confirmarRechazar').addEventListener('click', async () => {
    const motivoInput = document.getElementById('motivoRechazo');
    const motivo = motivoInput.value.trim();

    // Validación robusta
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

// Limpiar el modal al cerrarse
document.getElementById('confirmarRechazarModal').addEventListener('hidden.bs.modal', () => {
    document.getElementById('motivoRechazo').value = '';
});

window.mostrarMotivo = function (motivo, usuario, fecha) {
    const motivoContenido = document.getElementById('textoMotivo');

    if (!motivoContenido) {
        console.error('Elemento textoMotivo no encontrado');
        return;
    }

    // Construir contenido con formato seguro
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

// Función modificada para confirmar cambio de estado
window.confirmarCambioEstado = function (nuevoEstado) {
    const justificacion = document.getElementById('justificacionProceso').value.trim();

    // Validar la justificación
    if (!justificacion || justificacion.length < 20) {
        document.getElementById('justificacionProceso').classList.add('is-invalid');
        return;
    }

    // CORRECCIÓN: Pasar la justificación como cuarto parámetro
    cambiarEstado(folioActual, nuevoEstado, '', justificacion);

    // Cerrar modal
    bootstrap.Modal.getInstance('#confirmarProcesoModal').hide();
};

// Manejo del formulario institucional
document.getElementById('formNuevaInstitucional').addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        // Validar campos requeridos
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

        // Validar formato de teléfono
        const telefono = document.getElementById('telefonoInstitucional');
        if (!/^\d{10}$/.test(telefono.value)) {
            validado = false;
            mostrarError("El teléfono debe tener 10 dígitos");
            telefono.classList.add('is-invalid');
        }

        // Validar formato de email
        const email = document.getElementById('emailInstitucional');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.value)) {
            validado = false;
            mostrarError("Formato de email inválido");
            email.classList.add('is-invalid');
        }

        if (!validado) return;

        // Obtener archivo
        const docInput = document.getElementById('documentoInstitucional');
        const docFile = docInput.files[0];

        // Validar archivo
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

        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
        if (docFile.size > MAX_SIZE) {
            mostrarError(`El archivo excede el tamaño máximo de 10MB`);
            return;
        }

        // Generar folio
        const folio = await generarFolio('institucional');

        // Subir documento
        const storagePath = `${folio}/Documento Institucional/${docFile.name}`;
        const docRef = storageRef(storage, storagePath);
        await uploadBytes(docRef, docFile);
        const docUrl = await getDownloadURL(docRef);

        const userEmail = obtenerEmailUsuario(); // ← USAR FUNCIÓN MEJORADA

        // Crear objeto solicitud CON CAMPOS DE CREADOR
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
            // Campos específicos para seguimiento
            solicitante: {
                nombre: document.getElementById('contactoInstitucional').value,
                telefono: document.getElementById('telefonoInstitucional').value
            },
            // CAMPOS DE CREADOR AGREGADOS
            creadoPor: userEmail,
            _creadoPor: userEmail,
            usuarioCreacion: userEmail,
            _usuarioCreacion: userEmail,
            creadoPorEmail: userEmail,
            creadoPorNombre: obtenerNombreUsuario()
        };

        // Validar que no haya campos undefined
        Object.keys(nuevaSolicitud).forEach(key => {
            if (nuevaSolicitud[key] === undefined) {
                nuevaSolicitud[key] = null;
            }
        });

        // Guardar en Firebase (en nueva colección)
        await set(ref(database, `solicitudes_institucionales/${folio}`), nuevaSolicitud);

        // Limpiar formulario
        document.getElementById('formNuevaInstitucional').reset();
        // Restablecer fecha actual
        document.getElementById('fechaInstitucional').value = obtenerFechaHoy();
        // Limpiar archivo
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

// Evento para el botón de remover archivo
document.getElementById('removeDocInstitucional').addEventListener('click', () => {
    const fileInput = document.getElementById('documentoInstitucional');
    fileInput.value = '';
    fileInput.dispatchEvent(new Event('change'));
});

// Evento para mostrar información del archivo
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

// Inicializar fecha actual
document.getElementById('fechaInstitucional').value = obtenerFechaHoy();

// Función para obtener el trimestre de una fecha
function obtenerTrimestre(fecha) {
    const mes = new Date(fecha).getMonth();
    return Math.floor(mes / 3) + 1;
}

// Función para obtener el año y trimestre en formato "YYYY-T"
function obtenerPeriodo(fecha) {
    const año = new Date(fecha).getFullYear();
    const trimestre = obtenerTrimestre(fecha);
    return `${año}-T${trimestre}`;
}

// Función para procesar datos trimestrales
function procesarDatosTrimestrales(solicitudes) {
    const datosTrimestrales = {};
    const años = new Set();

    // Procesar todas las solicitudes atendidas
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

        // Contabilizar por tipo de solicitud
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

// Función para actualizar la gráfica trimestral
function actualizarGraficaTrimestral(solicitudes) {
    const { datosTrimestrales, años } = procesarDatosTrimestrales(solicitudes);

    // Obtener todos los periodos (trimestres) ordenados
    const periodos = Object.keys(datosTrimestrales).sort();

    // Obtener todos los tipos de solicitudes únicos
    const tiposUnicos = new Set();
    periodos.forEach(periodo => {
        Object.keys(datosTrimestrales[periodo].porTipo).forEach(tipo => {
            tiposUnicos.add(tipo);
        });
    });
    const tipos = Array.from(tiposUnicos);

    // Preparar datos para la gráfica
    const datasets = tipos.map(tipo => {
        return {
            label: tipo,
            data: periodos.map(periodo => datosTrimestrales[periodo].porTipo[tipo] || 0),
            backgroundColor: obtenerColorParaTipo(tipo),
            borderColor: obtenerColorParaTipo(tipo),
            borderWidth: 1
        };
    });

    // Agregar también el total general
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

    // Crear o actualizar la gráfica
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

// Función auxiliar para obtener colores según el tipo
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
    // Definir los estados que vamos a mostrar y sus colores
    const estados = [
        { id: 'atendida', label: 'Atendidas', color: '#2E7D32' },
        { id: 'pendiente', label: 'Pendientes', color: '#491F42' },
        { id: 'en_proceso', label: 'En Proceso', color: '#ae9074' },
        { id: 'por_vencer', label: 'Por Vencer', color: '#720F36' },
        { id: 'atrasada', label: 'Vencidas', color: '#a90000' },
        { id: 'verificacion', label: 'En Verificación', color: '#FFA500' }
    ];

    // Obtener todos los canales únicos
    const canalesSet = new Set();
    solicitudes.forEach(s => {
        const canal = s.tipo || s.canal || 'Sin especificar';
        canalesSet.add(canal);
    });

    const canales = Array.from(canalesSet);

    // Preparar datos para la gráfica
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

    // Calcular totales por canal
    const totalesPorCanal = canales.map(canal => {
        return solicitudes.filter(s => {
            const sCanal = s.tipo || s.canal || 'Sin especificar';
            return sCanal === canal;
        }).length;
    });

    // Calcular déficit por canal (no atendidas)
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

    // Destruir gráfica anterior si existe
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

    // Actualizar el título de la gráfica
    const chartHeader = document.querySelector('#channelChart').closest('.chart-card').querySelector('.chart-header h5');
    if (chartHeader) {
        chartHeader.textContent = 'Solicitudes por Canal y Estado';
    }
}

// También modifica cargarSolicitudesVobo para que no aplique filtros automáticamente
function cargarSolicitudesVobo() {
    const userEmail = getCookie('email');

    // Verificar explícitamente si es Secretaría General
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

        // Ordenar por fecha de solicitud
        solicitudesVobo.sort((a, b) => new Date(b.fechaSolicitudVobo || b.fechaCreacion) - new Date(a.fechaSolicitudVobo || a.fechaCreacion));

        // Solo aplicar filtros si la sección de VoBo está visible
        const voboSection = document.getElementById('vobo-content');
        if (voboSection && voboSection.style.display !== 'none') {
            aplicarFiltrosVobo();
        }

        actualizarEstadisticasVobo(solicitudesVobo);

        // Actualizar también las estadísticas generales
        actualizarEstadisticas(solicitudesSeguimiento);
    });
}

function mostrarPaginaVobo(data) {
    const tabla = document.getElementById('lista-vobo');

    // Verificar que la tabla exista
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
        tabla.appendChild(tr);
    });

    actualizarPaginacionVobo(data.length);
}

function actualizarEstadisticasVobo(solicitudes) {
    // Verificar que los elementos existan antes de intentar actualizarlos
    const statsPendientesVobo = document.getElementById('stats-pendientes-vobo');
    const statsAprobadasHoy = document.getElementById('stats-aprobadas-hoy');
    const statsRechazadasHoy = document.getElementById('stats-rechazadas-hoy');

    // Si no existe ningún elemento, salir de la función
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

    // Actualizar solo los elementos que existen
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
    // Verificar que los elementos del DOM existan antes de acceder a ellos
    const busquedaInput = document.getElementById('busqueda-vobo');
    const secretariaSelect = document.getElementById('filtro-secretaria-vobo');
    const fechaSelect = document.getElementById('filtro-fecha-vobo');

    // Si los elementos no existen, salir de la función
    if (!busquedaInput || !secretariaSelect) {
        console.warn('Elementos de filtro VoBo no encontrados');
        return;
    }

    const busqueda = busquedaInput.value.toLowerCase();
    const secretaria = secretariaSelect.value;
    const fecha = fechaSelect ? fechaSelect.value : ''; // fechaSelect puede ser null

    const hoy = new Date();
    const filtradas = solicitudesVobo.filter(s => {
        const texto = `${s.folio} ${s.asunto} ${s.solicitante?.nombre || ''} ${s.solicitante?.colonia || ''}`.toLowerCase();
        const coincideSecretaria = !secretaria || s.dependencia === secretaria;

        // Filtro por fecha (solo si el elemento existe)
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

    // Verificar que el contenedor exista
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
        // Verificar que el usuario actual es Secretaría General
        const { esSecretariaGeneral } = obtenerFiltroEspecial();
        if (!esSecretariaGeneral) {
            mostrarError('No tienes permisos para aprobar VoBo');
            return;
        }

        // Buscar la solicitud en los datos locales
        const solicitudExistente = solicitudesVobo.find(s => s.key === folio);

        if (!solicitudExistente) {
            throw new Error('Solicitud no encontrada');
        }

        const docRef = ref(database, `solicitudes/${folio}`);
        const usuarioActual = getCookie('nombre') || 'Secretaría General';
        const fechaActual = new Date().toISOString();

        // Actualizar el estado a 'pendiente' y marcar VoBo como aprobado
        await update(docRef, {
            estado: 'pendiente',
            voboAprobado: true,
            voboSecretariaGeneral: usuarioActual,
            fechaVoboAprobado: fechaActual,
            ultimaActualizacion: fechaActual,
            comentariosVobo: `VoBo aprobado por ${usuarioActual} el ${new Date().toLocaleDateString()}`
        });

        // Actualizar datos locales
        const indexVobo = solicitudesVobo.findIndex(s => s.key === folio);
        if (indexVobo !== -1) {
            solicitudesVobo.splice(indexVobo, 1);
        }

        // Actualizar también en seguimiento si existe
        const indexSeguimiento = solicitudesSeguimiento.findIndex(s => s.key === folio);
        if (indexSeguimiento !== -1) {
            solicitudesSeguimiento[indexSeguimiento].estado = 'pendiente';
            solicitudesSeguimiento[indexSeguimiento].voboAprobado = true;
            solicitudesSeguimiento[indexSeguimiento].voboSecretariaGeneral = usuarioActual;
            solicitudesSeguimiento[indexSeguimiento].fechaVoboAprobado = fechaActual;
        }

        // Actualizar UI
        aplicarFiltrosVobo();
        if (typeof actualizarTablaSeguimiento === 'function') {
            actualizarTablaSeguimiento();
        }

        // ACTUALIZACIÓN: Actualizar estadísticas después de aprobar VoBo
        actualizarEstadisticas(solicitudesSeguimiento);

        mostrarExito(`VoBo aprobado para ${folio}. La solicitud ha sido turnada a la secretaría correspondiente.`);

    } catch (error) {
        console.error("Error al aprobar VoBo:", error);
        mostrarError(`Error al aprobar VoBo: ${error.message}`);
    }
};

window.rechazarVobo = async function (folio) {
    // Verificar que el usuario actual es Secretaría General
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

        // Marcar como rechazado y devolver a estado especial
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

        // Remover de la lista de VoBo
        const indexVobo = solicitudesVobo.findIndex(s => s.key === folio);
        if (indexVobo !== -1) {
            solicitudesVobo.splice(indexVobo, 1);
        }

        // Actualizar en seguimiento si existe
        const indexSeguimiento = solicitudesSeguimiento.findIndex(s => s.key === folio);
        if (indexSeguimiento !== -1) {
            solicitudesSeguimiento[indexSeguimiento].estado = 'rechazado_vobo';
            solicitudesSeguimiento[indexSeguimiento].voboAprobado = false;
            solicitudesSeguimiento[indexSeguimiento].voboRechazado = true;
            solicitudesSeguimiento[indexSeguimiento].motivoRechazoVobo = motivo;
        }

        // Actualizar UI
        aplicarFiltrosVobo();
        if (typeof actualizarTablaSeguimiento === 'function') {
            actualizarTablaSeguimiento();
        }

        // ACTUALIZACIÓN: Actualizar estadísticas después de rechazar VoBo
        actualizarEstadisticas(solicitudesSeguimiento);

        mostrarExito(`VoBo rechazado para ${folio}. La solicitud ha sido devuelta a Vinculación Ciudadana.`);

    } catch (error) {
        console.error("Error al rechazar VoBo:", error);
        mostrarError(`Error al rechazar VoBo: ${error.message}`);
    }
};

window.mostrarReenvioVobo = function (folio, motivoRechazo) {
    folioReenvioVobo = folio;

    // Mostrar el motivo de rechazo anterior
    document.getElementById('motivoRechazoAnterior').textContent =
        motivoRechazo || 'No se especificó motivo de rechazo.';

    // Limpiar el formulario
    document.getElementById('nuevoDocumentoVobo').value = '';
    document.getElementById('nuevoDocVoboInfo').textContent =
        'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
    document.getElementById('removeNuevoDocVobo').classList.add('d-none');
    document.getElementById('comentariosReenvio').value = '';

    new bootstrap.Modal(document.getElementById('reenviarVoboModal')).show();
};

// Event listener para el botón de confirmación
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

        // Si se subió un nuevo archivo, procesarlo
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

            // Subir nuevo documento
            const storagePath = `${folioReenvioVobo}/Documento Inicial/${nuevoArchivo.name}`;
            const docRef = storageRef(storage, storagePath);
            await uploadBytes(docRef, nuevoArchivo);
            nuevoDocumentoUrl = await getDownloadURL(docRef);
            nuevoNombreDocumento = nuevoArchivo.name;
        }

        // Preparar actualización
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

        // Si hay nuevo documento, actualizar la referencia
        if (nuevoDocumentoUrl) {
            actualizacion.documentoInicial = nuevoDocumentoUrl;
            actualizacion.nombreDocumento = nuevoNombreDocumento;
        }

        // Actualizar en Firebase
        await update(ref(database, `solicitudes/${folioReenvioVobo}`), actualizacion);

        // Actualizar datos locales
        const index = solicitudesSeguimiento.findIndex(s => s.key === folioReenvioVobo);
        if (index !== -1) {
            solicitudesSeguimiento[index] = {
                ...solicitudesSeguimiento[index],
                ...actualizacion
            };
        }

        // Cerrar modal y mostrar éxito
        bootstrap.Modal.getInstance(document.getElementById('reenviarVoboModal')).hide();
        mostrarExito('Solicitud reenviada a VoBo exitosamente.');

        // Actualizar UI
        actualizarTablaSeguimiento();

    } catch (error) {
        console.error('Error al reenviar a VoBo:', error);
        mostrarError(`Error al reenviar a VoBo: ${error.message}`);
    }
}

// Event listeners para el manejo del archivo en el modal de reenvío
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

// Limpiar el modal cuando se cierre
document.getElementById('reenviarVoboModal')?.addEventListener('hidden.bs.modal', () => {
    document.getElementById('nuevoDocumentoVobo').value = '';
    document.getElementById('nuevoDocVoboInfo').textContent = 'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
    document.getElementById('removeNuevoDocVobo').classList.add('d-none');
    document.getElementById('comentariosReenvio').value = '';
});

// Función para filtrar solicitudes de Vinculación Ciudadana (SOLO las que ellos enviaron)
function filtrarSoloVinculacionCiudadana(solicitudes) {
    const { esVinculacionCiudadana } = obtenerFiltroEspecial();
    const userEmail = obtenerEmailUsuario(); // ← USAR FUNCIÓN MEJORADA

    if (!esVinculacionCiudadana) {
        return solicitudes;
    }

    return solicitudes.filter(solicitud => {
        // Verificar múltiples campos donde podría estar almacenado el creador
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
        // return 'usuario@tizayuca.gob.mx'; // Valor por defecto seguro
    }
    return email;
}

// Función para obtener el nombre del usuario de forma segura
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
    
    // Si es el perfil de Esmeralda Merchan, excluir solicitudes de Vinculación Ciudadana
    if (esSecretariaParticular && userEmail === 'oficinadepresidencia@tizayuca.gob.mx') {
        return solicitudes.filter(solicitud => {
            // Excluir si el canal es "Vinculación Ciudadana"
            if (solicitud.tipo === 'Vinculación Ciudadana') {
                return false;
            }
            // Excluir si fue creada por Vinculación Ciudadana
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