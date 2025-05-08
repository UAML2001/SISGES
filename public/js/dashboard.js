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
    typeChart: null,    // <- Ya existía
    trendChart: null,   // <- Añadir estos
    statusChart: null,  // <- 
    efficiencyChart: null,
    departmentChart: null
};


let tipoActual = ''; // ← Agregar esta línea

let solicitudesSeguimiento = [];
let solicitudesValidadas = [];
let solicitudesVerificacion = [];
const itemsPerPage = 5;
let currentPageSeguimiento = 1;
let currentPageValidadas = 1;
let currentVerificacion = [];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

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


let suppressFileInputEvents = false;

window.mostrarModalEstado = function(folio) {
    document.getElementById('modalFolio').textContent = folio;
    new bootstrap.Modal('#statusModal').show();
};

window.cambiarEstadoModal = function(nuevoEstado) {
    const folio = document.getElementById('modalFolio').textContent;
    cambiarEstado(folio, nuevoEstado);
};

// Funciones utilitarias con zona horaria UTC-6 (México)
function calcularFechaLimite(fechaCreacion) {
    const offsetMexico = -6 * 60;
    const fechaBase = new Date(fechaCreacion);
    fechaBase.setMinutes(fechaBase.getMinutes() + fechaBase.getTimezoneOffset() + offsetMexico);
    const fechaLimite = new Date(fechaBase);
    fechaLimite.setDate(fechaLimite.getDate() + 15);
    return fechaLimite.toISOString();
}

function calcularDiasRestantes(fechaLimite) {
    const offsetMexico = -6 * 60;
    const ahora = new Date();
    
    const ajustarHoraMexico = (fecha) => {
        const nuevaFecha = new Date(fecha);
        nuevaFecha.setMinutes(nuevaFecha.getMinutes() + nuevaFecha.getTimezoneOffset() + offsetMexico);
        return nuevaFecha;
    };

    const ahoraMexico = ajustarHoraMexico(ahora);
    const limiteMexico = ajustarHoraMexico(new Date(fechaLimite));
    const diferencia = limiteMexico - ahoraMexico;

    return Math.floor(diferencia / (1000 * 60 * 60 * 24));
}

function calcularTiempoRestante(fechaLimite) {
    const offsetMexico = -6 * 60;
    const ahora = new Date();
    
    const ajustarHoraMexico = (fecha) => {
        const nuevaFecha = new Date(fecha);
        nuevaFecha.setMinutes(nuevaFecha.getMinutes() + nuevaFecha.getTimezoneOffset() + offsetMexico);
        return nuevaFecha;
    };

    const ahoraMexico = ajustarHoraMexico(ahora);
    const limiteMexico = ajustarHoraMexico(new Date(fechaLimite));
    const diferencia = limiteMexico - ahoraMexico;

    if (diferencia < 0) return 'Expirado';

    const segundos = Math.floor(diferencia / 1000);
    const minutos = Math.floor(segundos / 60) % 60;
    const horas = Math.floor(segundos / 3600) % 24;
    const dias = Math.floor(segundos / 86400);

    return `${dias} días ${horas} hrs ${minutos.toString().padStart(2, '0')} min`;
}

function obtenerFechaHoy() {
    const ahora = new Date();
    const offsetMexico = -6 * 60;
    ahora.setMinutes(ahora.getMinutes() + ahora.getTimezoneOffset() + offsetMexico);
    return ahora.toISOString().split('T')[0];
}

// Funciones de Firebase
async function generarFolio(tipo = 'solicitud') {
    const tipoFolio = {
        'acuerdo': 'ultimoFolioAcuerdo',
        'oficio': 'ultimoFolioOficio',
        'solicitud': 'ultimoFolio'
    };
    
    const prefijos = {
        'acuerdo': 'AG-',
        'oficio': 'OF-',
        'solicitud': 'SO-'
    };
    
    const folioRef = ref(database, `configuracion/${tipoFolio[tipo]}`);
    const snapshot = await get(folioRef);
    const nuevoFolio = (snapshot.val() || 0) + 1;
    await set(folioRef, nuevoFolio);
    return `${prefijos[tipo]}${nuevoFolio.toString().padStart(4, '0')}`;
}

