import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    get, 
    set, 
    update,  // <- Agregar esta importación
    onValue,
    query,
    orderByChild 
  } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAzn1em_8w5XsRaJ6mR5gpv93ZtCA-erGE",
    authDomain: "prediapp-81350.firebaseapp.com",
    databaseURL: "https://sisges.firebaseio.com/",
    projectId: "prediapp-81350",
    storageBucket: "prediapp-81350.firebasestorage.app",
    messagingSenderId: "649258621251",
    appId: "1:649258621251:web:54558939330b1e01d777f6",
    measurementId: "G-PBV4WW41D6"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

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

async function cargarSecretarias() {
    const secretariasRef = ref(database, 'dependencias');
    const snapshot = await get(secretariasRef);
    const select = document.getElementById('secretaria');
    
    select.innerHTML = '<option value="">Seleccionar...</option>';
    
    snapshot.forEach((childSnapshot) => {
        const dependencia = childSnapshot.val();
        const option = document.createElement('option');
        option.value = dependencia.nombre;
        option.textContent = dependencia.nombre;
        select.appendChild(option);
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
    const ahora = new Date();
    const estadisticas = {
        pendientes: 0,
        porVencer: 0,
        enProceso: 0,
        atendidas: 0,
        atrasadas: 0,
        esteMes: 0,
        total: 0
    };

    solicitudes.forEach(solicitud => {
        estadisticas.total++;
        const fechaCreacion = new Date(solicitud.fechaCreacion);
        
        switch(solicitud.estado) {
            case 'pendiente':
                estadisticas.pendientes++;
                break;
            case 'por_vencer':
                estadisticas.porVencer++;
                break;
            case 'en_proceso':
                estadisticas.enProceso++;
                break;
            case 'atrasada':
                estadisticas.atrasadas++;
                break;
            case 'atendida':
                estadisticas.atendidas++;
                if(fechaCreacion.getMonth() === ahora.getMonth() && 
                   fechaCreacion.getFullYear() === ahora.getFullYear()) {
                    estadisticas.esteMes++;
                }
                break;
        }
    });

    // Actualizar todos los elementos del DOM
    document.getElementById('stats-pendientes').textContent = estadisticas.pendientes;
    document.getElementById('stats-vencer').textContent = estadisticas.porVencer;
    document.getElementById('stats-en-proceso').textContent = estadisticas.enProceso;
    document.getElementById('stats-atendidas').textContent = estadisticas.atendidas;
    document.getElementById('stats-atrasadas').textContent = estadisticas.atrasadas;
    
    const eficiencia = estadisticas.atendidas / (estadisticas.total || 1) * 100;
    document.getElementById('stats-eficiencia').textContent = `${Math.round(eficiencia)}%`;
    
    document.querySelector('#dashboard-content .stats-card:nth-child(3) small').innerHTML = `
        <i class="fas fa-check-circle"></i> Este mes: ${estadisticas.esteMes}
    `;
}

// Modificar la función cambiarEstado para hacerla global
window.cambiarEstado = async function(folio, nuevoEstado) {
    try {
        await set(ref(database, `solicitudes/${folio}/estado`), nuevoEstado);
        
        // Elimina esta línea
        // bootstrap.Modal.getInstance(document.getElementById('statusModal')).hide();
        
        cargarSeguimiento();
        
        Toastify({
            text: "Estado actualizado correctamente",
            className: "toastify-success",
            duration: 3000
        }).showToast();
    } catch (error) {
        console.error("Error al actualizar estado:", error);
        Toastify({
            text: "Error al actualizar el estado",
            className: "toastify-error",
            duration: 3000
        }).showToast();
    }
};

const estados = {
    'pendiente': {texto: 'Pendiente', color: '#491F42'},
    'por_vencer': {texto: 'Por Vencer', color: '#720F36'},
    'en_proceso': {texto: 'En Proceso', color: '#ae9074'},
    'atendida': {texto: 'Atendida', color: '#2E7D32'},
    'atrasada': {texto: 'Atrasada', color: '#a90000'}
};

// Modificar función crearFilaSolicitud
function crearFilaSolicitud(solicitud) {
    const tr = document.createElement('tr');
    tr.dataset.fechaLimite = solicitud.fechaLimite;
    tr.dataset.estado = solicitud.estado;
    
    const estado = estados[solicitud.estado] || {texto: 'Desconocido', color: '#666'};
    
    tr.innerHTML = `
        <td>${solicitud.key}</td>
        <td>${solicitud.asunto}</td>
        <td>${solicitud.dependencia}</td>
        <td><span class="status-badge" style="background:${estado.color}">${estado.texto}</span></td>
        <td>${solicitud.estado === 'atendida' ? 'Atendida' : calcularTiempoRestante(solicitud.fechaLimite)}</td>
        <td>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-warning" onclick="mostrarConfirmacionProceso('${solicitud.key}')">
                    <i class="fas fa-sync-alt"></i> En Proceso
                </button>
                <button class="btn btn-sm btn-success" onclick="mostrarConfirmacionAtendida('${solicitud.key}')">
                    <i class="fas fa-check-circle"></i> Atendida
                </button>
            </div>
        </td>
    `;
    return tr;
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
        
        snapshot.forEach((childSnapshot) => {
            const solicitud = childSnapshot.val();
            solicitud.key = childSnapshot.key;
            
            if(!foliosUnicos.has(solicitud.key)) {
                foliosUnicos.add(solicitud.key);
                solicitudes.push(solicitud);
                tabla.appendChild(crearFilaSolicitud(solicitud));
            }
        });
        
        // Ordenar por fecha más reciente primero
        solicitudes.sort((a, b) => 
            new Date(b.fechaCreacion) - new Date(a.fechaCreacion)
        );
        
        actualizarEstadisticas(solicitudes);
        actualizarGrafica(solicitudes);
        iniciarActualizacionTiempo();
    });
}

