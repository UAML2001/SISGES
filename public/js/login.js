import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

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

// Esperar a que el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Elementos del DOM
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const togglePassword = document.getElementById('togglePassword');
    const loginForm = document.getElementById('loginForm');
    const spinner = document.getElementById('loadingSpinner');
    const buttonText = document.getElementById('buttonText');

    // Validar que todos los elementos existan
    if (!emailInput || !passwordInput || !togglePassword || !loginForm || !spinner || !buttonText) {
        console.error('Error: Elementos del DOM no encontrados');
        return;
    }

    document.addEventListener('DOMContentLoaded', () => {
        const passwordInput = document.getElementById('password');
        const togglePassword = document.getElementById('togglePassword');

        // Mostrar/Ocultar Contraseña
        togglePassword.addEventListener('click', () => {
            // Cambiar el tipo del campo de contraseña
            passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';

            // Cambiar el ícono del ojo
            togglePassword.classList.toggle('fa-eye');
            togglePassword.classList.toggle('fa-eye-slash');
        });
    });

    // Función de validación de email
    const validarEmail = (email) => /^[^\s@]+@tizayuca\.gob\.mx$/.test(email);

    // Manejador de login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        // Validaciones
        if (!email || !password) {
            mostrarNotificacion('✖️ Todos los campos son requeridos', 'error');
            return;
        }

        if (!validarEmail(email)) {
            mostrarNotificacion('✖️ Solo correos oficiales (@tizayuca.gob.mx)', 'error');
            return;
        }

        try {
            spinner.classList.remove('d-none');

            const usersRef = ref(database, 'usuarios');
            const snapshot = await get(usersRef);
            let usuarioValido = false;
            let usuarioData = null;

            snapshot.forEach((childSnapshot) => {
                const user = childSnapshot.val();
                if (user.email === email && user.password === password) {
                    usuarioValido = true;
                    usuarioData = user;
                }
            });

            if (usuarioValido && usuarioData) {
                // Crear sesión de 10 minutos
                const fechaExpiracion = new Date();
                fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 10);

                // Crear cookies con misma fecha de expiración
                const expiresUTC = fechaExpiracion.toUTCString();

                document.cookie = `session=${usuarioData.uid}; expires=${expiresUTC}; path=/`;
                document.cookie = `nombre=${encodeURIComponent(usuarioData.nombre)}; expires=${expiresUTC}; path=/`;
                document.cookie = `rol=${encodeURIComponent(usuarioData.rol)}; expires=${expiresUTC}; path=/`;
                document.cookie = `expires=${expiresUTC}; expires=${expiresUTC}; path=/`;

                mostrarNotificacion(' Acceso autorizado', 'success');
                setTimeout(() => window.location.href = 'dashboard.html', 1500);
            } else {
                mostrarNotificacion('🔐 Credenciales incorrectas', 'error');
            }

        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion('⚠️ Error en el servidor', 'error');
        } finally {
            spinner.classList.add('d-none');
        }
    });

    function mostrarNotificacion(mensaje, tipo) {
        Toastify({
            text: mensaje,
            duration: 3000,
            gravity: "top",
            position: "right",
            style: {
                background: tipo === 'error' ? '#dc3545' : '#28a745',
                color: '#fff',
                fontWeight: '500',
                borderRadius: '8px',
                boxShadow: '0 3px 6px rgba(0, 0, 0, 0.1)'
            }
        }).showToast();
    }
});
 
 
 // Toggle de contraseña mejorado
 document.getElementById('togglePassword').addEventListener('click', function(e) {
    e.preventDefault();
    const passwordInput = document.getElementById('password');
    const isPassword = passwordInput.type === 'password';
    
    passwordInput.type = isPassword ? 'text' : 'password';
    this.classList.replace(isPassword ? 'fa-eye' : 'fa-eye-slash', 
                         isPassword ? 'fa-eye-slash' : 'fa-eye');
});

// Animación de carga
document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const btn = this.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.querySelector('.spinner-border').classList.remove('d-none');
    
    setTimeout(() => {
        btn.disabled = false;
        btn.querySelector('.spinner-border').classList.add('d-none');
    }, 2000);
});

particlesJS('particles', {
    particles: {
      number: { value: 80 },
      color: { value: '#720f36' },
      opacity: { value: 0.5 },
      size: { value: 3 },
      line_linked: {
        color: '#720f36',
        opacity: 0.4,
        width: 1,
        enable: true
      },
      move: {
        enable: true,
        speed: 0.5,
        direction: 'none',
        random: true,
        straight: false,
        out_mode: 'out',
        bounce: false,
        attract: {
          enable: true,
          rotateX: 600,
          rotateY: 1200
        }
      }
    },
    interactivity: {
      detect_on: 'canvas',
      events: {
        onhover: {
          enable: true,
          mode: 'repulse'
        },
        onclick: {
          enable: true,
          mode: 'push'
        },
        resize: true
      },
      modes: {
        repulse: {
          distance: 100,
          duration: 0.4
        },
        push: {
          particles_nb: 4
        }
      }
    },
    retina_detect: true
  });

// Efecto de movimiento con el mouse para las partículas
document.addEventListener('mousemove', (e) => {
  const particles = window.pJSDom[0].pJS.particles;
  particles.array.forEach(p => {
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 100) {
      p.vx += (dx / distance) * 0.1;
      p.vy += (dy / distance) * 0.1;
    }
  });
});

