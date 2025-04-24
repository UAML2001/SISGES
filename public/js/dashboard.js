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

let solicitudesSeguimiento = [];
let solicitudesValidadas = [];
let solicitudesVerificacion = [];
const itemsPerPage = 10;
let currentPageSeguimiento = 1;
let currentPageValidadas = 1;
let currentVerificacion = [];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Agregar estas constantes al inicio
const MAX_INITIAL_FILE_SIZE_MB = 10;
const MAX_INITIAL_FILE_SIZE_BYTES = MAX_INITIAL_FILE_SIZE_MB * 1024 * 1024;
// Actualizar constantes
const ALLOWED_INITIAL_EXTENSIONS = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'zip', 'rar'];
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'zip', 'rar'];

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
async function generarFolio() {
    const folioRef = ref(database, 'configuracion/ultimoFolio');
    const snapshot = await get(folioRef);
    const nuevoFolio = snapshot.val() + 1;
    await set(folioRef, nuevoFolio);
    return nuevoFolio.toString().padStart(4, '0');
}

// Función para cargar solicitudes validadas
function cargarValidadas() {
    const tabla = document.getElementById('lista-validadas');
    const filtroSecretaria = document.getElementById('filtro-secretaria-validadas');
    const solicitudesRef = ref(database, 'solicitudes');
    
    // Obtener rol del usuario
    const userRol = parseInt(getCookie('rol')) || 0;
    
    // Configurar visibilidad del filtro de secretarías
    if (userRol === 3) {
        filtroSecretaria.style.display = 'block';
        
        // Limpiar y establecer opciones
        filtroSecretaria.innerHTML = '<option value="">Todas las secretarías</option>';
        
        // Recorrer el mapa de dependencias ya validado
        Object.entries(dependenciasMap).forEach(([key, nombre]) => {
            // Validar nombre no vacío
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

    const q = query(
        solicitudesRef,
        orderByChild('estado'),
        equalTo('atendida')
    );
    
    onValue(q, (snapshot) => {
        solicitudesValidadas = [];
        const userDependencias = getCookie('dependencia') ? 
            decodeURIComponent(getCookie('dependencia')).split(',') : [];

        snapshot.forEach((childSnapshot) => {
            const solicitud = childSnapshot.val();
            solicitud.key = childSnapshot.key;
            
            // Validar datos requeridos
            if (!solicitud.dependencia || !dependenciasMap[solicitud.dependencia]) return;
            
            // Filtrar por dependencia si no es admin
            if (userRol !== 3 && !userDependencias.includes(solicitud.dependencia)) return;
            
            solicitudesValidadas.push(solicitud);
        });
        
        aplicarFiltrosValidadas();
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
            <td colspan="5" class="text-center py-4">
                <i class="fas fa-info-circle me-2"></i>
                No hay solicitudes validadas para mostrar
            </td>
        `;
        tabla.appendChild(tr);
        actualizarPaginacion('validadas', 0);
        return;
    }
    
    const items = data.slice(start, end);
    
    if (items.length === 0) {
        currentPageValidadas = Math.max(1, currentPageValidadas - 1);
        return mostrarPaginaValidadas(data);
    }
    
    items.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
        <td>${s.key}</td>
        <td>${s.asunto}</td>
        <td>${dependenciasMap[s.dependencia] || 'Desconocida'}</td>
        <td>${new Date(s.fechaAtencion).toLocaleDateString()}</td>
        <td>
           ${s.documentoInicial ? `
    <button class="btn btn-sm btn-info mb-1" 
            onclick="mostrarEvidenciaModal(
    '${s.key}',
    'Documento Inicial',
    '${s.documentoInicial}', // URL del documento
    '${dependenciasMap[s.dependencia]}' // Secretaría
)">
        <i class="fas fa-file-alt"></i> Inicial
    </button>
    ` : ''}
    ${s.evidencias ? `
    <button class="btn btn-sm btn-info mb-1" 
            onclick="mostrarEvidenciaModal(
    '${s.key}',
    'Evidencia',
    '${s.evidencias}', // URL de la evidencia
    '${dependenciasMap[s.dependencia]}' // Secretaría
)">
        <i class="fas fa-eye"></i> Evidencia
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
    
    const filtradas = solicitudesValidadas.filter(s => {
        const texto = `${s.key} ${s.asunto} ${dependenciasMap[s.dependencia]}`.toLowerCase();
        const coincideSecretaria = !secretaria || s.dependencia === secretaria;
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
    const select = document.getElementById('secretaria');
    
    // Obtener datos del usuario
    const userRol = parseInt(getCookie('rol')) || 0;
    const userDependencias = getCookie('dependencia') ? 
        decodeURIComponent(getCookie('dependencia')).split(',') : [];
    
    // Limpiar select
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

// Modificar la función cambiarEstado para hacerla global
let accionActual = '';

window.cambiarEstado = async function(folio, nuevoEstado) {
    try {
        const solicitudRef = ref(database, `solicitudes/${folio}`);
        const snapshot = await get(solicitudRef);
        const datos = snapshot.val();

        // Eliminar evidencia si se rechaza
        if(nuevoEstado === 'pendiente' && datos.evidencias) {
            try {
                // Extraer ruta del archivo desde la URL
                const urlEvidencia = datos.evidencias;
                const rutaCompleta = decodeURIComponent(urlEvidencia.split('/o/')[1].split('?')[0]);
                const evidenciaRef = storageRef(storage, rutaCompleta);
                
                await deleteObject(evidenciaRef);
            } catch(error) {
                console.error("Error eliminando evidencia:", error);
                throw new Error("No se pudo eliminar la evidencia");
            }
        }

        const actualizacion = {
            estado: nuevoEstado,
            evidencias: nuevoEstado === 'pendiente' ? null : datos.evidencias,
            fechaAtencion: nuevoEstado === 'atendida' ? new Date().toISOString() : null
        };

        await update(solicitudRef, actualizacion);

        // Actualizar vistas
        cargarSeguimiento();
        cargarVerificacion();
        cargarValidadas();
        actualizarEstadisticas(solicitudesSeguimiento);
        
        mostrarExito(`Evidencia de solicitud ${nuevoEstado === 'atendida' ? 'aprobada' : 'rechazada'} correctamente`);
        
    } catch(error) {
        console.error("Error:", error);
        mostrarError(`Error al procesar: ${error.message}`);
    } finally {
        folioActual = '';
        accionActual = '';
    }
};

// Configurar eventos para los modales
document.getElementById('confirmarAprobar').addEventListener('click', () => {
    if(folioActual && accionActual === 'aprobar') {
        cambiarEstado(folioActual, 'atendida');
        bootstrap.Modal.getInstance('#confirmarAprobarModal').hide();
    }
});

document.getElementById('confirmarRechazar').addEventListener('click', () => {
    if(folioActual && accionActual === 'rechazar') {
        cambiarEstado(folioActual, 'pendiente');
        bootstrap.Modal.getInstance('#confirmarRechazarModal').hide();
    }
});

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
        await uploadBytes(refArchivo, file, metadata);
        const urlDescarga = await getDownloadURL(refArchivo);

        await update(ref(database, `solicitudes/${folioActual}`), {
            estado: 'verificacion',
            fechaVerificacion: new Date().toISOString(),
            evidencias: urlDescarga
        });

        // 4. Limpiar y cerrar
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
    const solicitudesRef = query(ref(database, 'solicitudes'), orderByChild('estado'), equalTo('verificacion'));
    
    onValue(solicitudesRef, (snapshot) => {
        const solicitudes = [];
        snapshot.forEach((childSnapshot) => {
            const solicitud = childSnapshot.val();
            solicitud.key = childSnapshot.key;
            solicitudes.push(solicitud);
        });
        mostrarPaginaVerificacion(solicitudes);
    });
}

function mostrarPaginaVerificacion(data) {
    const tabla = document.getElementById('lista-verificacion');
    tabla.innerHTML = data.length > 0 ? '' : `
        <tr>
            <td colspan="6" class="text-center py-4">
                <i class="fas fa-info-circle me-2"></i>
                No hay solicitudes pendientes de verificación
            </td>
        </tr>`;

    data.forEach(solicitud => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${solicitud.key}</td>
            <td>${solicitud.asunto}</td>
            <td>${dependenciasMap[solicitud.dependencia] || 'Desconocida'}</td>
            <td>${new Date(solicitud.fechaVerificacion).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-sm btn-info me-2" 
                    onclick="mostrarEvidenciaModal(
    '${solicitud.key}',
    'Documento Inicial',
    '${solicitud.documentoInicial}', // URL del documento
    '${dependenciasMap[solicitud.dependencia]}' // Secretaría
)">
                    <i class="fas fa-file-alt"></i> Inicial
                </button>
                <button class="btn btn-sm btn-info" 
                  onclick="mostrarEvidenciaModal(
    '${solicitud.key}',
    'Evidencia',
    '${solicitud.evidencias}', // URL de la evidencia
    '${dependenciasMap[solicitud.dependencia]}' // Secretaría
)">
                    <i class="fas fa-eye"></i> Evidencia
                </button>
            </td>
            <td>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-success" 
    onclick="mostrarConfirmacion('${solicitud.key}', 'aprobar')">
    <i class="fas fa-check"></i> Aprobar
</button>
<button class="btn btn-sm btn-danger" 
    onclick="mostrarConfirmacion('${solicitud.key}', 'rechazar')">
    <i class="fas fa-times"></i> Rechazar
</button>
                </div>
            </td>`;
        tabla.appendChild(tr);
    });
}

window.mostrarConfirmacion = function(folio, accion) {
    folioActual = folio;
    accionActual = accion;
    
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
            fileInfo.textContent = 'Formatos permitidos: PDF, DOC, DOCX, JPG, PNG, ZIP, RAR (Máx. 5MB)';
            removeBtn.classList.add('d-none');
            return;
        }
        
        if(file.size > MAX_INITIAL_FILE_SIZE_BYTES) {
            mostrarError(`El archivo excede el tamaño máximo de ${MAX_INITIAL_FILE_SIZE_MB}MB`);
            this.value = '';
            fileInfo.textContent = 'Formatos permitidos: PDF, DOC, DOCX, JPG, PNG, ZIP, RAR (Máx. 5MB)';
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
        fileInfo.textContent = 'Formatos permitidos: PDF, DOC, DOCX, JPG, PNG, ZIP, RAR (Máx. 5MB)';
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

    // Modificar la línea donde se obtiene el estado
    const estado = estados[solicitud.estado] || { texto: 'Desconocido', color: '#666' } 
    const dependenciaNombre = dependenciasMap[solicitud.dependencia] || 'Desconocida';
    // Determinar si está en verificación
    const enVerificacion = estadoActual === 'verificacion';

    tr.innerHTML = `
        <td>${solicitud.key}</td>
        <td>${solicitud.tiposolicitud}</td>
        <td>${solicitud.asunto}</td>
        <td>${dependenciaNombre}</td>
        <td><span class="status-badge" style="background:${estado.color}">${estado.texto}</span></td>
        <td>${solicitud.estado === 'atendida' ? 'Atendida' : calcularTiempoRestante(solicitud.fechaLimite)}</td>
        <td>
            <div class="d-flex gap-2">
             ${solicitud.documentoInicial ? `
                <button class="btn btn-sm btn-info" 
                        onclick="mostrarDocumentoInicial(
                            '${solicitud.key}', 
                            '${solicitud.nombreDocumento}', 
                            '${solicitud.documentoInicial}'
                        )">
                    <i class="fas fa-file-alt me-1"></i>Ver Documento
                </button>
                ` : ''}
                <button class="btn btn-sm btn-warning" 
                    ${enVerificacion ? 'disabled' : ''}
                    onclick="mostrarConfirmacionProceso('${solicitud.key}')">
                    <i class="fas fa-sync-alt"></i> Marcar "En Proceso"
                </button>
                
                <button class="btn btn-sm btn-success" 
                    ${enVerificacion ? 'disabled' : ''}
                    onclick="mostrarConfirmacionAtendida('${solicitud.key}')">
                    <i class="fas fa-check-circle"></i> Mandar a Verificación
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
    const solicitudesRef = ref(database, 'solicitudes');
    const snapshot = await get(solicitudesRef);
    
    const updates = {};
    const ahora = new Date();
    
    snapshot.forEach((childSnapshot) => {
        const solicitud = childSnapshot.val();
        if(['atendida', 'en_proceso'].includes(solicitud.estado)) return;

        const dias = calcularDiasRestantes(solicitud.fechaLimite);
        let nuevoEstado = solicitud.estado;
        
        // Lógica mejorada para manejar cambios de estado
        if(dias < 0) {
            nuevoEstado = 'atrasada';
        } else if(dias <= 3) {
            nuevoEstado = 'por_vencer';
        }
        
        if(nuevoEstado !== solicitud.estado) {
            updates[`solicitudes/${childSnapshot.key}/estado`] = nuevoEstado;
            updates[`solicitudes/${childSnapshot.key}/ultimaActualizacion`] = ahora.toISOString();
        }
    });
    
    if(Object.keys(updates).length > 0) {
        await update(ref(database), updates);
    }
}

// Ejecutar cada hora y al cargar la página
setInterval(actualizarEstadosAutomaticos, 3600000);
document.addEventListener('DOMContentLoaded', actualizarEstadosAutomaticos);

function cargarSeguimiento() {
    const tabla = document.getElementById('lista-seguimiento');
    const solicitudesRef = query(ref(database, 'solicitudes'), orderByChild('fechaCreacion'));
    
    onValue(solicitudesRef, (snapshot) => {
        const solicitudes = [];
        const foliosUnicos = new Set();
        tabla.innerHTML = '';
        
        // Obtener datos del usuario
        solicitudesSeguimiento = [];
        const userRol = parseInt(getCookie('rol')) || 0;
        const userDependencias = getCookie('dependencia') ? 
            decodeURIComponent(getCookie('dependencia')).split(',') : [];

            snapshot.forEach((childSnapshot) => {
                const solicitud = childSnapshot.val();
                solicitud.key = childSnapshot.key;
            
            // Filtrar por dependencia si no es admin
            if (userRol !== 3 && !userDependencias.includes(solicitud.dependencia)) {
                return;  
            }

            if(!foliosUnicos.has(solicitud.key)) {
                foliosUnicos.add(solicitud.key);
                solicitudes.push(solicitud);
                tabla.appendChild(crearFilaSolicitud(solicitud));
            }

            solicitudesSeguimiento.push(solicitud);
        });
        
        solicitudes.sort((a, b) => 
            new Date(b.fechaCreacion) - new Date(a.fechaCreacion)
        );
        
        aplicarFiltrosSeguimiento();
        actualizarEstadisticas(solicitudesSeguimiento);
        actualizarGrafica(solicitudesSeguimiento);
        iniciarActualizacionTiempo();
    });
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
            'Formatos permitidos: PDF, DOC, DOCX, JPG, PNG, ZIP, RAR (Máx. 5MB)';
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
    
    if(myChart) {
        myChart.destroy();
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

    myChart = new Chart(ctx, {
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

    switch (role) {
        case 1:
            nuevaLi.style.display = userDependencias.length > 0 ? 'block' : 'none';
            seguimientoLi.style.display = 'block';
            validadasLi.style.display = 'none';
            verificacionLi.style.display = 'none';
            break;
        case 2:
            nuevaLi.style.display = 'none';
            seguimientoLi.style.display = 'block';
            validadasLi.style.display = 'block';
            verificacionLi.style.display = 'none';
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
        <option>Audiencias ciudadanas</option>
        <option>Audiencias comunitarias</option>
        <option>Audiencias virtuales</option>
        <option>Recorridos</option>
        <option>Redes sociales</option>
        <option>Oficios</option>
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

    // Sistema de pestañas
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');

    function switchTab(contentId) {
        contentSections.forEach(section => {
            section.style.display = 'none';
        });

        const activeSection = document.getElementById(`${contentId}-content`);
        if (activeSection) {
            activeSection.style.display = 'block';
        }

        localStorage.setItem('activeTab', contentId);
    }

    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
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