// Manejo del formulario
document.getElementById('formNuevaSolicitud').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    
    const camposRequeridos = [
        'receptor', 'canal', 'nombre', 
        'colonia', 'telefono', 'asunto', 
        'secretaria'
    ];
    
    let validado = true;
    
    camposRequeridos.forEach(id => {
        const campo = document.getElementById(id);
        if(!campo.value.trim()) {
            validado = false;
            Toastify({
                text: `El campo ${campo.labels[0].textContent} es requerido`,
                className: "toastify-error",
                duration: 3000
            }).showToast();
        }
    });

    const telefono = document.getElementById('telefono');
    if(!/^\d{10}$/.test(telefono.value)) {
        validado = false;
        Toastify({
            text: "El teléfono debe tener 10 dígitos",
            className: "toastify-error",
            duration: 3000
        }).showToast();
    }

    if(!validado) return;

    const fechaCreacion = new Date().toISOString();
    
    const nuevaSolicitud = {
        fechaCreacion: fechaCreacion,
        tipo: document.getElementById('canal').value,
        receptor: document.getElementById('receptor').value,
        dependencia: document.getElementById('secretaria').value,
        estado: 'pendiente', // Estado inicial como "Pendiente"
        solicitante: {
            nombre: document.getElementById('nombre').value,
            colonia: document.getElementById('colonia').value,
            telefono: document.getElementById('telefono').value
        },
        asunto: document.getElementById('asunto').value,
        comentarios: document.getElementById('comentarios').value,
        fechaLimite: calcularFechaLimite(fechaCreacion)
    };

    try {
        const folio = await generarFolio();
        await set(ref(database, `solicitudes/${folio}`), nuevaSolicitud);
        Toastify({
            text: "Solicitud creada exitosamente!",
            className: "toastify-success",
            duration: 3000
        }).showToast();
        form.reset();
        document.getElementById('fecha').value = obtenerFechaHoy();
    } catch (error) {
        console.error("Error al guardar:", error);
        Toastify({
            text: "Error al crear la solicitud",
            className: "toastify-error",
            duration: 3000
        }).showToast();
    }
});

// Añadir al inicio con las constantes
const coloresEstatus = {
    pendiente: '#491F42',
    vencer: '#720F36',
    en_progreso: '#ae9074',
    atendida: '#2E7D32',
    atrasado: '#a90000'
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
        atendida: new Array(tiposSolicitud.length).fill(0)
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
        atrasada: '#a90000'
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

// Sistema de navegación y UI
document.addEventListener('DOMContentLoaded', function () {
    checkSession();
    showUserInfo();
    setupLogout();
    cargarSecretarias();
    cargarSeguimiento();

    // Obtener rol del usuario
    const role = parseInt(getCookie('rol')) || 0;

    // Ocultar/mostrar pestañas según rol
    const nuevaLi = document.querySelector('a[data-content="nueva"]').parentElement;
    const seguimientoLi = document.querySelector('a[data-content="seguimiento"]').parentElement;
    const validadasLi = document.querySelector('a[data-content="validadas"]').parentElement;

    switch (role) {
        case 1:
            nuevaLi.style.display = 'block';
            seguimientoLi.style.display = 'block';
            validadasLi.style.display = 'none';
            break;
        case 2:
            nuevaLi.style.display = 'none';
            seguimientoLi.style.display = 'block';
            validadasLi.style.display = 'block';
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