// Función para cargar solicitudes validadas
function cargarValidadas() {
    const tabla = document.getElementById('lista-validadas');
    const filtroSecretaria = document.getElementById('filtro-secretaria-validadas');
    const paths = ['solicitudes', 'acuerdos', 'oficios'];
    
    const userRol = parseInt(getCookie('rol')) || 0;
    const userDependencias = getCookie('dependencia') ? 
        decodeURIComponent(getCookie('dependencia')).split(',') : [];

    // Configurar filtro de secretarías
    if (userRol === 3) {
        filtroSecretaria.style.display = 'block';
        filtroSecretaria.innerHTML = '<option value="">Todas las secretarías</option>';
        
        Object.entries(dependenciasMap).forEach(([key, nombre]) => {
            if (nombre && nombre.trim() !== '') {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = nombre;
                filtroSecretaria.appendChild(option);
            }
        });
    } else {
        filtroSecretaria.style.display = 'none';
    }

    solicitudesValidadas = [];

    paths.forEach(path => {
        let q;
        if (userRol === 3) {
            q = query(
                ref(database, path),
                orderByChild('estado'),
                equalTo('atendida')
            );
        } else {
            // Filtrar por cada dependencia del usuario
            userDependencias.forEach(dependencia => {
                q = query(
                    ref(database, path),
                    orderByChild('dependencia'),
                    equalTo(dependencia)
                );
            });
        }

        onValue(q, (snapshot) => {
            snapshot.forEach((childSnapshot) => {
                const documento = childSnapshot.val();
                documento.key = childSnapshot.key;
                documento.tipo = path === 'solicitudes' ? 'Solicitud' 
                               : path === 'acuerdos' ? 'Acuerdo' 
                               : 'Oficio';

                // Filtrar por dependencia si no es admin
                if (userRol !== 3 && !userDependencias.includes(documento.dependencia)) return;

                if (!solicitudesValidadas.find(s => s.key === documento.key)) {
                    solicitudesValidadas.push(documento);
                }
            });
            
            solicitudesValidadas.sort((a, b) => 
                new Date(b.fechaAtencion) - new Date(a.fechaAtencion)
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
            <td colspan="6" class="text-center py-4">
                <i class="fas fa-info-circle me-2"></i>
                No hay solicitudes validadas para mostrar
            </td>
        `;
        tabla.appendChild(tr);
        actualizarPaginacion('validadas', 0);
        return;
    }
    
    const items = data.slice(start, end);
    
    items.forEach(solicitud => { // Cambiar 'doc' por 'solicitud'
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${solicitud.key}</td>
            <td>${solicitud.tipo}</td>
            <td>${solicitud.asunto}</td>
            <td>${dependenciasMap[solicitud.dependencia] || 'Desconocida'}</td>
            <td>${new Date(solicitud.fechaAtencion).toLocaleDateString()}</td>
            <td>
                ${solicitud.documentoInicial ? `
                <button class="btn btn-sm btn-documento-inicial" 
                        onclick="mostrarEvidenciaModal(
                            '${solicitud.key}',
                            'Documento Inicial',
                            '${solicitud.documentoInicial}',
                            '${solicitud.tipo}'
                        )">
                    <i class="fas fa-file-import me-2"></i> Documento Inicial
                </button>
                ` : ''}
                
                ${solicitud.evidencias ? `
                <button class="btn btn-sm btn-evidencia" 
                        onclick="mostrarEvidenciaModal(
                            '${solicitud.key}',
                            'Evidencia',
                            '${solicitud.evidencias}',
                            '${solicitud.tipo}'
                        )">
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
    
    const filtradas = solicitudesValidadas.filter(doc => {
        const texto = `${doc.key} ${doc.asunto} ${dependenciasMap[doc.dependencia]} ${doc.tipo}`.toLowerCase();
        const coincideSecretaria = !secretaria || doc.dependencia === secretaria;
        return texto.includes(busqueda) && coincideSecretaria;
    });
    
    mostrarPaginaValidadas(filtradas);
}

function aplicarFiltrosSeguimiento() {
    const busqueda = document.getElementById('busqueda-seguimiento').value.toLowerCase();
    const estado = document.getElementById('filtro-estado-seguimiento').value;
    
    const filtradas = solicitudesSeguimiento.filter(s => {
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
    const selects = ['secretaria', 'secretariaAcuerdo', 'secretariaOficio'];
    
    // Obtener datos del usuario
    const userRol = parseInt(getCookie('rol')) || 0;
    const userDependencias = getCookie('dependencia') ? 
        decodeURIComponent(getCookie('dependencia')).split(',') : [];
    
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            select.innerHTML = '<option value="" disabled selected>Seleccione una secretaría</option>';

    snapshot.forEach((childSnapshot) => {
        const dependencia = childSnapshot.val();
        const dependenciaKey = childSnapshot.key;
        
        // Validar existencia de la dependencia y su nombre
        if (!dependencia || typeof dependencia.nombre !== 'string') return;
        
        // Filtrar por rol
        if (userRol !== 3 && !userDependencias.includes(dependenciaKey)) return;
        
        // Validar nombre no vacío
        const nombre = dependencia.nombre.trim();
        if (!nombre) return;
        
        // Crear opción válida
        const option = document.createElement('option');
        option.value = dependenciaKey;
        option.textContent = nombre;
        select.appendChild(option);
    });
});
}

window.mostrarEvidenciaModal = function(folio, tipoDocumento, urlDocumento, secretaria = '') {
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
    
    if(urlDocumento) {
        try {
            nombreArchivo = decodeURIComponent(urlDocumento.split('/').pop().split('?')[0]);
            extension = nombreArchivo.split('.').pop().toLowerCase();
        } catch(error) {
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

        if(!urlDocumento) {
            visorNoSoportado.classList.remove('d-none');
            document.getElementById('tipoArchivo').textContent = 'Documento no disponible';
            return;
        }

        if(['pdf'].includes(extension)) {
            pdfContainer.classList.remove('d-none');
            pdfViewer.src = `${urlDocumento}#view=FitH&toolbar=0`;
            document.getElementById('pdfMeta').textContent = `${nombreArchivo} | ${tipoDocumento}`;
        } 
        else if(['jpg', 'jpeg', 'png'].includes(extension)) {
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

let intervaloActualizacion;

function iniciarActualizacionTiempo() {
    if (intervaloActualizacion) clearInterval(intervaloActualizacion);
    
    intervaloActualizacion = setInterval(() => {
        document.querySelectorAll('#lista-seguimiento tr').forEach(fila => {
            const estado = fila.dataset.estado;
            const celdaTiempo = fila.cells[4];
            
            if(estado === 'atendida') {
                celdaTiempo.textContent = 'Atendida';
            } else {
                const fechaLimite = fila.dataset.fechaLimite;
                celdaTiempo.textContent = calcularTiempoRestante(fechaLimite);
            }
        });
    }, 60000);
}

function actualizarEstadisticas(solicitudes) {
    const stats = {
        pendientes: 0,
        porVencer: 0,
        enProceso: 0,
        verificacion: 0, // Asegurar que esta propiedad existe
        atendidas: 0,
        atrasadas: 0,
        total: 0
    };

    solicitudes.forEach(s => {
        stats.total++;
        const fechaCreacion = new Date(s.fechaCreacion);
        
        // Calcular días restantes para estados relevantes
        const diasRest = calcularDiasRestantes(s.fechaLimite);
        
        switch(s.estado) {
            case 'pendiente':
                stats.pendientes++;
                if(diasRest <= 3) stats.porVencer++;
                break;
            case 'en_proceso':
                stats.enProceso++;
                break;
            case 'verificacion': // Nuevo caso
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

    // Actualizar DOM
    document.getElementById('stats-pendientes').textContent = stats.pendientes;
    document.getElementById('stats-vencer').textContent = stats.porVencer;
    document.getElementById('stats-en-proceso').textContent = stats.enProceso;
    document.getElementById('stats-verificacion').textContent = stats.verificacion; // Asegurar este elemento
    document.getElementById('stats-atendidas').textContent = stats.atendidas;
    document.getElementById('stats-atrasadas').textContent = stats.atrasadas;
    
    const eficiencia = (stats.atendidas / (stats.total || 1)) * 100;
    document.getElementById('stats-eficiencia').textContent = `${Math.round(eficiencia)}%`;
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

window.cambiarEstado = async function(folio, nuevoEstado) {
    try {
        // 1. Buscar en datos locales primero para optimizar
        const solicitudExistente = solicitudesSeguimiento.find(s => s.key === folio);
        
        if (!solicitudExistente) {
            throw new Error('Documento no encontrado en datos locales');
        }

        // 2. Determinar path directamente desde los datos locales
        const path = solicitudExistente.tipoPath || 'solicitudes';
        const docRef = ref(database, `${path}/${folio}`);
        const tipoDocumento = path === 'solicitudes' ? 'Solicitud' 
                           : path === 'acuerdos' ? 'Acuerdo' 
                           : 'Oficio';

        // 3. Obtener datos actualizados directamente de Firebase
        const snapshot = await get(docRef);
        const datos = snapshot.val();

        // 4. Manejo de evidencias con validación mejorada
        if (nuevoEstado === 'pendiente' && datos.evidencias) {
            try {
                const urlObj = new URL(datos.evidencias);
                const pathStorage = decodeURIComponent(urlObj.pathname)
                                  .split('/o/')[1]
                                  .split('?')[0];
                
                const evidenciaRef = storageRef(storage, pathStorage);
                await deleteObject(evidenciaRef);
            } catch (error) {
                console.error("Error eliminando evidencia:", error);
                if (error.code !== 'storage/object-not-found') {
                    throw new Error('Error al eliminar archivo adjunto');
                }
            }
        }

        // 5. Preparar actualización optimizada
        const actualizacion = {
            estado: nuevoEstado,
            ultimaActualizacion: new Date().toISOString(),
            evidencias: nuevoEstado === 'pendiente' ? null : datos.evidencias || null
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
                ...actualizacion
            };
            
            // Actualizar UI específica
            if (typeof actualizarTablaSeguimiento === 'function') {
                actualizarTablaSeguimiento();
            } else {
                console.error('Función actualizarTablaSeguimiento no definida');
            }
            
            cargarVerificacion(); // Solo necesario para tablas relacionadas
            cargarValidadas();    // Solo necesario para tablas relacionadas
        }

        // 9. Mensajes de éxito contextuales
        const mensajes = {
            'en_proceso': `${tipoDocumento} marcada en proceso`,
            'verificacion': `${tipoDocumento} enviada a verificación`,
            'atendida': `${tipoDocumento} aprobada exitosamente`,
            'pendiente': `${tipoDocumento} rechazada y reiniciada`
        };

        if (mensajes[nuevoEstado]) {
            mostrarExito(mensajes[nuevoEstado]);
        }

    } catch (error) {
        console.error("Error completo:", error);
        const mensajeError = error.code === 'storage/object-not-found' 
                           ? 'El archivo adjunto no fue encontrado'
                           : error.message.startsWith('Error al eliminar') 
                           ? error.message 
                           : 'Error al actualizar el documento';
        
        mostrarError(mensajeError);
    } finally {
        folioActual = '';
        accionActual = '';
    }
};

document.getElementById('confirmarAprobar').addEventListener('click', async () => {
    if (folioActual) {
        await cambiarEstado(folioActual, 'atendida');
        bootstrap.Modal.getInstance('#confirmarAprobarModal').hide();
    }
});

document.getElementById('confirmarRechazar').addEventListener('click', async () => {
    if (folioActual) {
        await cambiarEstado(folioActual, 'pendiente');
        bootstrap.Modal.getInstance('#confirmarRechazarModal').hide();
    }
});

// // Configurar eventos para los modales
// document.getElementById('confirmarAprobar').addEventListener('click', () => {
//     if(folioActual && accionActual === 'aprobar') {
//         cambiarEstado(folioActual, 'atendida');
//         bootstrap.Modal.getInstance('#confirmarAprobarModal').hide();
//     }
// });

// document.getElementById('confirmarRechazar').addEventListener('click', () => {
//     if(folioActual && accionActual === 'rechazar') {
//         cambiarEstado(folioActual, 'pendiente');
//         bootstrap.Modal.getInstance('#confirmarRechazarModal').hide();
//     }
// });

// Modifica el event listener del input de archivo
document.getElementById('evidenciaFile').addEventListener('change', function(e) {
    const fileInfo = document.getElementById('fileInfo');
    const removeBtn = document.getElementById('removeFile');
    
    if(this.files.length > 0) {
        const file = this.files[0];
        const extension = file.name.split('.').pop().toLowerCase();
        
        // Validar extensión
        if(!ALLOWED_EXTENSIONS.includes(extension)) {
            mostrarError(`Formato no permitido: .${extension}`);
            this.value = '';
            fileInfo.textContent = 'Formatos permitidos: .pdf, .jpg, .jpeg, .png, .zip, .rar (Máx. 10MB)';
            removeBtn.classList.add('d-none');
            return;
        }
        
        // Validar tamaño
        if(file.size > MAX_FILE_SIZE_BYTES) {
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
window.subirEvidenciaYCambiarEstado = async function() {
    const fileInput = document.getElementById('evidenciaFile');
    const file = fileInput.files[0];
    const tipo = folioActual.startsWith('AG-') ? 'acuerdos' : 
                folioActual.startsWith('OF-') ? 'oficios' : 'solicitudes';
    
    if (!file) {
        mostrarError("Debes seleccionar un archivo primero");
        return;
    }

    // Validar extensión nuevamente (por si el usuario modificó el input)
    const extension = file.name.split('.').pop().toLowerCase();
    if(!ALLOWED_EXTENSIONS.includes(extension)) {
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
    const paths = ['solicitudes', 'acuerdos', 'oficios'];
    solicitudesVerificacion = [];

    const userRol = parseInt(getCookie('rol')) || 0;
    const userDependencias = getCookie('dependencia') ? 
        decodeURIComponent(getCookie('dependencia')).split(',') : [];

    paths.forEach(path => {
        let q;
        if (userRol === 3) {
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

        onValue(q, (snapshot) => {
            solicitudesVerificacion = solicitudesVerificacion.filter(s => s.tipo !== path);
            
            snapshot.forEach(childSnapshot => {
                const solicitud = childSnapshot.val();
                if (userRol !== 3 && !userDependencias.includes(solicitud.dependencia)) return;
                if (solicitud.estado !== 'verificacion') return;

                solicitud.key = childSnapshot.key;
                solicitud.tipo = path;
                solicitud.folio = solicitud.folio || childSnapshot.key;
                solicitudesVerificacion.push(solicitud);
            });
            
            mostrarPaginaVerificacion(solicitudesVerificacion);
        });
    });
}

function mostrarPaginaVerificacion(data) {
    const tabla = document.getElementById('lista-verificacion');
    tabla.innerHTML = '';

    // Mostrar mensaje si no hay registros
    if (data.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="7" class="text-center py-4">
                <i class="fas fa-info-circle me-2"></i>
                No hay solicitudes por verificar
            </td>
        `;
        tabla.appendChild(tr);
        return;
    }

    // Crear filas si hay datos
    data.forEach(solicitud => {
        const tipoDocumento = solicitud.tipo === 'solicitudes' ? 'Solicitud' :
                            solicitud.tipo === 'acuerdos' ? 'Acuerdo de Gabinete' : 
                            'Oficio';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${solicitud.folio}</td>
            <td>${solicitud.asunto}</td>
            <td>${tipoDocumento}</td>
            <td>${dependenciasMap[solicitud.dependencia] || 'Desconocida'}</td>
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
                        onclick="mostrarConfirmacion('${solicitud.folio}', 'aprobar', '${solicitud.tipo}')">
                        <i class="fas fa-check me-1"></i> Aprobar
                    </button>
                    
                    <button class="btn btn-danger btn-sm btn-rechazar" 
                        onclick="mostrarConfirmacion('${solicitud.folio}', 'rechazar', '${solicitud.tipo}')">
                        <i class="fas fa-times me-1"></i> Rechazar
                    </button>
                </div>
            </td>
        `;
        tabla.appendChild(tr);
    });
}

window.mostrarConfirmacion = function(folio, accion, tipo) {
    folioActual = folio;
    accionActual = accion;
    tipoActual = tipo;
    
    const modalId = accion === 'aprobar' 
        ? '#confirmarAprobarModal' 
        : '#confirmarRechazarModal';
    
    new bootstrap.Modal(document.querySelector(modalId)).show();
};

// Evento modificado para cambio de archivo
document.getElementById('documentoInicial').addEventListener('change', function(e) {
    if (suppressFileInputEvents) return;
    
    const fileInfo = document.getElementById('docInicialInfo');
    const removeBtn = document.getElementById('removeDocInicial');
    
    if(this.files.length > 0) {
        const file = this.files[0];
        const extension = file.name.split('.').pop().toLowerCase();
        
        if(!ALLOWED_INITIAL_EXTENSIONS.includes(extension)) {
            mostrarError(`Formato no permitido: .${extension}`);
            this.value = '';
            fileInfo.textContent = 'Formatos permitidos: PDF, JPG, PNG, ZIP, RAR (Máx. 10MB)';
            removeBtn.classList.add('d-none');
            return;
        }
        
        if(file.size > MAX_INITIAL_FILE_SIZE_BYTES) {
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

const estados = {
    'pendiente': {texto: 'Pendiente', color: '#491F42'},
    'por_vencer': {texto: 'Por Vencer', color: '#720F36'},
    'en_proceso': {texto: 'En Proceso', color: '#ae9074'},
    'verificacion': { texto: 'En Verificación', color: '#FFA500' }, // Añadir esta línea
    'atendida': {texto: 'Atendida', color: '#2E7D32'},
    'atrasada': {texto: 'Atrasada', color: '#a90000'}
};

// Modificar función crearFilaSolicitud
function crearFilaSolicitud(solicitud) {
    const tr = document.createElement('tr');
    tr.dataset.fechaLimite = solicitud.fechaLimite;
    tr.dataset.estado = solicitud.estado;
    const estadoActual = solicitud.estado;

    const nombresTipos = {
        'acuerdo': 'Acuerdo de Gabinete',
        'oficio': 'Oficio',
        'solicitud': 'Solicitud'
    };

    // Modificar la línea donde se obtiene el estado
    const estado = estados[solicitud.estado] || { texto: 'Desconocido', color: '#666' } 
    const dependenciaNombre = dependenciasMap[solicitud.dependencia] || 'Desconocida';
    // Determinar si está en verificación
    const enVerificacion = estadoActual === 'verificacion';

    tr.innerHTML = `
        <td>${solicitud.folio}</td>
        <td>${nombresTipos[solicitud.tipo] || solicitud.tipo}</td>
        <td>${solicitud.asunto}</td>
        <td>${dependenciasMap[solicitud.dependencia] || 'Desconocida'}</td>
        <td><span class="status-badge" style="background:${estado.color}">${estado.texto}</span></td>
        <td>${solicitud.estado === 'atendida' ? 'Atendida' : calcularTiempoRestante(solicitud.fechaLimite)}</td>
        <td>
            <div class="d-flex gap-2">
                ${solicitud.documentoInicial ? `
                    <button class="btn btn-sm btn-documento" 
                            onclick="mostrarDocumentoInicial('${solicitud.folio}', '${solicitud.nombreDocumento}', '${solicitud.documentoInicial}')">
                        <i class="fas fa-file-alt me-1"></i>Documento Inicial
                    </button>
                ` : ''}
                <button class="btn btn-sm btn-proceso" 
                    ${solicitud.estado === 'verificacion' ? 'disabled' : ''}
                    onclick="mostrarConfirmacionProceso('${solicitud.folio}')">
                    <i class="fas fa-sync-alt"></i> ${solicitud.estado === 'en_proceso' ? 'En Proceso' : 'Marcar Proceso'}
                </button>
                
                <button class="btn btn-sm btn-verificacion" 
                    ${solicitud.estado === 'verificacion' ? 'disabled' : ''}
                    onclick="mostrarConfirmacionAtendida('${solicitud.folio}')">
                    <i class="fas fa-check-circle"></i> ${solicitud.estado === 'verificacion' ? 'En Verificación' : 'Mandar a Verificación'}
                </button>
            </div>
        </td>
    `;
    // Añadir estilo visual para deshabilitado
    tr.querySelectorAll('button[disabled]').forEach(btn => {
        btn.style.opacity = '0.6';
        btn.style.cursor = 'not-allowed';
    });
    
    return tr;
}

window.mostrarDocumentoInicial = function(folio, nombreArchivo, url, secretariaOrigen) {
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
    document.getElementById('visorImagen').onclick = function() {
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

// Función actualizada para actualizar estados automáticos
async function actualizarEstadosAutomaticos() {
    const ahora = new Date();
    const updates = {};

    solicitudesSeguimiento.forEach((solicitud, index) => {
        if (['atendida', 'en_proceso'].includes(solicitud.estado)) return;

        const dias = calcularDiasRestantes(solicitud.fechaLimite);
        let nuevoEstado = solicitud.estado;
        
        if (dias < 0) {
            nuevoEstado = 'atrasada';
        } else if (dias <= 3) {
            nuevoEstado = 'por_vencer';
        }
        
        if (nuevoEstado !== solicitud.estado) {
            // Actualizar tanto en Firebase como localmente
            updates[`${solicitud.tipoPath}/${solicitud.key}/estado`] = nuevoEstado;
            solicitudesSeguimiento[index].estado = nuevoEstado;
        }
    });
    
    if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
        actualizarTablaSeguimiento();
    }
}

// Ejecutar cada hora y al cargar la página
setInterval(actualizarEstadosAutomaticos, 3600000);
document.addEventListener('DOMContentLoaded', actualizarEstadosAutomaticos);

function cargarSeguimiento() {
    const tabla = document.getElementById('lista-seguimiento');
    const paths = ['solicitudes', 'acuerdos', 'oficios'];
    const userRol = parseInt(getCookie('rol')) || 0;
    const userDependencias = getCookie('dependencia') ? 
        decodeURIComponent(getCookie('dependencia')).split(',') : [];

    // Limpiar listeners anteriores
    paths.forEach(path => {
        const refPath = ref(database, path);
        onValue(refPath, () => {});
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
                        solicitud.tipoPath = path;
                        datos.push(solicitud);
                    });
                    resolve(datos);
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
                            datos.push(solicitud);
                        });
                        resolve(datos);
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
            solicitudesSeguimiento = mergedData;
            actualizarTablaSeguimiento();
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
    
    // Validar campos requeridos
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

        // Crear objeto de solicitud
        const fechaCreacion = new Date().toISOString();
        const nuevaSolicitud = {
            fechaCreacion: fechaCreacion,
            tipo: document.getElementById('canal').value,
            tiposolicitud: document.getElementById('receptor').value,
            dependencia: document.getElementById('secretaria').value,
            estado: 'pendiente',
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
            folio: folio
        };

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
        
        mostrarExito("Solicitud creada exitosamente!");
        
    } catch (error) {
        console.error("Error al guardar:", error);
        mostrarError(`Error al crear la solicitud: ${error.message}`);
    }
});

// Buscador en Verificación
document.getElementById('busqueda-verificacion').addEventListener('input', function () {
    const termino = this.value.toLowerCase();
    const filtradas = solicitudesVerificacion.filter(s =>
        s.key.toLowerCase().includes(termino) ||
        s.asunto.toLowerCase().includes(termino)
    );
    mostrarPaginaVerificacion(filtradas);
});

// Añadir al inicio con las constantes
const coloresEstatus = {
    pendiente: '#491F42',
    vencer: '#720F36',
    en_progreso: '#ae9074',
    atendida: '#2E7D32',
    atrasado: '#a90000',
    verificacion : '#FFA500'
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
        if(solicitud.tipo) tiposUnicos.add(solicitud.tipo);
    });
    return Array.from(tiposUnicos);
}

function actualizarGrafica(solicitudes) {
    const tiposSolicitud = obtenerTiposSolicitud(solicitudes);
    
    // Corregir estructura de datos para coincidir con los estados reales
    const datos = {
        pendiente: new Array(tiposSolicitud.length).fill(0),
        por_vencer: new Array(tiposSolicitud.length).fill(0),
        en_proceso: new Array(tiposSolicitud.length).fill(0),
        atrasada: new Array(tiposSolicitud.length).fill(0),
        atendida: new Array(tiposSolicitud.length).fill(0),
        verificacion : new Array(tiposSolicitud.length).fill(0)
    };

    solicitudes.forEach(solicitud => {
        const index = tiposSolicitud.indexOf(solicitud.tipo);
        if(index === -1) return;

        // Usar directamente el estado de la solicitud
        if(datos.hasOwnProperty(solicitud.estado)) {
            datos[solicitud.estado][index]++;
        }
    });

    const ctx = document.getElementById('mainChart').getContext('2d');
    
    // Destruir gráfica anterior si existe
    if(charts.mainChart) {
        charts.mainChart.destroy();
    }

    // Actualizar colores según la paleta proporcionada
    const coloresEstatus = {
        pendiente: '#491F42',
        por_vencer: '#720F36',
        en_proceso: '#ae9074',
        atendida: '#2E7D32',
        atrasada: '#a90000',
        verificacion: '#FFA500'
    };

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

document.getElementById('filtro-secretaria-validadas').addEventListener('change', () => {
    currentPageValidadas = 1;
    aplicarFiltrosValidadas();
});

document.getElementById('confirmarAtendidaModal').addEventListener('hidden.bs.modal', () => {
    const fileInput = document.getElementById('evidenciaFile');
    fileInput.value = '';
    fileInput.dispatchEvent(new Event('change'));
});

// Sistema de navegación y UI
document.addEventListener('DOMContentLoaded', async function () {
    checkSession();
    showUserInfo();
    setupLogout();
    
    // Cargar primero las dependencias
    await cargarDependencias();
    
    // Luego cargar otros componentes
    cargarSecretarias();
    cargarSeguimiento();
    cargarValidadas(); // Nueva línea
    cargarVerificacion();

    // Obtener rol del usuario
    const role = parseInt(getCookie('rol')) || 0;
    const userDependencias = getCookie('dependencia') ? 
    decodeURIComponent(getCookie('dependencia')).split(',') : [];

    // Ocultar/mostrar pestañas según rol
    const nuevaLi = document.querySelector('a[data-content="nueva"]').parentElement;
    const seguimientoLi = document.querySelector('a[data-content="seguimiento"]').parentElement;
    const validadasLi = document.querySelector('a[data-content="validadas"]').parentElement;
    const verificacionLi = document.querySelector('a[data-content="verificacion"]').parentElement;
    const navacuerdos = document.querySelector('a[data-content="acuerdo"]').parentElement;
    const navoficios = document.querySelector('a[data-content="oficio"]').parentElement;

    switch (role) {
        case 1:
            nuevaLi.style.display = userDependencias.length > 0 ? 'block' : 'none';
            seguimientoLi.style.display = 'block';
            validadasLi.style.display = 'none';
            verificacionLi.style.display = 'none';
            navacuerdos.style.display = 'none';
            navoficios.style.display = 'none';
            break;
        case 2:
            nuevaLi.style.display = 'none';
            seguimientoLi.style.display = 'block';
            validadasLi.style.display = 'block';
            verificacionLi.style.display = 'none';
            navacuerdos.style.display = 'none';
            navoficios.style.display = 'none';
            break;
        case 3:
            // Todas visibles por defecto
            break;
        default:
            nuevaLi.style.display = 'none';
            seguimientoLi.style.display = 'none';
            validadasLi.style.display = 'none';
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
    `;

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
        }
    }
    
    // Event listeners para los navLinks
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const contentId = this.getAttribute('data-content');
            navLinks.forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            switchTab(contentId);
        });
    });
});

// Funciones de autenticación
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

function checkSession() {
    const sessionCookie = getCookie('session');
    const expiresCookie = getCookie('expires');

    if (!sessionCookie || !expiresCookie) {
        window.location.href = 'index.html';
        return;
    }

    const now = new Date();
    const expirationDate = new Date(expiresCookie);

    if (now > expirationDate) {
        window.location.href = 'index.html';
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
        document.cookie.split(";").forEach(cookie => {
            document.cookie = cookie.replace(/^ +/, "")
                .replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`);
        });

        logoutModal.hide();
        setTimeout(() => window.location.href = 'index.html', 300);
    });
}

let folioActual = '';

window.mostrarConfirmacionProceso = function(folio) {
    folioActual = folio;
    new bootstrap.Modal('#confirmarProcesoModal').show();
};

window.mostrarConfirmacionAtendida = function(folio) {
    folioActual = folio;
    new bootstrap.Modal('#confirmarAtendidaModal').show();
};

window.confirmarCambioEstado = function(nuevoEstado) {
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
        const prefix = 'Acuerdo';
        
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

        // Crear objeto Acuerdo
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
            folio: folio
        };

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
            folio: folio
        };

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
    const ALLOWED_EXT = ['pdf','jpg', 'jpeg', 'png', 'zip', 'rar'];
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
}

// Configurar eventos para los documentos
['Acuerdo', 'Oficio'].forEach(tipo => {
    const docInput = document.getElementById(`documento${tipo}`);
    const removeBtn = document.getElementById(`removeDoc${tipo}`);
    const docInfo = document.getElementById(`doc${tipo}Info`);

    docInput.addEventListener('change', function(e) {
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
    
    // Mostrar módulos solo para rol 3
    const role = parseInt(getCookie('rol'));
    if (role === 3) {
        document.getElementById('navAcuerdo').style.display = 'block';
        document.getElementById('navOficio').style.display = 'block';
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
document.getElementById('documentoAcuerdo').addEventListener('change', function(e) {
    validarArchivoInput(this, 'Acuerdo');
});

// Configurar validación en tiempo real para Oficios
document.getElementById('documentoOficio').addEventListener('change', function(e) {
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
    actualizarGraficaPrincipal(solicitudes);
    actualizarGraficaTipos(solicitudes);
    actualizarGraficaTendencias(solicitudes);
    actualizarGraficaEstatus(solicitudes);
    actualizarEficienciaDepartamentos(solicitudes);
    actualizarTiemposRespuesta(solicitudes);
}

function actualizarGraficaPrincipal(solicitudes) {
    // Mantén tu código existente de actualizarGrafica
}

function actualizarGraficaTipos(solicitudes) {
    const tipos = {
        'Solicitud': 0,
        'Acuerdo': 0,
        'Oficio': 0
    };

    solicitudes.forEach(s => {
        tipos[s.tipo] = (tipos[s.tipo] || 0) + 1;
    });

    if (charts.typeChart) charts.typeChart.destroy();
    
    const ctx = document.getElementById('typeChart').getContext('2d');
    charts.typeChart = new Chart(ctx, { // <-- Usar charts.typeChart
        type: 'pie',
        data: {
            labels: Object.keys(tipos),
            datasets: [{
                data: Object.values(tipos),
                backgroundColor: [
                    '#491F42',
                    '#2E7D32',
                    '#ae9074'
                ],
                borderWidth: 0
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

function actualizarGraficaTendencias(solicitudes) {
    const meses = Array.from({length: 12}, (_, i) => {
        const date = new Date();
        date.setMonth(i);
        return date.toLocaleString('es-MX', {month: 'short'});
    });

    const datos = Array(12).fill(0);
    
    solicitudes.forEach(s => {
        const mes = new Date(s.fechaCreacion).getMonth();
        datos[mes]++;
    });

    if (charts.trendChart) charts.trendChart.destroy();
    
    const ctx = document.getElementById('trendChart').getContext('2d');
    charts.trendChart = new Chart(ctx, { // <-- Usar charts.trendChart
        type: 'line',
        data: {
            labels: meses,
            datasets: [{
                label: 'Solicitudes por Mes',
                data: datos,
                borderColor: '#491F42',
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(73,31,66,0.05)'
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
            }
        }
    });
}

function actualizarGraficaEstatus(solicitudes) {
    const estatus = {
        'pendiente': 0,
        'en_proceso': 0,
        'verificacion': 0,
        'atendida': 0,
        'atrasada': 0
    };

    solicitudes.forEach(s => estatus[s.estado]++);

    if (charts.statusChart) charts.statusChart.destroy();
    
    const ctx = document.getElementById('statusChart').getContext('2d');
    charts.statusChart = new Chart(ctx, { // <-- Usar charts.statusChart
        type: 'doughnut',
        data: {
            labels: Object.keys(estatus),
            datasets: [{
                data: Object.values(estatus),
                backgroundColor: [
                    '#491F42',
                    '#720F36',
                    '#FFA500',
                    '#2E7D32',
                    '#a90000'
                ],
                borderWidth: 0
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
window.exportAllCharts = async () => {
    try {
        const zip = new JSZip();
        const folder = zip.folder("graficas_sisges");
        const date = new Date().toISOString().slice(0, 10);
        
        // Generar todas las gráficas
        await Promise.all(Object.keys(charts).map(async (chartId) => {
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
        const content = await zip.generateAsync({type: "blob"});
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
    link.download = `${fileName}_${new Date().toISOString().slice(0,10)}.png`;
    link.href = url;
    link.click();
};